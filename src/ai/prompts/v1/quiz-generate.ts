import 'server-only'
import type { PoemForQuiz } from '@/db/repositories/poems'

export const QUIZ_GEN_VERSION = 'v1.0.0'

export type QuizType = 'mcq' | 'fill' | 'translate' | 'appreciate'
export type QuizDifficulty = '易' | '中' | '难'

function typeLabel(type: QuizType): string {
  const map: Record<QuizType, string> = {
    mcq: '单项选择题',
    fill: '填空题',
    translate: '翻译题',
    appreciate: '赏析题',
  }
  return map[type]
}

function typeInstruction(type: QuizType): string {
  switch (type) {
    case 'mcq':
      return `出一道四选一选择题。
- 考查内容可以是：字词理解、诗句主旨、艺术手法、情感基调
- 四个选项中有且仅有一个正确答案，其余三个干扰项要有一定迷惑性
- answer 填写正确选项的完整文字内容（与 options 数组中的完全一致）
- 干扰项不得编造资料中没有的知识`

    case 'fill':
      return `出一道填空题。
- 从诗中抽取一句或半句，挖去 1-3 个关键字/词让学生填写
- stem 中用 __ 表示空格，每个 __ 对应一个字或词
- answer 填写被挖去的完整内容
- 选择富有表现力或容易出错的字词出题`

    case 'translate':
      return `出一道翻译题。
- 选取诗中一句或相邻两句，要求学生翻译成现代汉语
- stem 中给出原文，要求翻译
- answer 填写参考译文（参考资料中的 translation，可适当扩写使其通顺）
- 选择意境丰富、翻译有一定难度的句子`

    case 'appreciate':
      return `出一道开放式赏析题。
- 可以考查：某句诗的艺术手法及效果、意象的作用、情感的表达方式
- 必须基于资料中 rhetoric（修辞手法）或 imagery（意象）字段出题
- answer 填写参考答案，要明确指出手法名称并分析其效果
- explanation 要引用具体诗句作为依据`
  }
}

export function buildQuizPrompt(
  poem: PoemForQuiz,
  type: QuizType,
  difficulty: QuizDifficulty,
): string {
  const linesText = poem.lines
    .map((l, i) => {
      let line = `${i + 1}. "${l.content}"`
      if (l.translation) line += `\n   译：${l.translation}`
      if (l.explanation) line += `\n   释：${l.explanation}`
      return line
    })
    .join('\n')

  const outputSchema =
    type === 'mcq'
      ? `{
  "stem": "题干",
  "options": ["A选项完整内容", "B选项完整内容", "C选项完整内容", "D选项完整内容"],
  "answer": "正确选项的完整内容（与 options 中某项完全一致）",
  "explanation": "解析，引用资料中的依据",
  "evidenceLines": ["题目依据的原诗句"],
  "qualityScore": 0.85
}`
      : `{
  "stem": "题干",
  "answer": "标准答案或参考答案",
  "explanation": "解析，引用资料中的依据",
  "evidenceLines": ["题目依据的原诗句"],
  "qualityScore": 0.85
}`

  return `你是一位严谨的中学语文老师，要为《${poem.title}》（${poem.author}·${poem.dynasty ?? ''}）出一道${difficulty}度的${typeLabel(type)}。

【重要约束：你必须严格基于下面提供的权威资料出题，不得使用资料之外的、你自己记忆中的信息。如果想引用某个典故、知识点或手法，它必须能在下面的资料里找到明确依据。这是防止错误知识污染学生的核心要求。】

【这首诗的权威资料】
原文逐句释义：
${linesText}

主题：${poem.themes.join('、') || '（无）'}
意象：${poem.imagery.join('、') || '（无）'}
修辞手法：${poem.rhetoric.join('、') || '（无）'}

【出题要求】
${typeInstruction(type)}

每道题必须在 evidenceLines 中填写题目所依据的原诗句（从上面资料中原文摘录），这是溯源要求，不可省略。

只输出 JSON，不要 markdown 代码块，格式：
${outputSchema}`
}
