# 0002. 短期 Memory 存储:Redis vs 其他方案

**日期**: 2026-06-18
**状态**: Accepted

## 背景

生成个性化开场白需要读取用户"最近几轮对话"。需要决定把这份数据放在哪里,让每次进入 /chat 时都能快速读取。

## 决策

用 Upstash Redis 存储每个用户的会话快照(最近 6 条消息 + 时间戳),以 `user:{userId}:short_term` 为 key,TTL 30 天。

## 备选方案

### 选项 A: 直接查 PostgreSQL
- 优点:无额外依赖,数据一致性完全可信
- 缺点:每次进入页面需要 join 查询,随消息增多性能下降;serverless 冷启动加上 PG 连接池竞争可能增加延迟

### 选项 B: Redis(Upstash REST)
- 优点:O(1) 读取、无连接池问题、边缘场景友好、快照小(JSON < 2KB);Upstash 免费 tier 够用
- 缺点:新增外部依赖;网络异常需要降级处理;和 PG 数据有最终一致性风险(理论上)

### 选项 C: 内存缓存(Next.js 模块级变量)
- 优点:极低延迟
- 缺点:serverless 无状态,不同实例不共享内存;重启即丢

### 选项 D: PG 物化视图/summary 表
- 优点:数据在同一系统
- 缺点:维护复杂,需要定时刷新或触发器;对 6 条消息的场景过度设计

## 决策理由

1. 短期 Memory 是"热数据":用户刚进入就要读,越快越好
2. 数据量小(≤6 条)且允许轻微不一致(快照滞后 1 条没关系)
3. Upstash REST API 对 Vercel serverless/Edge 友好,无连接池问题
4. 出故障可以优雅降级到首次见面模式,业务影响可控
5. 为 Week 3(中期 Memory)和 Week 5(pgvector 长期 Memory)奠定三层 Memory 架构基础

## 后果

**好的**:快速读取、降级路径清晰、架构符合三层 Memory 设计
**坏的**:多一个外部服务需要运维、Upstash 国内延迟约 200-500ms(在 loading 状态掩盖下可接受)
**代价**:需要在 chat route 的 onFinish 里同时维护 PG + Redis 两份写入

## 如果反悔了

- 如果 Upstash 延迟始终不可接受:换成 PG 的 recent_messages view + 简单缓存
- 如果免费 tier 超限:升级或者只在首页读一次 PG(接受稍慢的开场白)
