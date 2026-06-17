# 002. 流式输出 + 数据库持久化的并发挑战

**相关代码**: `src/app/api/chat/route.ts`
**相关决策**: `notes/decisions/0001-why-drizzle-not-prisma.md`

## 一句话讲点

用 Vercel AI SDK 的 `onFinish` 回调在流结束后写库,实现"流式不阻塞、落库不丢数据"的双赢。

## 30 秒电梯版

AI 流式对话有个经典矛盾:用户体验要求字符即时出现(流式),但数据持久化要求完整的 assistant 回复落库。我用 `streamText` 的 `onFinish` 回调解决这个矛盾——流一边往浏览器发,流结束后在服务端回调里写 PostgreSQL。错误隔离用 `try/catch`,持久化失败只打 log 不影响用户收到回复。

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

### 正确方案:onFinish 回调

```typescript
const result = streamText({
  model,
  messages,
  onFinish: async ({ text, usage, model }) => {
    // 流已经发完,这里异步写库
    try {
      await appendMessage(conversationId, 'assistant', text, { ... })
      await recordEvent({ userId, type: 'chat', ... })
    } catch (e) {
      console.error('[onFinish] failed to persist:', e)
      // 不 throw — 流已经结束,客户端已收到完整回复
    }
  }
})
return result.toUIMessageStreamResponse()
```

关键点:
1. `toUIMessageStreamResponse()` 立即返回响应对象,流开始传输
2. `onFinish` 在流的最后一个 chunk 发出后异步执行
3. 持久化失败只影响数据库,不影响用户已收到的回复
4. 这是 Vercel AI SDK 推荐的标准做法

### 副产品:token 用量追踪

`onFinish` 里拿到 `usage.inputTokens` / `usage.outputTokens` / `usage.totalTokens`,写进 message 的 meta 字段。这是 cost tracking 的基础数据。

### 为什么 runtime 必须是 nodejs

`export const runtime = 'nodejs'`

`onFinish` 里用了 Drizzle(Node.js PG 驱动),不能在 Edge runtime 跑。Edge 只能用 jose 验签,真正的 DB 操作必须在 Node.js。

## 可能的追问

- Q: onFinish 失败了怎么办?用户消息会丢吗?
  A: 用户消息在调 streamText 之前就写入了(同步写),onFinish 只写 assistant 回复。所以最坏情况是 assistant 消息没落库,用户刷新会看到自己发的消息但没有回复——下次发消息时对话上下文会从历史补全。可以加重试队列改善,但对 MVP 够用。

- Q: 为什么不用 toDataStreamResponse 而用 toUIMessageStreamResponse?
  A: AI SDK v6 推荐 UIMessage 格式,和 useChat hook 的消息类型一致,前端不需要额外转换。

- Q: 如果用户发消息特别快连续点发送,会不会乱序?
  A: useChat 会串行化请求(等上一个 ready 再发),前端 disabled 状态限制了并发。服务端按请求到达顺序处理,有轻微乱序风险但对话产品可接受。
