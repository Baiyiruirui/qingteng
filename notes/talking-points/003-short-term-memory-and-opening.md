# 003. Redis 短期 Memory + LLM 个性化开场白设计

**相关代码**: `src/ai/memory/short-term.ts`, `src/app/api/chat/opening/route.ts`
**相关决策**: `notes/decisions/0002-short-term-memory-redis.md`

## 一句话讲点

不是简单"AI 替你说 hi",而是把上次会话的最后 6 轮对话 + 时间间隔喂给 LLM,让它扮演青藤主动续接上次的话题;Redis 作为快速缓存层,失败可降级到首次见面模式。

## 30 秒电梯版

青藤每次打开对话会主动开场。逻辑分两种:
- **首次见面**:LLM 生成简短自我介绍
- **回访**:把 Redis 里的"上次对话快照"(最近 6 条消息 + 时间戳)拼进 prompt,让 LLM 像老朋友一样续话

开场白用 `generateText`(非流式)生成,落库到 messages 表带 `meta.kind='opening'`,刷新不会重复生成。Redis 出问题时优雅降级,不影响对话主链路。

## 2 分钟深度版

### 为什么用 Redis 而不直接查 PG

每次用户进入 /chat 需要读取"最近几条消息"来生成开场白。可以直接查 `messages` 表,但:
- 查询需要 join conversations,有轻微延迟
- 随着消息增多,全表扫描开销上升
- 最近 6 条消息是"热数据",读多写少,天然适合缓存

Redis Upstash 的 REST API 在 serverless 环境下无需连接池,一次 GET 拿到整个 JSON 快照,延迟约 50-100ms 对比 PG 的 20-50ms 差别不大,但架构上为后续高频读场景(如实时 Memory 注入)留了伸缩空间。

### 为什么开场白要持久化

开场白生成后立刻写进 `messages` 表,带 `meta.kind='opening'`。这样:
- 用户刷新页面不会重新调 LLM 生成(server component 读 DB 发现已有消息就跳过)
- 开场白和普通消息一样有历史记录,下次打开能看到
- 后续 eval(Week 5)可以专门评估开场白质量

### 为什么用 generateText 不用 streamText

开场白是 1-2 句话的短文本。用流式输出反而体验不好——用户会看到文字一个字一个字蹦出来。`generateText` 等待完整结果再展示,体验是"等青藤想好了再说",符合这个角色设定。

### React 18 Strict Mode 双调用问题

在开发模式下,React 18 会 mount → unmount → remount 一次组件来检测副作用。如果在 `useEffect` 里直接调 `/api/chat/opening`,会调两次导致生成两条开场白。

解决:用 `useRef` 做锁:
```typescript
const openingFetched = useRef(false)
useEffect(() => {
  if (openingFetched.current) return
  openingFetched.current = true
  // 只调一次
}, [])
```

第一次 unmount 时 ref 值不会重置(ref 不参与 React 的状态追踪),所以 remount 时 `openingFetched.current` 已经是 `true`,跳过重复调用。

### 降级策略

Redis 出故障时,`getShortTerm` 用 `.catch(() => null)` 吞掉错误,返回 `null`。`buildOpeningUserPrompt` 遇到 `null` snapshot 走首次见面模式,青藤说一句通用欢迎语。整个降级对用户无感,只在 console 留 warning。

## 可能的追问

- Q: 为什么 snapshot 只存 6 条消息,不存全部?
  A: Token 预算。开场白 prompt 已经有 system prompt + snapshot + instruction,全量消息会超出模型上下文预算,而且对生成质量没帮助——最近 6 条已经足以捕捉上次话题。

- Q: 用户删除账号后 Redis 数据怎么处理?
  A: TTL 30 天自动过期。登出时主动 `clearShortTerm`,再次登录换了用户名就是全新的 key。

- Q: 开场白生成失败(LLM 调用超时)怎么办?
  A: `/api/chat/opening` 里任何异常会 500,客户端 `.catch(console.error)` 静默失败,界面不显示任何开场白,用户看到的是空对话——可以正常输入。这是 MVP 的合理妥协。
