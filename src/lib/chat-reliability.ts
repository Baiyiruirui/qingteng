import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { events } from '@/db/schema'
import {
  appendAssistantMessageOnce,
  type PersistedMessage,
} from '@/db/repositories/messages'
import { redis } from '@/lib/redis'

const TURN_LOCK_TTL_SECONDS = 180
const MAX_TURN_LOCK_LEASE_SECONDS = 10 * 60
const RECOVERY_LOCK_TTL_SECONDS = 30
const RECOVERY_TTL_SECONDS = 60 * 60 * 24 * 7
const RECOVERY_INDEX_TTL_SECONDS = RECOVERY_TTL_SECONDS + 60 * 60 * 24
const MAX_RECOVERIES_PER_REQUEST = 5

type ReliabilityLock = {
  key: string
  token: string
}

export type ChatRecoveryRecord = {
  version: 1
  reliabilityKey: string
  mode: 'chat' | 'roleplay'
  userId: string
  conversationId: string
  clientMessageId: string
  assistant: {
    content: string
    meta: Record<string, unknown>
  }
  event: {
    type: 'chat' | 'immersion'
    poemId?: string
    score?: number
    meta: Record<string, unknown>
  }
  createdAt: string
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('base64url')
}

function turnLockKey(conversationId: string, clientMessageId: string) {
  return `qingteng:chat:turn-lock:${digest(`${conversationId}:${clientMessageId}`)}`
}

function recoveryKey(conversationId: string, clientMessageId: string) {
  return `qingteng:chat:recovery:${digest(`${conversationId}:${clientMessageId}`)}`
}

function recoveryIndexKey(userId: string) {
  return `qingteng:chat:recovery-index:${userId}`
}

function recoveryLockKey(reliabilityKey: string) {
  return `qingteng:chat:recovery-lock:${digest(reliabilityKey)}`
}

async function acquireLock(key: string, ttlSeconds: number): Promise<ReliabilityLock | null> {
  const token = randomUUID()
  const result = await redis.set(key, token, { nx: true, ex: ttlSeconds })
  return result === 'OK' ? { key, token } : null
}

export async function acquireTurnLock(
  conversationId: string,
  clientMessageId: string,
): Promise<ReliabilityLock | null> {
  return acquireLock(turnLockKey(conversationId, clientMessageId), TURN_LOCK_TTL_SECONDS)
}

export function startTurnLockHeartbeat(lock: ReliabilityLock) {
  let refreshing = false
  const startedAt = Date.now()
  const interval = setInterval(async () => {
    if (Date.now() - startedAt >= MAX_TURN_LOCK_LEASE_SECONDS * 1_000) {
      clearInterval(interval)
      return
    }
    if (refreshing) return
    refreshing = true
    try {
      await redis.eval(
        `if redis.call('GET', KEYS[1]) == ARGV[1] then
           return redis.call('EXPIRE', KEYS[1], ARGV[2])
         end
         return 0`,
        [lock.key],
        [lock.token, TURN_LOCK_TTL_SECONDS],
      )
    } catch (error) {
      console.error('[chat reliability] turn lock heartbeat failed:', error)
    } finally {
      refreshing = false
    }
  }, Math.floor((TURN_LOCK_TTL_SECONDS * 1_000) / 3))

  interval.unref?.()
  return () => clearInterval(interval)
}

