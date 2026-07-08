# 006. 诗词语义搜索（复用 pgvector 基础设施）

**状态**: 已实现 · Phase C3
**相关代码**: `src/ai/embedding-core.ts`, `src/ai/poems/search.ts`, `src/app/api/poems/search/route.ts`, `scripts/embed-poems.ts`

## 一句话讲点

诗库扩大后需要搜索。不做普通关键词搜索，做语义搜索——复用 Memory 系统已有的 embedding pipeline，让用户用自然语言"想读点关于孤独的诗"召回意象/主题相近的诗。

## 背景

当前诗库 140 首，靠列表浏览够用。但产品规模化后（目标诗库可达数千首）必然需要检索。

普通方案是关键词全文搜索（标题/作者/朝代匹配）——任何 CRUD 应用都有，不体现 AI 能力，招聘 ROI 低。

## 实现

利用已经搭好的 pgvector + bge-m3 embedding 基础设施：

1. 新增 `poem_embeddings` 表,独立于 `poems`,存 `poemId/content/embedding/model`
2. `scripts/embed-poems.ts` 把 140 首诗拼成搜索文本并写入 bge-m3 向量
3. `/api/poems/search` 接收自然语言 query,做 query embedding
4. pgvector 余弦相似度召回 top N
5. 关键词命中优先,语义召回补位,朝代筛选继续可用

## 为什么这是个好讲点

- **复用而非重建**：同一套 embedding pipeline，Memory 用它记人，搜索用它找诗，体现架构的一致性
- **语义优于关键词**：用户搜"孤独"，能召回《登高》《九月九日忆山东兄弟》这些并未出现"孤独"二字但意境契合的诗
- **混合检索**：语义 + 结构化过滤，是 RAG 检索的进阶形态

## 验证样例

`孤独` 查询已回填验证,top 结果包括:

- 《江雪》 柳宗元
- 《独坐敬亭山》 李白
- 《月下独酌》 李白
- 《竹里馆》 王维
- 《登高》 杜甫
- 《旅夜书怀》 杜甫

这些结果不只靠标题/作者命中,而是来自主题、意象、译文、释义和原文的综合语义。

## 设计取舍

没有把 embedding 直接塞进 `poems` 表,而是新增 `poem_embeddings` 表。理由:

- 诗词原始资料和向量索引生命周期不同
- 后续可以重跑 embedding 或更换模型,不污染主表
- 可保留 `model` 字段,支持版本化
- 更符合 RAG/检索系统的工程边界
