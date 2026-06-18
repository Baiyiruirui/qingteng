import 'server-only'

export const OPENING_PROMPT_VERSION = 'v1.0.0'

type Args = {
  userName: string
  snapshot: {
    recentMessages: Array<{ role: string; content: string }>
    lastMessageAt: number
  } | null
}

function timeAgoCN(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (days >= 1) return `${days} 天前`
  if (hours >= 1) return `${hours} 小时前`
  if (minutes >= 5) return `${minutes} 分钟前`
  return '刚才'
}

export function buildOpeningUserPrompt({ userName, snapshot }: Args): string {
  if (!snapshot || snapshot.recentMessages.length === 0) {
    return `这位学生叫 ${userName},第一次和你说话。请用一两句话简单打个招呼,介绍你自己——你是青藤,陪他读诗。语气温和、不矫情、不过分热情。不要超过两句话。直接输出开场白,不要带"青藤说:"这样的标签。`
  }

  const transcript = snapshot.recentMessages
    .map(m => `${m.role === 'user' ? userName : '青藤'}: ${m.content}`)
    .join('\n')

  return `这位学生叫 ${userName},距离上次和你说话已过去 ${timeAgoCN(snapshot.lastMessageAt)}。

你们上次的对话最后几轮:
---
${transcript}
---

现在他重新进入了。请用一两句话开场:
- 可以自然提到上次聊的话题或诗
- 或者关心一下他的状态
- 像一位老朋友重新坐下来,不要做对话总结、不要正式开头
- 留出空间让他继续说话

不要超过两句话。直接输出,不要带"青藤说:"这样的标签。`
}
