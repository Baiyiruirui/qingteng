import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_MEMORY_PREFERENCES,
  MEMORY_RETENTION_OPTIONS,
  memoryRetentionCutoff,
  normalizeMemoryPreferences,
} from './preferences-policy'
import {
  shouldSkipMemoryExtraction,
  userTextFromChatTranscript,
} from './extraction-policy'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function occurrences(content: string, token: string): number {
  return content.split(token).length - 1
}

function main() {
  assert(
    JSON.stringify(MEMORY_RETENTION_OPTIONS) === JSON.stringify([30, 90, 180, 365]),
    'retention options must remain explicit and bounded',
  )
  assert(DEFAULT_MEMORY_PREFERENCES.memoryEnabled, 'Memory should be enabled by default')
  assert(
    DEFAULT_MEMORY_PREFERENCES.retentionDays === 180,
    'default retention should be a conservative six months',
  )

  const normalized = normalizeMemoryPreferences({ memoryEnabled: false, retentionDays: 90 })
  assert(!normalized.memoryEnabled, 'stored pause should be preserved')
  assert(normalized.retentionDays === 90, 'supported retention should be preserved')
  assert(
    normalizeMemoryPreferences({ retentionDays: 7 }).retentionDays === 180,
    'unsupported retention should fall back safely',
  )

  const cutoff = memoryRetentionCutoff(30, new Date('2026-07-16T00:00:00.000Z'))
  assert(
    cutoff.toISOString() === '2026-06-16T00:00:00.000Z',
    'retention cutoff should use whole 24-hour days',
  )

  assert(shouldSkipMemoryExtraction('好的，谢谢老师'), 'pure acknowledgements should skip AI')
  assert(shouldSkipMemoryExtraction('青藤先生，晚安'), 'pure greetings should skip AI')
  assert(!shouldSkipMemoryExtraction('我很孤独'), 'short emotional signals must reach extraction')
  assert(!shouldSkipMemoryExtraction('我不喜欢背诵'), 'short preferences must reach extraction')
  assert(!shouldSkipMemoryExtraction('这句我看不懂'), 'short confusion signals must reach extraction')
  assert(
    userTextFromChatTranscript('小明: 我很孤独\n青藤: 我在这里。') === '我很孤独',
    'chat transcript filtering must inspect the user utterance only',
  )

  const shortTerm = source('src/ai/memory/short-term.ts')
  assert(
    occurrences(shortTerm, 'isMemoryEnabled(userId)') >= 2,
    'short-term reads and writes must both honor pause',
  )

  const buildContext = source('src/ai/memory/build-context.ts')
  assert(
    buildContext.includes("if (!(await isMemoryEnabled(userId))) return ''"),
    'mid-term context injection must honor pause',
  )

  const longTerm = source('src/ai/memory/long-term.ts')
  assert(
    occurrences(longTerm, 'isMemoryEnabled(') >= 6,
    'recall and both extraction paths must check pause before work and storage',
  )
  assert(
    occurrences(longTerm, 'AI_GENERATION_BUDGETS.memoryExtraction') === 2,
    'both Memory generation paths must share the extraction budget',
  )
  assert(
    longTerm.includes('cleanupExpiredMemories'),
    'long-term retrieval and storage must enforce retention',
  )
  assert(
    !longTerm.includes('queryText.slice') && !longTerm.includes('m.content.slice'),
    'recall logs must not include query or Memory content',
  )

  const management = source('src/ai/memory/manage.ts')
  assert(
    occurrences(management, 'eq(memories.userId, userId)') >= 4,
    'all management queries must remain owner-scoped',
  )

  const collectionRoute = source('src/app/api/memories/route.ts')
  const itemRoute = source('src/app/api/memories/[id]/route.ts')
  assert(
    collectionRoute.includes('getSession()') && itemRoute.includes('getSession()'),
    'Memory collection and item APIs must require authentication',
  )
  assert(
    collectionRoute.includes('chatsDeleted: false') && itemRoute.includes('chatsDeleted: false'),
    'delete responses must preserve the original-chat contract',
  )

  const manager = source('src/components/MemoryManager.tsx')
  assert(
    manager.includes('都不会删除你的对话和学习记录'),
    'profile UI must distinguish Memory from original records',
  )

  console.log('Memory control checks passed: 21/21')
}

main()
