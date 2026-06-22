# 008 · 结构化出题引擎：三层防幻觉 Grounding

**适用场景**: 面试/Demo 中被问到"如何保证 AI 出的题不出错"时

---

## 背景与动机

LLM 出古诗题有一个经典幻觉模式:它"知道"某首诗有什么手法和典故,却把它们对应到错误的诗句上。比如把"一句八意"这个属于颈联的典故套在首联写景意象上(真实事故:《登高》八悲案例)。

这种错误:
- 听起来专业合理,不像凭空捏造
- 中学生无法辨别,会直接作为知识记住
- 考试引用会失分

---

## 方案：三层防护

### 层 1 · Prompt 注入权威资料

每次出题前,把该诗完整的结构化数据注入 prompt:

```
逐句原文 + 现代译文 + 释义
主题标签、意象列表、修辞手法
```

并加硬性约束:「你必须严格基于下面提供的权威资料出题,不得使用资料之外的信息」

**效果**: 把 LLM 从"凭记忆创作"变成"基于资料答题",跟人类考试用书一样。

### 层 2 · generateObject + Zod 强制结构

用 Vercel AI SDK 的 `generateObject` + Zod schema 而不是 `generateText`:

```typescript
const schema = z.object({
  stem: z.string().min(5),
  answer: z.string().min(1),
  explanation: z.string().min(5),
  evidenceLines: z.array(z.string()).min(1),  // 不可省略
  qualityScore: z.number().min(0).max(1),
})
```

`evidenceLines.min(1)` 强制 LLM 为每道题提供原诗依据。没有 evidenceLines 就过不了 Zod 验证。

### 层 3 · Post-validation 字符串匹配

LLM 返回后,代码校验 evidenceLines 中的引用是否真实存在于诗中:

```typescript
function verifyEvidence(evidenceLines, poemLines): boolean {
  const corpus = poemLines.map(stripPunct).join('')
  return evidenceLines.every(ev => corpus.includes(stripPunct(ev)))
}
```

- 通过:正常返回
- 不通过:qualityScore 压到 ≤0.3,记日志 warn —— 不阻断流程,但标记可疑题目

---

## 关键设计取舍

**为什么不直接拒绝 evidence 验证失败的题?**

拒绝会触发重试,可能陷入循环。更好的做法是降分 + 标记,在 UI 层提示"此题质量待审",人工审核后再放入题库。

**为什么用 generateObject 而不是 generateText + 手动 parse?**

`generateObject` 让模型直接输出结构化数据,省去 JSON 提取的正则。但 DeepSeek 有时不支持 `schema` 模式,所以保留了 `generateText` fallback 并复用同一个 Zod schema 做二次验证。

---

## 面试可以问的追问

- "如果 evidenceLines 验证失败率很高怎么办?" → 说说数据质量(诗库 lines 字段完整度)和 Eval 黄金集的作用
- "这套方案能推广到其他知识领域吗?" → 原则相同:先有结构化权威语料,再注入 prompt,再验证引用
- "为什么选 pgvector 存题库而不是向量检索?" → 题目现在按 poemId 精确查,后续 Week 5 会加相似题去重才需要向量
