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
参考答案："'疑'字用了比喻手法，写出了月光洁白如霜，营造了清冷的意境，流露出游子的思乡之情"

得分点：
1. 指出"疑"是比喻手法
2. 解释月光洁白似霜的视觉效果
3. 点出清冷意境
4. 联系诗人思乡情感
```

**判题时逐点打分**（宽容判定 — 意思到位即算命中，不逐字匹配）：

```
{
  hitPoints: ["指出'疑'是比喻手法", "联系诗人思乡情感"],
  missedPoints: ["解释月光洁白似霜的视觉效果", "点出清冷意境"],
  feedback: "你一下子就抓住了'疑'的手法，还联系到了思乡情感，很不错！月光如霜的画面感和清冷意境还可以展开说说，会更完整～"
}
```

---

## 教育学考量：主观题不判"对/错"，改为"完成度"

**实测发现的问题**：
- 学生答出情感题核心"思乡"，命中列表显示 ✓，但顶部大红"✗ 这次没答到"——答对核心却判没答到，体验打击学习动机
- 翻译题答"抬头"，触及"将'举头'译为抬头动作"这个点，但之前判定过严导致三点全判 ✗

**修复方案**：
- 主观题返回 `completionRate = hitPoints.length / totalPoints`（0-1 之间），不再有二元对/错
- 顶部横幅按区间显示友好文案：
  - 100% → "答得很完整 ✓"
  - ≥50% → "答到了核心，还能更全面"
  - >0% → "答到了一点，我们一起补全"
  - 0% → "再想想看～"
- "未答到的得分点"改为"**还可以补充**"（措辞 + 颜色从红改为暖棕）
- 青藤点评永远先肯定，再温和引导

**进错题本的条件**：
- 客观题：答错才进
- 主观题：`completionRate < 0.25`（几乎没答到）才进，答到核心（≥50%）不进

---

## 防幻觉：全程 grounding

判题时把诗的完整资料注入 prompt（逐句原文 + 译 + 释 + 修辞意象），禁止 LLM 引入资料外的知识点。

---

## 数据流（防 F12 看答案）

```
POST /api/quiz/session → 返回题目（不含 answer / scoringPoints）
用户作答 → POST /api/quiz/judge → 服务端取 answer/scoringPoints → 判题 → 返回结果
```

answer 和 scoringPoints 只在 judge API 内部使用，从不出现在前端 JSON 里。

---

## 防重复计数 bug

**根因（已修复）**：
- React Strict Mode 在 dev 环境下双调 effect，导致同一 sessionId+questionId 提交 8 次
- 后端没有幂等保护，每次都 `wrongCount + 1`，最终计数膨胀

**修复**：
1. **前端**：提交按钮 submitting 状态下 disabled，提交后立即锁定不可再点
2. **后端（主要防线）**：先查 `quizAttempts` 中是否已有同 `sessionId + questionId` 的记录，若有则直接返回缓存结果，不重跑 LLM，不再递增 wrongCount
3. **DB 层（兜底）**：`quiz_attempts(session_id, question_id)` 加了 `UNIQUE INDEX`，数据库层面防止重复写入
4. **数据清理**：对现有脏数据删重复 attempts，重置 wrongCount > 3 的记录为 1

---

## 写库

每次作答写一条 `quiz_attempts`（含 completionRate/hitPoints/missedPoints/feedback）。

答错 / 主观题 completionRate < 0.25 时，upsert `wrong_questions`（wrongCount + 1）。

---

## 面试追问

- "LLM 判题会不会误判？" → 会有误差，但"宽容判定"让误判方向是"漏判 hitPoints"而非"冤枉学生"，教育上更可接受；Week 5 Langfuse 追踪后可用 eval 集量化
- "主观题不判对错，汇总页怎么显示？" → 显示"整体掌握度 X%"（各题 completionRate 的均值），不用"X/5 对"这种二元表述
- "completionRate < 0.25 才进待加强，会不会漏？" → 这是有意设计——只有几乎完全没答到才进，减少挫败感；"答到核心"的学生看到进步会更有动力继续
- "错题本怎么用？" → 目前显示"待加强"列表 + 链接回对应诗的 quiz 页；Week 4 可加"专项复习"——只从待加强中抽题
