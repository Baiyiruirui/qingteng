# 0004. 对话模式架构:单 conversations 表 + mode 字段

**日期**: 2026-06-22
**状态**: Accepted

## 背景

Week 3 引入三种对话模式:chat(自由聊天)、roleplay(诗境沉浸)、creative(协同创作)。
需要决定如何在数据层区分三种模式的会话。

## 决策

使用单一 `conversations` 表 + `mode` 字段区分模式,所有模式共享同一消息流。

```
conversations
  id, userId, mode ('chat'|'roleplay'|'creative'), poemId (nullable), createdAt

messages
  id, conversationId, role, content, meta, createdAt  ← 三种模式完全复用
```

额外数据(沉浸脚本、创作框架)存独立表:
- `immersion_scripts` — roleplay 模式的引导脚本,以 poemId 为主键
- 未来 `creative_templates` 可以同样挂在 poemId 下

## 备选方案

### 选项 A:每种模式独立表
`chat_sessions`, `roleplay_sessions`, `creative_sessions`
- 优点:字段完全定制化,没有 nullable 列
- 缺点:消息表要 join 三张 session 表;Memory 系统(short-term/mid-term/long-term)要分别处理三种来源;通用逻辑三份复制

### 选项 B:单表 + mode 字段(选择)
- 优点:
  - 消息流统一:Memory 系统完全复用,无需感知模式差异
  - API 统一:`/api/chat` 路由不需要改(conversationId 已有),onFinish 逻辑一致
  - 查询简单:按 userId 查用户所有对话只需扫一张表
  - 扩展简单:加新模式只需加新 mode 值 + 对应的 prompt 文件

### 选项 C:用 conversation.meta jsonb 存模式信息
- 优点:更灵活
- 缺点:查询需要 jsonb 条件,类型安全差,索引不友好

## 选 B 的理由

1. **Memory 系统无需改动**:短期/中期/长期 Memory 的提取和召回都基于 conversationId + userId,与 mode 无关。如果用独立表,需要联合查询才能给 Memory 系统喂数据
2. **消息流统一**:`/api/chat` route 只需要在 system prompt 里切换(chat 用通用 prompt,roleplay 用沉浸 prompt),不需要不同的持久化逻辑
3. **切换零成本**:模式逻辑在 prompt 层,数据层无感知。Day 2 实现沉浸对话逻辑时,只需要改 system prompt 的构建方式
4. **getOrCreateActiveConversation 简单修改**:只需加 `WHERE mode='chat'` 过滤,不影响现有 chat 逻辑

## chat 模式的特殊处理

`getOrCreateActiveConversation` 加了 `mode='chat'` 过滤:
- chat 模式:复用最近的 chat 对话(就像现在一样)
- roleplay/creative 模式:每次总是新建(用户每次进入一首诗的沉浸都是一次新的体验,不该续接上一次)

这个区别由 `/api/conversations/start` 路由控制:
- mode=chat → 调 `getOrCreateActiveConversation`(复用)
- mode=roleplay/creative → 直接 `createConversation`(新建)

## 后果

**好的**:
- 三层 Memory 系统零修改即可覆盖三种模式
- 消息持久化代码复用率 100%
- 数据库结构简单,运维成本低

**坏的**:
- `poemId` 在 chat 模式下是 null(有 nullable 列)
- 如果未来模式特有字段很多,表会变宽(但目前这些字段都在独立表里,影响可控)
