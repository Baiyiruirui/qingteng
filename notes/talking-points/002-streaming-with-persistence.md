# 002. 流式输出 + 数据库持久化的并发挑战

**相关代码**: `src/app/api/chat/route.ts`
**相关决策**: `notes/decisions/0001-why-drizzle-not-prisma.md`

## 一句话讲点

用 Vercel AI SDK 流式输出保证首字体验，再通过轮次幂等、服务端历史重建和恢复队列保证消息最终可靠落库。

## 30 秒电梯版

AI 流式对话有个经典矛盾:用户体验要求字符即时出现,但持久化要求完整回复并保证顺序。当前实现由服务端从 PostgreSQL 重建可信历史,用 `clientMessageId` 和 Redis 轮次锁保证同一轮只生成一次;流结束后写入完整 assistant 回复,失败则进入恢复队列。用户重试同一轮时可以直接重放已完成结果,不会重复计费或生成两份回答。

## 2 分钟深度版

### 问题背景

流式 AI 响应和数据库写入天然矛盾:
- 流式:要尽快把每个 token 发给浏览器,任何阻塞都会造成卡顿
- 落库:需要完整的 assistant 回复才能写入,不能中途截断

### 错误方案:边流边写

把 `streamText` 的 chunk 一边发浏览器一边追加进 DB:
- 每个 token 触发一次 DB 写——性能灾难
- 中途失败留下残缺 message——数据不一致
- DB 写入延迟会反压到流速——用户体验变差

### 当前方案:服务端权威历史 + 幂等轮次 + 恢复队列

```typescript
const history = await loadConversationMessages(conversationId, userId)
const turn = await beginTurn({ conversationId, clientMessageId })

if (turn.kind === 'replay') return replay(turn.assistantText)
if (turn.kind === 'busy') return new Response('turn in progress', { status: 409 })

return streamText({
  model,
  messages: [...history, currentUserMessage],
  abortSignal: req.signal,
  maxOutputTokens,
  onFinish: async ({ text, usage }) => {
    await persistTurnOrQueueRecovery({ turn, text, usage })
  },
}).toUIMessageStreamResponse()
```

关键点:
1. 客户端不再提交可伪造的完整聊天历史,服务端只接受本轮输入
2. `clientMessageId` 是轮次幂等键,Redis 锁和心跳覆盖长时间生成
3. 完成结果写入 Redis,同键重试直接重放,不会再次调用模型
4. PostgreSQL 写入失败会记录恢复任务,后续请求在处理新消息前重试
5. `req.signal`、输出 token 上限和硬超时共同限制失控生成

### 副产品:token 用量追踪

`onFinish` 里拿到 `usage.inputTokens` / `usage.outputTokens` / `usage.totalTokens`,写进 message 的 meta 字段。这是 cost tracking 的基础数据。

### 为什么 runtime 必须是 nodejs

`export const runtime = 'nodejs'`

`onFinish` 里用了 Drizzle(Node.js PG 驱动),不能在 Edge runtime 跑。Edge 只能用 jose 验签,真正的 DB 操作必须在 Node.js。

## 可能的追问

- Q: 流结束后数据库暂时不可用怎么办?
  A: 完整轮次会进入 Redis 恢复队列,下一次请求先重放待恢复写入。已完成结果也按幂等键缓存,用户重试不会再次调用模型。

- Q: 为什么不用 toDataStreamResponse 而用 toUIMessageStreamResponse?
  A: AI SDK v6 推荐 UIMessage 格式,和 useChat hook 的消息类型一致,前端不需要额外转换。

- Q: 如果用户发消息特别快连续点发送,会不会乱序?
  A: 前端仍会限制并发,服务端再用每轮幂等锁兜底。同一 `clientMessageId` 不会并行生成;历史只从该用户拥有的 conversation 读取。
