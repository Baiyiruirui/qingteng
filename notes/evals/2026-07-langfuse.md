# Langfuse Observability · 2026-07

## 目标

Phase B 的观测目标是让核心 AI 链路可追踪,用于 README 和面试讲述:每次模型调用能看到 functionId、模型、耗时、token、输入输出与业务 metadata。

## 接入方式

- 使用 AI SDK v6 的 `experimental_telemetry`
- 使用 `src/instrumentation.ts` 在 Next.js Node runtime 注册 `LangfuseSpanProcessor`
- 使用 `src/ai/observability/telemetry.ts` 统一生成 telemetry 配置
- 环境变量使用 Langfuse 官方新名:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGFUSE_BASE_URL`

代码兼容旧名 `LANGFUSE_HOST`,但 `.env.example` 已统一到 `LANGFUSE_BASE_URL`。

## 已覆盖链路

| 链路 | functionId | 关键 metadata |
|---|---|---|
| 日常对话 | `qingteng.chat` | route, userId, conversationId, recalledMemoryCount |
| 个性化开场白 | `qingteng.opening` | route, userId, conversationId, isReturning |
| 出题生成 | `qingteng.quiz.generate.object` / `qingteng.quiz.generate.text-fallback` | version, poemId, type/difficulty 或 pointId/pointType/form |
| 主观题判分 | `qingteng.quiz.judge.object` / `qingteng.quiz.judge.text-fallback` | poemId, questionType, scoringPointCount |
| 长期记忆抽取 | `qingteng.memory.extract` | userId, transcriptChars |

## 验证

- `pnpm build` 通过
- `pnpm eval` 回归 22/22
- 本地 smoke 调用通过,返回"青藤观测OK",预期 Langfuse Tracing 中出现 `qingteng.langfuse.smoke`
- 下一步上线后,在 Langfuse Tracing 页面触发一次 `/chat` 和一次 `/quiz/[poemId]` 判题,确认上述业务 functionId 出现

## 后续

- 50 题黄金集扩容后,把 eval case id 写入 telemetry metadata,方便从失败 case 反查具体 trace
- Langfuse 接入稳定后,README 可补"Eval + Observability"架构图和截图
