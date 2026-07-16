import 'server-only'

export const MAX_CHAT_MESSAGES = 50
export const MAX_USER_MESSAGE_CHARS = 2_000
export const MAX_ASSISTANT_MESSAGE_CHARS = 6_000
export const MAX_CHAT_CONTEXT_CHARS = 24_000

type ParsedMessages = {
  messageId: string
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

  const last = value.at(-1)
  if (!isRecord(last)) {
    return { success: false, message: '消息格式不正确' }
  }
  if (last.role !== 'user') {
    return { success: false, message: '最后一条消息必须来自用户' }
  }
  if (!Array.isArray(last.parts)) {
    return { success: false, message: '消息内容格式不正确' }
  }

  const lastUserText = last.parts
    .filter(isRecord)
    .filter(part => part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text as string)
    .join('')
    .trim()

  if (!lastUserText) {
    return { success: false, message: '消息内容不能为空' }
  }
  if (lastUserText.length > MAX_USER_MESSAGE_CHARS) {
    return {
      success: false,
      message: `单条消息不能超过 ${MAX_USER_MESSAGE_CHARS} 字`,
    }
  }

  const messageId = typeof last.id === 'string' && last.id.length > 0 && last.id.length <= 128
    ? last.id
    : 'message-new'

  return { success: true, data: { messageId, lastUserText } }
}

export function estimateBase64Bytes(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.max(Math.floor((value.length * 3) / 4) - padding, 0)
}
