# 001. 自建三层 Memory 系统而非用 mem0 / LangChain Memory

**相关代码**: `src/ai/memory.ts`(Week 2 创建)
**相关决策**: `notes/decisions/0002-memory-architecture.md`(Week 2 写)

## 一句话讲点

把 Memory 拆成短期(Redis 会话)/ 中期(PG 学习画像)/ 长期(pgvector 诗友记忆)三层,每层有明确的写入触发条件和检索时机。

## 30 秒电梯版

一般 AI 对话产品要么没有记忆(套壳),要么用 mem0 这种通用 Memory 库。我做了一个面向"教育产品 + 长期陪伴"场景的三层 Memory:短期是当前对话上下文存在 Redis;中期是学生的学习画像(薄弱题型、近 7 天行为),增量更新在 PostgreSQL;长期是带情感色彩的"诗友记忆",由 LLM 判断哪些用户输入值得长期记住,embedding 后存 pgvector。每次新对话前,三层 Memory 拼成 system prompt 注入。

## 2 分钟深度版

(Week 2 实现后补全:讲触发条件设计、检索权重、token 预算管理、隐私边界)

## 可能的追问

- Q: 为什么不用 mem0?
  A: (Week 2 后补)
- Q: 长期 Memory 怎么避免无关信息污染检索?
  A: (Week 2 后补)
- Q: token 预算超了怎么办?
  A: (Week 2 后补)
