import type { PoemForQuiz } from '@/db/repositories/poems'
import type { BlueprintPoint } from '@/db/schema'

export const QUIZ_GEN_VERSION = 'v1.0.0'
export const QUIZ_GEN_VERSION_V2 = 'v2.0.0'

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

// ── Blueprint-driven prompt (v2) ────────────────────────────────────────────

function blueprintFormInstruction(point: BlueprintPoint): string {
  const targetText = point.targetLines.join('，')

  switch (point.type) {
    case '默写':
      return `出一道理解性默写题（情境填句）。
- 题干：根据「${point.prompt_hint}」写一句情境描述，结尾用"____"表示要填写的诗句
- 情境描述要自然，让人看了就知道填哪句，但不能直接把诗句写在题干里
- answer：完整填写「${targetText}」（完整诗句，不是挖单字）
- evidenceLines：填「${targetText}」`

    case '炼字':
      return `出一道炼字赏析题，考查「${targetText}」中的关键字词表达效果。
- 出题提示：${point.prompt_hint}
- 参考答答方向：${point.answerKey}
- stem：明确指出要赏析的字/词，如"请赏析'X'字的表达效果"
- answer：指出字词含义 + 写出效果 + 结合情感，言之有据
- evidenceLines：必须包含「${targetText}」`

    case '画面':
      return `出一道描绘画面题，要求学生描绘「${targetText}」展现的画面。
- 出题提示：${point.prompt_hint}
- stem：明确要求"用自己的话描绘诗句展现的画面/情景"
- answer：${point.answerKey}（展开描绘，有人物/景物/氛围，语言生动）
- evidenceLines：必须包含「${targetText}」`

    case '意象':
      return `出一道意象赏析题，考查「${targetText}」中的意象及其营造的意境。
- 出题提示：${point.prompt_hint}
- stem：明确指出意象（如"诗中'X''Y'两个意象有何作用"或"营造了怎样的意境"）
- answer：点出意象 + 说明意境 + 联系情感
- evidenceLines：必须包含「${targetText}」`

    case '手法':
      return `出一道手法赏析题，考查「${targetText}」的表达技巧及效果。
- 出题提示：${point.prompt_hint}
- 参考答答方向：${point.answerKey}
- stem：如"请赏析'诗句'的写法/手法"或"指出并分析X联的表达技巧"
- answer：点明手法名称 + 结合诗句分析 + 指出效果/情感
- evidenceLines：必须包含「${targetText}」`

    case '情感':
      return `出一道情感分析题，考查「${targetText}」或全诗抒发的情感。
- 出题提示：${point.prompt_hint}
- stem：如"这首诗/这一联表达了诗人怎样的思想感情"
- answer：${point.answerKey}（点出情感类型，结合具体诗句说明）
- evidenceLines：若考全诗，填本诗最能体现情感的 1-2 句；若考局部，填「${targetText}」`

    case '翻译':
      return `出一道翻译题，要求学生将「${targetText}」译成现代汉语。
- stem：给出原文，要求"用现代汉语翻译下面的诗句"
- answer：${point.answerKey}（忠实原文，通顺流畅，保留意境）
- evidenceLines：必须包含「${targetText}」`

    case '综合选择':
      return `出一道四选一综合判断题（选"不正确的一项"）。
- 出题提示：${point.prompt_hint}
- 四个选项都对全诗进行描述，三个正确，一个表述有误（即正确答案是那个错误选项）
- 干扰项错误要隐蔽：可以是理解偏差、手法张冠李戴、情感程度夸大等——但必须有据可查，不得编造
- 特别禁止：不得编造未在资料中出现的典故或说法（如"八悲""一句八意"等无法从资料中找到依据的典故）
- answer：填写那道"表述不正确"的选项完整内容（与 options 数组中完全一致）
- evidenceLines：填写支持正确判断的 1-2 句原诗`

    default:
      return `出一道考查「${targetText}」的题目，考点：${point.type}。出题提示：${point.prompt_hint}`
  }
}

export function buildBlueprintPrompt(poem: PoemForQuiz, point: BlueprintPoint): string {
  const linesText = poem.lines
    .map((l, i) => {
      let line = `${i + 1}. "${l.content}"`
      if (l.translation) line += `\n   译：${l.translation}`
      if (l.explanation) line += `\n   释：${l.explanation}`
      return line
    })
    .join('\n')

  const isMcq = point.form === 'mcq'
  const outputSchema = isMcq
    ? `{
  "stem": "题干（如：下列对这首诗的理解，不正确的一项是）",
  "options": ["A项完整内容", "B项完整内容", "C项完整内容", "D项完整内容"],
  "answer": "表述不正确的那个选项的完整内容",
  "explanation": "指出错误选项错在哪，引用资料说明正确理解",
  "evidenceLines": ["题目依据的原诗句"],
  "qualityScore": 0.90
}`
    : `{
  "stem": "题干",
  "answer": "标准答案或参考答案",
  "explanation": "解析，引用资料说明",
  "evidenceLines": ["题目依据的原诗句"],
  "qualityScore": 0.90
}`

  return `你是一位严谨的中学语文老师，根据考点蓝图为《${poem.title}》（${poem.author}·${poem.dynasty ?? ''}）出一道题。

【防幻觉约束：严格基于下面的权威资料出题，禁止使用资料之外你记忆中的任何典故、知识点、说法。干扰项也必须有据可查。】

【权威资料：《${poem.title}》逐句原文+译+释】
${linesText}

主题：${poem.themes.join('、') || '（无）'}
意象：${poem.imagery.join('、') || '（无）'}
修辞手法：${poem.rhetoric.join('、') || '（无）'}
体裁：${poem.lines.length <= 4 ? '绝句' : '律诗'}

【本题考点】
考点类型：${point.type}（${point.ability}）
目标诗句：${point.targetLines.join('，')}

【出题要求】
${blueprintFormInstruction(point)}

evidenceLines 必须是原诗句原文（从上面资料中摘录），不可包含解释性文字。

只输出 JSON，不要 markdown 代码块，格式：
${outputSchema}`
}