export async function releaseReliabilityLock(lock: ReliabilityLock | null) {
  if (!lock) return

  await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then
       return redis.call('DEL', KEYS[1])
     end
     return 0`,
    [lock.key],
    [lock.token],
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRecoveryRecord(value: unknown): ChatRecoveryRecord | null {
  let candidate = value
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return null
    }
  }
  if (!isRecord(candidate) || candidate.version !== 1) return null
  if (candidate.mode !== 'chat' && candidate.mode !== 'roleplay') return null
  if (
    typeof candidate.reliabilityKey !== 'string'
    || typeof candidate.userId !== 'string'
    || typeof candidate.conversationId !== 'string'
    || typeof candidate.clientMessageId !== 'string'
    || typeof candidate.createdAt !== 'string'
    || !isRecord(candidate.assistant)
    || typeof candidate.assistant.content !== 'string'
    || !isRecord(candidate.assistant.meta)
    || !isRecord(candidate.event)
    || (candidate.event.type !== 'chat' && candidate.event.type !== 'immersion')
    || !isRecord(candidate.event.meta)
  ) {
    return null
  }

  return candidate as ChatRecoveryRecord
}

async function ensureEvent(record: ChatRecoveryRecord) {
  const [existing] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.userId, record.userId),
        sql`${events.meta} ->> 'reliabilityKey' = ${record.reliabilityKey}`,
      ),
    )
    .limit(1)

  if (existing) return

  await db.insert(events).values({
    userId: record.userId,
    type: record.event.type,
    poemId: record.event.poemId,
    score: record.event.score,
    meta: {
      ...record.event.meta,
      reliabilityKey: record.reliabilityKey,
      clientMessageId: record.clientMessageId,
    },
  })
}

export async function persistAssistantAndEvent(record: ChatRecoveryRecord) {
  const assistant = await appendAssistantMessageOnce({
    conversationId: record.conversationId,
    clientMessageId: record.clientMessageId,
    content: record.assistant.content,
    meta: {
      ...record.assistant.meta,
      reliabilityKey: record.reliabilityKey,
    },
  })
  await ensureEvent(record)
  return assistant.message
}

export async function queueChatRecovery(record: ChatRecoveryRecord) {
  const key = recoveryKey(record.conversationId, record.clientMessageId)
  const indexKey = recoveryIndexKey(record.userId)

  await redis.eval(
    `redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
     redis.call('SADD', KEYS[2], KEYS[1])
     redis.call('EXPIRE', KEYS[2], ARGV[3])
     return 1`,
    [key, indexKey],
    [JSON.stringify(record), RECOVERY_TTL_SECONDS, RECOVERY_INDEX_TTL_SECONDS],
  )
}

async function clearRecovery(record: ChatRecoveryRecord) {
  const key = recoveryKey(record.conversationId, record.clientMessageId)
  const indexKey = recoveryIndexKey(record.userId)
  await redis.eval(
    `redis.call('DEL', KEYS[1])
     redis.call('SREM', KEYS[2], KEYS[1])
     return 1`,
    [key, indexKey],
    [],
  )
}

export async function getQueuedRecovery(
  conversationId: string,
  clientMessageId: string,
): Promise<ChatRecoveryRecord | null> {
  const value = await redis.get<unknown>(recoveryKey(conversationId, clientMessageId))
  return parseRecoveryRecord(value)
}

async function flushRecoveryRecord(record: ChatRecoveryRecord) {
  const lock = await acquireLock(
    recoveryLockKey(record.reliabilityKey),
    RECOVERY_LOCK_TTL_SECONDS,
  )
  if (!lock) return false

  try {
    await persistAssistantAndEvent(record)
    await clearRecovery(record)
    return true
  } finally {
    await releaseReliabilityLock(lock).catch(error => {
      console.error('[chat reliability] recovery lock release failed:', error)
    })
  }
}

export async function flushChatRecoveries(userId: string) {
  const indexKey = recoveryIndexKey(userId)
  const keys = await redis.smembers<string[]>(indexKey)

  for (const key of keys.slice(0, MAX_RECOVERIES_PER_REQUEST)) {
    const record = parseRecoveryRecord(await redis.get<unknown>(key))
    if (!record || record.userId !== userId) {
      await redis.srem(indexKey, key)
      continue
    }

    try {
      await flushRecoveryRecord(record)
    } catch (error) {
      console.error('[chat reliability] recovery flush failed:', error)
    }
  }
}

export function createReliabilityKey(
  mode: 'chat' | 'roleplay',
  conversationId: string,
  clientMessageId: string,
) {
  return `${mode}:${conversationId}:${clientMessageId}`
}

export function replayAssistantMessage(message: Pick<PersistedMessage, 'id' | 'content'>) {
  const textPartId = `text-${message.id}`
  const stream = createUIMessageStream({
    generateId: () => message.id,
    execute: ({ writer }) => {
      writer.write({ type: 'start', messageId: message.id })
      writer.write({ type: 'start-step' })
      writer.write({ type: 'text-start', id: textPartId })
      writer.write({ type: 'text-delta', id: textPartId, delta: message.content })
      writer.write({ type: 'text-end', id: textPartId })
      writer.write({ type: 'finish-step' })
      writer.write({ type: 'finish', finishReason: 'stop' })
    },
    onError: () => '回复恢复失败，请稍后重试',
  })

  return createUIMessageStreamResponse({
    stream,
    headers: { 'X-Qingteng-Replayed': '1' },
  })
}

export function replayQueuedAssistant(record: ChatRecoveryRecord) {
  return replayAssistantMessage({
    id: digest(record.reliabilityKey).slice(0, 32),
    content: record.assistant.content,
  })
}
