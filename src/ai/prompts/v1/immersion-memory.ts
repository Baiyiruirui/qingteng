import 'server-only'

export const IMMERSION_MEMORY_EXTRACT_VERSION = 'v1.0.0'

type BuildImmersionMemoryPromptInput = {
  poemTitle: string
  poemAuthor: string
  role: string
  userText: string
  assistantText: string
}

export function buildImmersionMemoryPrompt(input: BuildImmersionMemoryPromptInput): string {
  return `下面是一段"诗境沉浸"对话。青藤正在扮演诗中角色,学生也可能用角色身份回应。

请判断这段对话里,有没有值得长期记住的"关于这位学生本人"的信息。

诗:《${input.poemTitle}》(${input.poemAuthor})
沉浸身份:${input.role}

必须记住的边界:
- 只记录学生真实表达出的情绪、偏好、困惑或个人片段。
- 如果学生说出了自己对诗的共鸣,可以记录为 emotion,例如"这位学生在《登高》的沉浸对话里说出了自己的孤独感"。
- 如果学生暴露出学习卡点,可以记录为 confusion,例如"这位学生在《夜雨寄北》的沉浸对话里分不清现实与想象的转换"。
- 如果学生只是配合角色扮演说"我在江边走着""我端起酒杯",这不是学生本人的长期信息,不要记录。
- 不要把诗中角色的经历、青藤的台词、虚构剧情当成学生经历。
- 不要记录纯知识点、剧情推进、寒暄。

对话:
---
学生:${input.userText}
青藤:${input.assistantText}
---

请只输出一个 JSON,格式:
{"memories": [{"content": "一句话描述这条记忆,必须从青藤视角写,并尽量包含诗名,如'这位学生在《登高》的沉浸对话里说出了自己的孤独感'", "kind": "emotion|preference|confusion|personal"}]}

如果没有任何值得记住的,输出 {"memories": []}。
不要输出 JSON 以外的任何文字,不要用 markdown 代码块包裹。`
}
