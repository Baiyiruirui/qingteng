# Phase D-3 沉浸模式 Memory 整合

**日期**: 2026-07-09
**阶段**: Phase D · Memory 系统 P0
**结论**: 沉浸模式继续不注入历史 Memory,但每轮沉浸对话结束后会异步抽取真实学生信号并写入长期 Memory。

## 问题

沉浸模式是青藤最强的体验入口,学生更容易在里面说出情绪、共鸣和困惑。但之前沉浸链路只写 `messages` 和 `events`,不会沉淀长期记忆。

这会损失一类很有价值的信号:

- "这位学生在《登高》里说出了自己的孤独感"
- "这位学生在《夜雨寄北》里分不清现实与想象的转换"
- "这位学生更愿意从场景进入诗,而不是先听讲解"

## 边界

沉浸模式不能直接复用普通 chat 的记忆抽取,因为学生可能在扮演角色。

不应记录:

- "我提着酒走在山路上"这类角色扮演剧情
- 诗中角色的经历
- 青藤的台词
- 纯剧情推进或寒暄

应记录:

- 学生真实表达出的情绪和共鸣
- 学习卡点
- 明确偏好
- 个人片段

## 实现

- 新增 `src/ai/prompts/v1/immersion-memory.ts`,专门约束沉浸抽取边界。
- `extractImmersionAndStore()` 复用长期 Memory 的归一化、去重、weight 刷新和上限治理。
- `/api/session/immersion/chat` 在 `onFinish` 中 fire-and-forget 触发抽取,不阻塞流式回复。
- Langfuse trace 仍走 `qingteng.memory.extract`,metadata 里用 `mode=immersion-memory-extract` 区分。

## 设计取舍

沉浸时不注入三层 Memory,避免用户上次的偏好打断当前诗境;沉浸后再抽取 Memory,让体验信号回流到长期画像。也就是:

> 入境时保持纯净,出境后留下痕迹。

## 验收

- `pnpm eval`: 62/62。
- `pnpm build`: passed。
