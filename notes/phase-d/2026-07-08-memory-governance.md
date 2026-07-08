# Phase D-2 Memory 膨胀治理

**日期**: 2026-07-08
**阶段**: Phase D · Memory 系统 P0
**结论**: 不改 schema,用现有 `weight` 和 `createdAt` 完成长期记忆的去重、时间衰减和单用户上限。

## 问题

长期 Memory 原先只负责抽取、embedding、召回:

- 每次抽取到相同内容都会新增一条记录。
- 召回只按语义相似度排序,老记忆和新记忆权重一样。
- 没有单用户上限,长期使用会让 `memories` 表持续膨胀。

## 策略

- **内容归一化**: 写入前 trim、合并空白、统一句末标点,过短内容直接丢弃。
- **kind 白名单**: 只保留 `emotion/preference/confusion/personal`,未知类型降级到 `personal`。
- **重复记忆刷新**: 同一用户同一 content 不重复插入,而是刷新 `createdAt` 并小幅提高 `weight`。
- **时间衰减召回**: 排序分数从单纯 similarity 变成 `similarity × weight × 0.9^ageDays`。
- **单用户上限**: 每个用户最多保留 80 条长期记忆;新增后若超限,优先保留 preference,再按衰减后价值保留。

## 验收

- `pnpm verify:memory`: passed。
- `pnpm eval`: 62/62,其中 Memory recall 10/10。
- `pnpm build`: passed。

## 讲法

这一步把 Memory 从"能记"推进到"会忘"。对教育陪伴产品来说,记忆不是越多越好,而是要有新鲜度、重要性和隐私边界。青藤现在不会无限堆积用户片段,也不会让几个月前的弱信号压过今天刚发生的学习状态。
