# Phase D-4 题库人工审核闭环 v1

**日期**: 2026-07-09
**阶段**: Phase D · 出题与判题 P0
**结论**: 先用只读审核脚本建立处置闭环,暂不改 schema。

## 问题

出题引擎已经会给 `evidenceValid=false` 题目标记风险,但如果没有统一审核入口,这个标记就只是数据库里的字段,还不算闭环。

需要能回答:

- 哪些题证据失效?
- 哪些题质量分过低?
- 哪些蓝图点缺题或重复?
- 哪些主观题缺 scoringPoints?
- 哪些选择题答案不在选项里?

## 实现

新增 `pnpm audit:quiz`,只读扫描题库并输出处置建议。

检查项:

- `EVIDENCE_INVALID`
- `LOW_QUALITY_SCORE`
- `MCQ_ANSWER_MISMATCH`
- `MISSING_SCORING_POINTS`
- `BLUEPRINT_POINT_MISSING`
- `BLUEPRINT_POINT_DUPLICATE`
- `POEM_MISSING`

v2 demo 题库的问题视为 critical;旧 v1 题的问题先视为 warning,因为当前 demo 流程使用 v2 蓝图题。

蓝图覆盖检查只针对当前 demo 三首诗和已存在 v2 题目的诗。蓝图表里可能存在生成器测试数据,例如《春晓》,不把这类测试蓝图当作缺题。

## 当前策略

不直接加 `disabled` 字段,因为这是 schema 变更。v1 先解决"能发现、能解释、能给动作建议";如果后续要做真正的后台处置,再加:

- `quiz_questions.status = active|needs_review|disabled`
- admin-only 审核页
- regenerate-by-point 操作

## 验收

- `pnpm audit:quiz`: 0 critical issue,22 warnings(旧 v1 题遗留,不进 demo 流程)。
- `pnpm eval`: 62/62。
- `pnpm build`: passed。
