# 008 · 出题引擎：三层防幻觉 Grounding

**适用场景**: 面试/Demo 被问"如何保证 AI 出的题不出错"时

---

## 背景：LLM 出题的典型幻觉

LLM 出古诗题有一个经典幻觉模式——它"知道"某首诗有什么手法和典故，却把它们对应到错误的诗句上。

**真实案例**：《登高》"一句八意"典故。正确指向是颈联"万里悲秋常作客，百年多病独登台"（南宋罗大经《鹤林玉露》），DeepSeek 曾把它安在了首联写景意象上（"风急天高猿啸哀"等）。

这类错误的危害：
- 听起来专业合理，不像凭空捏造
- 中学生无法辨别，当作知识记住
- 考试引用直接失分

---

## 三层防护方案

### 层 1 · Prompt 注入权威资料

出题前把该诗完整的结构化数据注入 prompt：

```
原文逐句（带现代译文 + 释义）
主题标签、意象列表、修辞手法
```

并加硬性约束：

> 「你必须严格基于下面提供的权威资料出题，不得使用资料之外的、你自己记忆中的信息。这是防止错误知识污染学生的核心要求。」

**效果**：把 LLM 从"凭记忆创作"变成"基于资料答题"，类似开卷考试。

### 层 2 · generateObject + Zod 强制结构

用 Vercel AI SDK `generateObject` + Zod schema 而非 `generateText`：

```typescript
const BaseQuizSchema = z.object({
  stem: z.string().min(5),
  answer: z.string().min(1),
  explanation: z.string().min(5),
  evidenceLines: z.array(z.string()).min(1),  // 不可省略
  qualityScore: z.number().min(0).max(1),
})
```

`evidenceLines.min(1)` 强制 LLM 为每道题提供原诗依据。Zod schema 验证不通过→降级到 `generateText` fallback + 手动解析。

### 层 3 · Post-validation 字符串匹配

LLM 返回后，代码校验 evidenceLines 中的引用是否真实存在于诗中：

```typescript
function verifyEvidence(evidenceLines: string[], poemLines: string[]): boolean {
  const corpus = poemLines.map(stripPunct).join('')
  return evidenceLines.every(ev => corpus.includes(stripPunct(ev)))
}
```

- 通过 → `evidenceValid=true` 入库
- 不通过 → `evidenceValid=false`，`qualityScore *= 0.5`，入库但标记可疑

---

## 实测结果（Week 3 Day 3）

预生成 3 首诗 × 4 题型 × 3 难度 = **36 道**，全部成功：

| 指标 | 数据 |
|---|---|
| evidenceValid=true | 34 道（**94.4%**） |
| evidenceValid=false | 2 道（5.6%） |
| generateObject fallback 触发 | 1 次（qualityScore 字段缺失） |
| 失败（抛出异常） | 0 道 |

2 道 false 的分析：
- 静夜思 · mcq · 易：模型把释义文字（"释：把月光比作白霜"）当原诗句引用，非幻觉，属于格式问题
- 登高 · translate · 难：evidenceLines 混入了解释性文字，被去标点匹配拦截

《登高》赏析题 3 道全部通过，未出现"八悲"典故误植，grounding 有效。

---

## 关键设计取舍

**为什么不直接拒绝 evidenceValid=false 的题？**

拒绝会触发重试，可能陷入循环，且题目内容本身可能没问题（如上述两个 false 案例）。更好的做法：降分 + 标记，人工审核后再决定是否使用。

**为什么预生成而不是即时生成？**

1. 出题有延迟（1-3 秒），预生成避免用户等待
2. 可以离线审核题目质量
3. 相同题目不重复出，节省 API 成本

**generateObject vs generateText？**

优先 `generateObject`（结构化、稳定）。DeepSeek 兼容模式下偶尔不包含所有字段，此时 fallback 到 `generateText` + 手动 Zod parse，整体成功率 100%。

---

## 面试追问

- "2 道 evidenceValid=false 的题怎么处理？" → 目前入库、标记，Week 5 加人工审核 UI
- "能推广到其他学科吗？" → 只要有结构化权威数据就能做，数学难在答案验证，语文最适合
- "为什么不用 RAG？" → RAG 用于对话（Week 2 已做），出题不需要检索——我们直接把整首诗注入 prompt，上下文长度够
