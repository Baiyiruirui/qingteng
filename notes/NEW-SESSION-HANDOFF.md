# 青藤 · 新会话接力

更新时间：2026-07-13

## 项目定位

青藤是面向中学生的对话式古诗词学习产品，也是 AI 应用工程师求职作品集。核心叙事不是题库，而是一个有三层 Memory、能带学生入诗、会自适应出题并且可评估观测的 AI 诗友。

- 线上：https://qingteng-ecru.vercel.app
- GitHub：https://github.com/Baiyiruirui/qingteng
- 本地：`D:\workspace\projects\qingteng`
- 环境：Windows + PowerShell；本地访问优先用 `127.0.0.1`

## 新会话启动顺序

1. 完整阅读 `AGENTS.md`。
2. 阅读 `CHARTER.md`、`PROJECT_PLAN.md`、`README.md`。
3. 运行 `git log --oneline -10` 和 `git status --short`。
4. 用一句话总结当前阶段，再执行用户指令。

章程可以修订，但产品方向、范围增补、第三方服务、数据库迁移和公开 API 变更必须先给出建设性方案并让 Owner 拍板。

## 当前状态

| 阶段 | 状态 | 产出 |
|---|---|---|
| Week 1-3 | ✅ | 140 首诗、流式对话、JWT、三层 Memory、诗境沉浸、grounding 出题、LLM-as-judge |
| Phase A P0 | ✅ | 根路径、统一导航、诗笺地图、今日案头、沉浸剧场、内部接口门禁 |
| Phase A-2 | ✅ | 做题页先生批注、全站桌面/移动视觉走查、talking-points 011/012 |
| Phase B | ✅ | Eval v0.2 62/62；Langfuse 覆盖核心 AI 链路 |
| Phase C1 | ✅ | 自适应组卷、错题专项复习、学习进度页 |
| Phase C2 | ✅ | 腾讯 ASR 朗读评分，真机验证通过 |
| Phase C3 | ✅ | bge-m3 + pgvector 混合语义搜索，140 首 embedding 完整 |
| Phase D-1 至 D-7 | ✅ | 数据验收、Memory 治理、沉浸记忆、题库审核、代表集规模化、公开 Demo 成本护栏 |
| Phase D | ✅ | CHARTER 第五节 P0 已关闭；方案 B 为 14 首代表诗深覆盖 |
| Phase E | ⏳ | 3 分钟视频、README 终稿、密钥轮换、最终归档 |

最近关键提交：

```text
695cdd7 style: finish quiz annotations and visual consistency
ddeb9d4 feat(quiz): scale representative v2 bank to 95 questions
dfd1ed2 feat(security): add public demo cost guardrails
40cd3b6 chore(quiz): add blueprint scale dry run (eval 62/62)
5ec428b chore(quiz): add bank audit script (eval 62/62)
4506995 feat(memory): extract immersion signals after roleplay (eval 62/62)
1005212 feat(memory): add decay and pruning policy (eval 62/62)
470318a chore(data): add readiness verification
```

## 当前可验证事实

- `pnpm build` 通过。
- `pnpm eval` 最近基线为 62/62。
- `pnpm verify:data` 是数据完整性入口。
- `pnpm audit:quiz` 当前 0 critical；旧 v1 有 22 个留痕 warning。
- Owner 已选择题库规模方案 B：14 首代表诗、95 道 v2、8 类考点；`verify:quiz:representative` 为 95/95，`audit:quiz` 为 0 critical。
- 140 首结构化诗歌与 embedding 仍完整；其余 126 首没有承诺全量出题，属于作品集发布后的 backlog。
- `pnpm verify:security` 当前 27/27 checks；唯一 warning 是 `QT_ADMIN_USER_IDS` 未配置，因此生产内部工具默认全部拒绝。

## Phase D-6 安全实现

- `src/lib/rate-limit.ts`：复用 Upstash Redis 的固定窗口限流；生产自动启用，Redis 故障时高成本请求 fail closed。
- 登录/注册按 IP 限流；LLM/embedding 按用户与 IP 共享小时预算；腾讯 ASR 单独计量。
- chat/沉浸限制消息角色、条数和上下文长度；判题、搜索、音频都有服务端输入边界。
- 诗笺搜索增加 350ms 防抖，避免逐字触发 embedding。
- 内部 `/quiz-test`、`/api/quiz/list`、`/api/quiz/generate` 继续由 `QT_ADMIN_USER_IDS` 门禁。
- 详细口径：`notes/phase-d/2026-07-10-public-demo-security.md`。

## 密钥状态

腾讯云和 Langfuse 凭据曾出现在协作截图中，必须按已暴露处理。Phase E 的顺序是：创建新 key → 更新本地和 Vercel Production/Preview → redeploy → 验证 trace/朗读/聊天 → 撤销旧 key。`JWT_SECRET` 最后轮换，因为会让所有会话退出登录。

任何日志、笔记、提交和回复都不能打印密钥值。不要自动替用户在第三方后台轮换或撤销凭据。

## 诗歌意境图方案

Owner 已选择“14 首代表诗专属图 + 16 类共用主题图”，以 30 张资产覆盖 140 首诗。完整即梦提示词、文件命名和逐诗映射见 `notes/jimeng-poem-image-prompts.md`，ADR 为 `notes/decisions/0011-poem-image-atlas.md`。当前只完成资产规划，不修改页面；图片经人工生成和验收后，再决定优先接入朗读页还是统一诗歌详情页。

## 下一步建议

进入 Phase E，按发布前顺序推进：

1. 补 Demo 视频脚本与 README 终稿，使用真实口径“140 首基础内容 + 14 首/95 道深题库”。
2. 按安全清单轮换腾讯云和 Langfuse 密钥，再更新 Vercel 并复验聊天、trace、朗读。
3. 完成 3 分钟 Demo 视频与最终归档。

## 工作纪律

- 技术栈已定，不重新选型，不新增章程外功能。
- 改 `src/ai/prompts/` 必跑 `pnpm eval`，commit message 写结果。
- 每个有意义的小步必须 build、commit、push，并更新 `AGENTS.md` 进度表。
- 不得改动或提交既有未跟踪的 `.claude/`、`outputs/`、`TALKING-POINTS-SUMMARY.md`，除非 Owner 明确要求。
- Windows 上运行 tsx 脚本若遇到 EPERM，先设置项目内临时目录：

```powershell
$env:TMP="$PWD\.tmp"
$env:TEMP="$PWD\.tmp"
New-Item -ItemType Directory -Force .tmp | Out-Null
```
