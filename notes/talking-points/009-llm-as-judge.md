# 009 · LLM-as-Judge：主观题自动批改

**适用场景**: 面试/Demo 被问"主观题怎么判断学生答得对不对"时

---

## 问题：主观题没有唯一正确答案

赏析题和翻译题的学生作答千变万化，无法用字符串匹配判断对错。

---

## 解决方案：两层判题

### 层一：规则判题（客观题）

`judgeObjective(question, userAnswer)`:
- **选择题 (mcq)**：normalize 后字符串匹配，支持选项字母（A/B/C/D）或选项完整内容
- **填空题 (fill)**：去标点后精确匹配

零 LLM 调用，延迟 < 1ms。

---

### 层二：LLM 判题（主观题）

`judgeSubjective(question, userAnswer, poem)`:

**关键设计：先把答案拆成"得分点"**

出题时（或 backfill 时），让 LLM 把参考答案拆成 2-4 个离散的、可独立判断的得分点：

```
参考答案："'疑'字用了拟人手法，写出了月光洁白如霜，营造了清冷的意境，流露出游子的思乡之情"

得分点：
1. 指出"疑"是拟人/比喻手法
2. 解释月光洁白似霜的视觉效果
3. 点出清冷意境
4. 联系诗人思乡情感
```

**判题时逐点打分**：

```
{
  hitPoints: ["指出'疑'是拟人/比喻手法", "解释月光洁白似霜的视觉效果"],
  missedPoints: ["点出清冷意境", "联系诗人思乡情感"],
  feedback: "你抓住了'疑'的手法，理解得很准！不过意境和情感这两层还可以展开说说～"
}
```

**及格线**: `hitPoints.length / totalPoints >= 60%` → isCorrect = true

---

## 防幻觉：全程 grounding

判题时把诗的完整资料注入 prompt（逐句原文 + 译 + 释 + 修辞意象），禁止 LLM 引入资料外的知识点。这和出题时的三层防护保持一致。

---

## 数据流（防 F12 看答案）

```
POST /api/quiz/session → 返回题目（不含 answer / scoringPoints）
用户作答 → POST /api/quiz/judge → 服务端取 answer/scoringPoints → 判题 → 返回结果
```

answer 和 scoringPoints 只在 judge API 内部使用，从不出现在前端 JSON 里。

---

## 写库

每次作答写一条 `quiz_attempts`（含 hitPoints/missedPoints/feedback）。

答错时 upsert `wrong_questions`（wrongCount + 1）：

```sql
INSERT INTO wrong_questions ... ON CONFLICT (user_id, question_id)
DO UPDATE SET wrong_count = wrong_count + 1, last_wrong_at = now(), resolved = false
```

---

## 关键取舍

**为什么不用 embedding 相似度**: 古诗答案意思正确但用词不同（如"拟人"vs"以物拟人"）用 embedding 容易误判。LLM 理解语义更准。

**为什么先拆得分点再判**: 单题评"全对/全错"不够细，拆成得分点后可以告诉学生"你答对了哪几点、还差什么"，反馈更有教育价值，也让学生看到进步。

**为什么 60% 及格**: 主观题要求宽容，鼓励学生表达。如果全对才算对，学生容易放弃。60% 是"答到关键点就过"的经验值。

---

## 面试追问

- "LLM 判题会不会误判？" → 会有误差。关键是"得分点离散化"后误判范围小（单点对错），不会影响整体 isCorrect 判断；Week 5 Langfuse 追踪后可以用 eval 集评估准确率
- "题目多了LLM成本怎么办？" → 客观题（mcq/fill）零 LLM 成本；主观题 1 次 judge 调用约 800 token，成本可控
- "错题本怎么用？" → 目前展示错题列表 + 链接回对应诗的 quiz 页；Week 4 可加"专项复习"——只从错题中抽题
