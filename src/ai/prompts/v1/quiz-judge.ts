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

  return `你是一位温和、有经验的中学语文老师，正在批改一道古诗词主观题。

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

【批改原则——非常重要】
1. 判断标准要宽容：学生的回答只要触及某个得分点的核心意思，就算命中该点。不要逐字匹配，意思到位即可。
   - 例：得分点是"将'举头'译为抬头/仰望动作"，学生写"抬头"就算命中
   - 例：得分点是"点出思乡/羁旅之情"，学生写"想家"就算命中
   - 例：得分点是"指出对比/反衬手法"，学生写"前后对照"就算命中
2. hitPoints：列出学生答案中已触及的得分点（从上面得分点原文中选取）
3. missedPoints：列出学生完全未触及的得分点（从上面得分点原文中选取）
4. feedback：用"青藤"的口吻写 2-3 句鼓励 + 指点（风格：亲切有趣，像朋友在聊天）
   - 必须先肯定学生答到的内容（哪怕只答到一点也要先夸）
   - 再温和地提示还可以补充哪些方向（不要说"你没答到"，说"还可以加上…"）
   - 如果学生一点没答到，用鼓励的方式引导而不是批评
5. 严格基于资料批改，不引入资料以外的知识

只输出 JSON，格式：
{
  "hitPoints": ["已触及的得分点原文1", "已触及的得分点原文2"],
  "missedPoints": ["完全未触及的得分点原文"],
  "feedback": "青藤的鼓励和指点"
}`
}
