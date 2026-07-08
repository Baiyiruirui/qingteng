# 005. 自建三层 Memory 的长期层 — LLM 自主提取 + pgvector 语义召回

**相关代码**: `src/ai/memory/long-term.ts`, `src/ai/embedding.ts`, `src/ai/prompts/v1/memory-extract.ts`
**相关路由**: `src/app/api/chat/route.ts`

## 一句话讲点

对话结束后让 LLM 判断"有没有值得记住的关于用户的事",提炼成一句话,用 bge-m3 embedding 存进 pgvector;未来对话用当前话题做语义检索召回相关记忆。这让青藤能跨会话记住"你为某句诗动容过"这种具体的事。

## 30 秒电梯版

每轮对话结束后:
1. 把用户+青藤这一轮的内容拼成 transcript
2. 用 DeepSeek(便宜)判断有无值得记忆的事,输出 JSON
3. 有就用 BAAI/bge-m3(1024 维)embedding,存进 Neon 的 pgvector memories 表

每轮对话开始前:
1. 用用户最新一句话做语义检索(embed → `<=>` cosine distance)
2. 相似度 > 0.4 的召回,拼进 system prompt 的"【长期记忆】"段落
3. 有记忆就自然融入,没有就空白——不影响对话

## 2 分钟深度版

### 设计决策 1: 为什么 LLM 提取而非全文存储

直觉是把整段对话存进 vector DB。问题:
- 噪声多:大量闲聊、知识问答、青藤的讲述都不是"关于用户"的信息
- 召回质量差:相关性搜索会把"青藤讲了杜甫生平"也召回来,污染 context
- 存储膨胀快

LLM 提取的优势:
- 降噪:只提取"关于用户"的信号(情绪、偏好、困惑、个人片段)
- 粒度可控:一条记忆一句话,embedding 语义清晰
- 可解释:能在 DB 里看到具体记了什么,方便调试

### 设计决策 2: 为什么 pgvector 而非 Pinecone/Weaviate

pgvector 是 Postgres 扩展。Neon 默认支持,我们已有 PG。好处:
- **零额外服务**:一个 Neon 数据库搞定业务数据 + 向量数据,省一个依赖
- **事务一致性**:记忆写入和其他数据在同一个 PG 事务上下文里(虽然目前没用到)
- **Drizzle ORM 支持**:`cosineDistance()` 函数已集成,代码量极少

代价:pgvector 性能不如专用向量 DB(百万量级才有感知)。当前场景每用户几十条记忆,完全够用。

### 设计决策 3: 召回的阈值过滤

不做阈值:召回的 top-3 里可能有完全不相关的记忆,强行注入反而误导模型。

做法:余弦相似度 > 0.4 才召回,且最多取 3 条。对于 1024 维的 bge-m3:
- 相似度 > 0.7 = 强相关(聊同一件事)
- 相似度 0.4-0.7 = 语义相关(同一主题)
- 相似度 < 0.4 = 基本无关,不召回

阈值 0.4 是起始值,后续 eval 可以按实际效果调整。

### 设计决策 4: 提取频率的成本权衡

选项 A:每 N 轮提取一次(节约成本,但可能漏掉单次重要信息)
选项 B:每轮提取(不漏,成本稍高)
选项 C:对话结束时提取(触发时机模糊——什么叫"结束")

当前选 B(每轮),原因:
- DeepSeek 价格低(约 $0.001/千 token),一次提取约 500 token → $0.0005
- 大多数轮次提取结果是 `{"memories": []}`,直接跳过存储,实际成本很低
- 不漏:用户偶尔说一句重要的事,不会因为"凑够 N 轮才提取"而丢失

### HNSW 索引

```sql
CREATE INDEX memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);
```

HNSW(Hierarchical Navigable Small World):图结构索引,近邻搜索 O(log N)。
不建索引:全表扫描 O(N),用户记忆多了会慢。
记忆量在当前规模(< 1000 条/用户)下索引不明显,但这是 production-ready 的习惯。

