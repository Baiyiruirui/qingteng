import type { PoemForQuiz } from '@/db/repositories/poems'

export const BLUEPRINT_GEN_VERSION = 'v1.0.0'

export function buildBlueprintGenPrompt(poem: PoemForQuiz): string {
  const linesText = poem.lines
    .map((l, i) => {
      let line = `${i + 1}. "${l.content}"`
      if (l.translation) line += `\n   译：${l.translation}`
      if (l.explanation) line += `\n   释：${l.explanation}`
      return line
    })
    .join('\n')

  const lineCount = poem.lines.length
  const isJueju = lineCount <= 4
  const pointCount = isJueju ? '4-6' : '6-8'
  const textType = isJueju ? '绝句' : '律诗'

  return `你是一位资深的中学语文教研员，为《${poem.title}》（${poem.author}·${poem.dynasty ?? ''}）设计考点蓝图，用于指导 AI 出题系统生成高质量、覆盖全面的练习题。

【这首诗的资料】
体裁：${textType}（共 ${lineCount} 句）
原文逐句：
${linesText}

主题：${poem.themes.join('、') || '（无）'}
意象：${poem.imagery.join('、') || '（无）'}
修辞手法：${poem.rhetoric.join('、') || '（无）'}

【蓝图设计要求】
1. 共设计 ${pointCount} 个考点，覆盖全诗不同部分（不要全部集中在名句）
2. 考点类型要多样，从以下类型中选取（不要重复同一类型超过 2 次）：
   - 默写：理解性默写，给情境让学生填完整诗句
   - 炼字：品味关键字词的表达效果
   - 画面：描绘诗句展现的画面/情景
   - 意象：分析意象及其营造的意境
   - 手法：赏析修辞/表现手法及效果
   - 情感：把握思想感情（可以是全诗或某联）
   - 翻译：将诗句译成现代汉语
   - 综合选择：对全诗内容/手法/情感的综合判断（选"不正确的一项"）
3. 每个考点针对不同的目标诗句（targetLines），不重复
4. targetLines 必须从原文中原样摘录，不能改字
5. answerKey 要具体有据，基于上方资料中的信息
6. 禁止编造资料中没有的典故或知识点

【输出格式】JSON 数组，每个元素：
{
  "id": "p1",       // 顺序编号 p1 p2 ...
  "type": "考点类型",  // 从上面类型中选
  "ability": "对应能力",  // 如"识记+理解"/"鉴赏语言"/"鉴赏表达技巧"/"鉴赏形象"/"点评思想内容"/"分析综合"
  "targetLines": ["目标诗句原文"],  // 从原文摘录
  "prompt_hint": "出题提示（给出题 AI 看的简短指引，说明这个考点要考什么）",
  "answerKey": "参考答答要点",
  "form": "fill|appreciate|translate|mcq"  // 建议的题型
}

直接输出 JSON 数组，不要 markdown 代码块，不要包装对象。`
}
