import 'server-only'

export const MEMORY_EXTRACT_VERSION = 'v1.0.0'

export function buildExtractPrompt(transcript: string): string {
  return `下面是青藤(一位 AI 诗词老师)和一位学生的一段对话。请你判断:这段对话里,有没有值得长期记住的关于这位学生的信息?

值得记住的包括:
- 他表达过的情绪或心境(如"最近压力大""为某句诗感动")
- 他的偏好(如"喜欢豪放派""不喜欢背诵")
- 他的困惑或卡点(如"读不懂某种意象")
- 他主动分享的个人片段(如"要考试了""和朋友吵架了")

不值得记住的:
- 纯粹的知识问答(他问杜甫生平,这不算"关于他"的信息)
- 泛泛的寒暄

对话:
---
${transcript}
---

请只输出一个 JSON,格式:
{"memories": [{"content": "一句话描述这条记忆,从青藤的视角,比如'这位学生为《登高》里的孤独感动过'", "kind": "emotion|preference|confusion|personal"}]}

如果没有任何值得记住的,输出 {"memories": []}。
不要输出 JSON 以外的任何文字,不要用 markdown 代码块包裹。`
}
