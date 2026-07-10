import 'server-only'

import type { UIMessage } from 'ai'

export const MAX_CHAT_MESSAGES = 50
export const MAX_USER_MESSAGE_CHARS = 2_000
export const MAX_ASSISTANT_MESSAGE_CHARS = 6_000
export const MAX_CHAT_CONTEXT_CHARS = 24_000

type ParsedMessages = {
  messages: UIMessage[]
  lastUserText: string
}

type ParseResult =
  | { success: true; data: ParsedMessages }
  | { success: false; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseUiMessages(value: unknown): ParseResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { success: false, message: '消息列表不能为空' }
  }
  if (value.length > MAX_CHAT_MESSAGES) {
    return { success: false, message: '这段对话已经很长了，请新开一个对话继续' }
  }

  const messages: UIMessage[] = []
  let totalChars = 0

  for (const [index, rawMessage] of value.entries()) {
    if (!isRecord(rawMessage)) {
      return { success: false, message: '消息格式不正确' }
    }

    const role = rawMessage.role
    if (role !== 'user' && role !== 'assistant') {
      return { success: false, message: '消息角色不正确' }
    }
    if (!Array.isArray(rawMessage.parts)) {
      return { success: false, message: '消息内容格式不正确' }
    }

    const text = rawMessage.parts
      .filter(isRecord)
      .filter(part => part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text as string)
      .join('')

    if (!text.trim()) {
      return { success: false, message: '消息内容不能为空' }
    }
    const maxMessageChars = role === 'user'
      ? MAX_USER_MESSAGE_CHARS
      : MAX_ASSISTANT_MESSAGE_CHARS
    if (text.length > maxMessageChars) {
      return { success: false, message: `单条消息不能超过 ${maxMessageChars} 字` }
    }

    totalChars += text.length
    if (totalChars > MAX_CHAT_CONTEXT_CHARS) {
      return { success: false, message: '这段对话上下文过长，请新开一个对话继续' }
    }

    messages.push({
      id: typeof rawMessage.id === 'string' && rawMessage.id.length <= 128
        ? rawMessage.id
        : `message-${index}`,
      role,
      parts: [{ type: 'text', text }],
    })
  }

  const last = messages.at(-1)
  if (!last || last.role !== 'user') {
    return { success: false, message: '最后一条消息必须来自用户' }
  }

  const lastUserText = last.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('')
    .trim()

  return { success: true, data: { messages, lastUserText } }
}

export function estimateBase64Bytes(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.max(Math.floor((value.length * 3) / 4) - padding, 0)
}
