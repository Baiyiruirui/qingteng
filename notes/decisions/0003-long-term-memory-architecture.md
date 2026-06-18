# 0003. 三层 Memory 整体架构 + 长期层技术选型

**日期**: 2026-06-18
**状态**: Accepted

## 背景

青藤需要"记住用户"才能实现真正的个性化陪伴。记忆有三个时间维度:
- 会话内的续接(短期)
- 跨会话的行为统计(中期)
- 跨会话的具体事件(长期)

三者用途不同,不能用同一种存储解决。

## 决策

采用三层 Memory 架构:

| 层 | 技术 | 场景 |
|---|---|---|
| 短期 | Upstash Redis(JSON) | 用上次对话内容生成个性化开场白 |
| 中期 | Upstash Redis(JSON,TTL 1h) | 注入学习画像(聊过哪些诗/主题/活跃度) |
| 长期 | Neon pgvector(embedding) | 语义召回具体事件(情绪/偏好/个人片段) |

## 长期层的具体选型

### 备选向量存储方案

**选项 A: Pinecone**
- 优点:专用向量 DB,性能最好,托管运维简单
- 缺点:新增一个付费服务;需要单独的 API;数据在两个系统里

**选项 B: pgvector(Neon)**
- 优点:复用已有 PG 实例,零新服务;Drizzle 原生支持;事务一致性
- 缺点:性能不如专用 DB(百万量级才感知)

**选项 C: Upstash Vector**
- 优点:已有 Upstash 账号
- 缺点:又一个新服务;API 风格不统一;成本不确定

**选项 D: LangChain/Mem0 托管 Memory**
- 优点:开箱即用
- 缺点:黑盒,作品集项目需要展示自己做了什么;成本不可控;依赖外部平台

### 选 pgvector 的理由

1. **"一个库搞定"**:Neon 已开 pgvector 扩展,零额外配置
2. **可演示**:可以直接在 Neon 控制台看到 memories 表的向量数据,面试时直观展示
3. **自建 RAG**:作品集价值点是"我从 0 实现了语义记忆",用 Pinecone 只是"我调了个 API"
4. **规模够用**:每用户预期 < 1000 条记忆,HNSW 索引够用

### 备选 Embedding 服务方案

**OpenAI Ada-002**: 1536 维,效果好,有 API,但需要 OpenAI 账号(用户没有)
**BAAI/bge-m3 via SiliconFlow**: 1024 维,中文效果好,价格低,国内访问快
**本地 sentence-transformers**: 不需要 API,但 Vercel serverless 无法运行

选 SiliconFlow + bge-m3:对应用户环境(国内,已有 DeepSeek,SiliconFlow 同系)。

### 提取策略的选型

**全文存储**:把整段对话存进向量 DB → 噪声多,召回质量差
**LLM 提取**:让模型判断"哪些信息值得记住",生成一句话摘要 → 噪声少,语义清晰
**规则提取**:正则/关键词匹配 → 漏掉自然语言表达的信息

选 LLM 提取(DeepSeek),因为:情绪、偏好、个人片段这些信息在自然对话里表达方式不固定,规则无法覆盖,只有语言理解能做。

## 整体架构图

```
用户发消息
    ↓
[recall] → embed(用户最新消息) → pgvector 相似度检索 → top-3 长期记忆
[getProfile] → Redis 读中期画像
    ↓
system = CHARACTER_PROMPT + 中期画像 + 长期记忆
    ↓
streamText → 青藤回复
    ↓
[onFinish]
  ├── PG: 存 messages + events
  ├── Redis: 更新短期快照(short-term)
  └── fire-and-forget: LLM 提取 → embed → 存 pgvector(long-term)
```

## 后果

**好的**:
- 真正的跨会话记忆,而不是只看最近 6 条消息
- 记忆是语义的,不是关键词的:说"我不喜欢背诵"和"我不想死记硬背"能匹配同一条记忆
- 零额外付费服务(pgvector 已包含在 Neon 里)

**坏的**:
- 每条消息多两次 API 调用(recall + extractAndStore),延迟各增加约 300-600ms
- extractAndStore 是异步的,不影响主链路,但算力成本存在
- LLM 提取可能出错(把不值得记的东西记了,或漏掉了值得记的)

## 如果反悔了

- 如果 pgvector 性能不够:迁移到 Pinecone(接口相近,向量数据可以批量迁移)
- 如果 SiliconFlow 不稳定:换 OpenAI Ada-002 或本地 bge-m3
- 如果提取质量差:改写 memory-extract.ts 的 prompt,无需改架构
