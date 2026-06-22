import type { PoemForQuiz } from '@/db/repositories/poems'

export interface SubjectiveJudgeInput {
  stem: string
  answer: string
  scoringPoints: string[]
  userAnswer: string
  poem: PoemForQuiz
}

export function buildJudgePrompt(input: SubjectiveJudgeInput): string {
  const { stem, answer, scoringPoints, userAnswer, poem } = input

  const linesText = poem.lines
    .map((l, i) => {
      let line = `${i + 1}. "${l.content}"`
      if (l.translation) line += `\n   译：${l.translation}`
      if (l.explanation) line += `\n   释：${l.explanation}`
      return line
    })
    .join('\n')

  const pointsList = scoringPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')

  return `你是一位公正、富有教育经验的中学语文老师，正在批改一道古诗词主观题。

【权威资料：《${poem.title}》逐句原文+译+释】
${linesText}

主题：${(poem.themes ?? []).join('、') || '（无）'}
意象：${(poem.imagery ?? []).join('、') || '（无）'}
修辞手法：${(poem.rhetoric ?? []).join('、') || '（无）'}

【题目】
${stem}

【参考答案（教师版）】
${answer}

【得分点（需逐一判断）】
${pointsList}

【学生作答】
${userAnswer}

【批改要求】
1. 逐一判断每个得分点，学生的回答是否实质上涉及了这个得分点（不要求逐字相同，意思到位即可）
2. hitPoints：学生答到的得分点列表（从上面得分点原文中选取）
3. missedPoints：学生未答到的得分点列表（从上面得分点原文中选取）
4. feedback：用"青藤"的口吻写一段简短鼓励+指点的反馈（2-3句，亲切有趣），指出学生做得好的地方，并补充未答到的关键点
5. 严格基于资料批改，不要加入资料以外的知识点

只输出 JSON，格式：
{
  "hitPoints": ["答到的得分点原文1", "答到的得分点原文2"],
  "missedPoints": ["未答到的得分点原文"],
  "feedback": "青藤的鼓励和指点"
}`
}