## 三层 Memory 对比

| 层 | 存储 | 内容 | 时效 | 召回方式 |
|---|---|---|---|---|
| 短期 | Redis | 最近 6 条消息 + 时间戳 | 30 天 TTL | 固定拉取 |
| 中期 | Redis | 学习画像(聊过的诗、主题、活跃天数) | 1 小时 TTL | 固定拉取 |
| 长期 | pgvector | LLM 提炼的具体事件(情绪/偏好/个人) | 永久 | 语义检索 |

短期 = 谈话续接;中期 = 行为统计;长期 = 被记住的事。

## 可能的追问

- Q: 怎么防止记忆膨胀?
  A: 已在 Phase D 加了治理:写入前去重,重复记忆刷新 `createdAt` 并小幅提高 `weight`;召回排序用 `similarity × weight × 0.9^ageDays`;每个用户最多保留 80 条长期记忆,超限时优先保留 preference,再淘汰低价值旧记忆。这样青藤不是无限堆东西,而是会记重点、会忘弱信号。

- Q: 用户能删除记忆吗?
  A: 目前不能(无管理 UI)。这是 MVP 妥协。Phase D 的 P1 里还留了"记忆查看/删除 UI",用于补隐私边界和面试演示友好度。

- Q: embedding 维度怎么选?
  A: BAAI/bge-m3 固定输出 1024 维。选这个模型是因为:多语言、中文效果好、SiliconFlow 有托管、比 OpenAI Ada-002(1536 维)更轻量。

- Q: 召回准确率怎么衡量?
  A: Week 5 的 eval golden set 里会加几个记忆召回测试用例。目前靠人工验证场景 B(换对话后推荐诗能体现偏好)。

## 踩坑:RAG Grounding 失败 + 多记忆冲突(Week 2 Day 5 修复)

上线后发现两个 RAG 经典问题,这是面试加分点——展示我能预判并解决工程细节。

### 问题 1: Hallucination after retrieval

现象:模型拿到抽象记忆"他喜欢李白"后,opening prompt 要求"提一个具体细节"——模型选择演绎出"上次聊过李白折菊"作为"细节",用户从未提过这件事。

这是 RAG 的经典陷阱:**检索给了 grounding,但 generation 没有被约束只能 ground 在检索结果里**。模型"幻觉"出了语义相关但实际不存在的细节。

修复:在所有注入记忆的 prompt 里,加显式的"只能引用记忆里有的内容,不能演绎"约束:
```
⚠️ 绝对不得把抽象印象(如"他喜欢李白")演绎成虚构的具体经历(如"上次聊李白折菊")
你只能引用以下记忆中确实存在的内容。记忆只说"他喜欢李白",你就只知道这五个字。
```

教训:RAG 的 retrieval 和 generation 是两个独立的失效点。给了 retrieved context 不等于 generation 会忠实使用它,需要 prompt 级别的 grounding 约束。

### 问题 2: Multi-memory conflict — preference ignored

现象:用户有两条记忆:preference"讨厌律诗" + emotion"心情低落"。query="推荐一首诗"时,cosine similarity 把 emotion 记忆排前面(情感语义更近),preference 记忆被 top-3 截断。结果模型看到了"心情低落"却没看到"讨厌律诗",推荐了一首七律——恰好是用户明确拒绝的风格。

修复:两阶段召回:
1. preference 类记忆用低阈值(0.15)单独召回,保证偏好不被相似度排序淹没
2. 注入时分组渲染,preference 组标注"务必尊重,这是硬约束"
3. 末尾提示"推荐诗歌时,既要照顾情绪,也不要违背明确偏好"

教训:不同类型的记忆有不同的"优先级"语义。preference 是约束(must satisfy),emotion 是影响(should consider)。纯相似度排序不能区分这两种语义,需要在召回策略和 prompt 结构上显式处理。
