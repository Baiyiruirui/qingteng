# AGENTS.md · 给 Codex 的项目记忆

> 每次新会话开始,先完整读这个文件,再读 `CHARTER.md`、`PROJECT_PLAN.md` 和 `README.md`。
> 读完后简短总结一下你理解的项目状态,再开始执行用户指令。

---

## 项目快照

- **名称**:青藤(Qingteng)
- **定位**:面向中学生的对话式古诗词学习产品,有持久 Memory 的 AI 诗友
- **目标**:求职作品集项目(AI 应用工程师方向)
- **当前状态**:后半程按 CHARTER.md 执行。Phase B、Phase C1、Phase C2 和 Phase C3 语义诗词搜索已完成,准备进入 Phase D 优化与技术债清偿
- **章程**:后半程目标/范围/节奏见 `CHARTER.md`;与本文件冲突时,以 `CHARTER.md` 为准
- **线上地址**:https://qingteng-ecru.vercel.app
- **GitHub**:https://github.com/Baiyiruirui/qingteng
- **本地路径**:`D:\workspace\projects\qingteng`(Windows + PowerShell)

详细方案见 `PROJECT_PLAN.md`,不要重新做技术选型。

---

## 技术栈(已定,不要改)

- 前端:Next.js 16 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + Zustand + TanStack Query
- 服务:Next.js Server Actions / Route Handlers(不要单独搭 Hono/Express)
- 数据:PostgreSQL (Neon) + pgvector + Upstash Redis(Week 2 接入)+ R2(后续)
- AI:Vercel AI SDK + DeepSeek + Claude Haiku(后续)+ 腾讯 ASR(朗读评分);出题用 generateObject + Zod 结构化输出 + grounding(poem 数据注入 + evidenceLines 溯源校验)
- 观测:Langfuse(Week 5)+ Sentry(Week 6)
- 部署:Vercel + Neon + Upstash

**明确不做**:Hono、tRPC、mem0、PWA、CN/HK 双语、教师端、闯关地图 UI、生图、Docker。

---

## 进度追踪

每次完成一个 Day 后,在这里加一行,**新会话来的时候你就知道现在做到哪了**。

| Day | 状态 | 关键产出 | Commit |
|---|---|---|---|
| Week 1 Day 1 | ✅ | Next.js + 依赖 + shadcn/ui 初始化 | `9008a13` |
| Week 1 Day 2 | ✅ | Drizzle schema + Neon 接入 + 6 张表 | `dc76ca0` |
| Week 1 Day 3 | ✅ | 140 首诗词数据入库 | `d605eb9` |
| Week 1 Day 4 | ✅ | AI 路由 + 青藤人设 + 流式对话 | `32267c9` |
| Week 2 Day 1 | ✅ | 注册/登录/登出 + JWT cookie + 路由保护 | `b1727d1` |
| Week 2 Day 2 | ✅ | 会话持久化 + 消息写库 + events 数据流 | `2828513` |
| Week 2 Day 3 | ✅ | Redis 短期 Memory + 个性化开场白 | `381ff5b` |
| Week 2 Day 4 | ✅ | 中期 Memory 学习画像 + system prompt 注入 | `4d42b85` |
| Week 2 Day 5 | ✅ | 长期 Memory pgvector RAG + SiliconFlow embedding | `8047605` |
| Week 2 | ✅ | 三层 Memory 全通 + RAG grounding 修复 | `2f1f542` |
| Week 3 Day 1 | ✅ | 对话模式架构 + immersion_scripts 表 + 诗库页 + session 路由 | `c2b6ff0` |
| Week 3 Day 2 | ✅ | roleplay 沉浸对话：immersion prompt + opening + chat API + ImmersionClient UI | `fda6811` |
| Week 3 Day 3 | ✅ | 出题引擎 grounding：evidenceValid 列 + 预生成脚本(36 道入库) + list API + 验证页 | `610073f` |
| Week 3 Day 3 修订 | ✅ | 考点蓝图驱动 v2 出题：quizBlueprints 表 + 蓝图生成器 + 20 道 v2 题(100% evidenceValid) | `a635c8d` |
| Week 3 Day 4 | ✅ | 青藤考你 MVP：scoringPoints + LLM-as-judge + quiz UI + wrong book | `91c7b32` |
| Week 3 | ✅ | 诗境沉浸 + 青藤考你 MVP | `91c7b32` |
| 部署上线 | ✅ | Vercel 上线 qingteng-ecru.vercel.app；Next.js 16 proxy 兼容；CI/CD 踩坑记录 | `64bc816` |
| 美术 Phase A-1 | ✅ | 诗库页精修 + 聊天页 Memory 可视化 + 根路径重定向 + 统一导航 + 公开 demo 防护 + 沉浸剧场化 | `3b759c2` |
| 美术 Phase A-2 | ⏳ | 视觉走查 + 做题页批注细节 + 文档/讲点补齐(可与 Phase B 并行) | - |
| Phase B | 🔨 | Eval v0.2 已扩成 57 checks 并回归 57/57;Langfuse 已接入 chat/opening/quiz-generate/quiz-judge/memory-extract | - |
| Phase C1 | ✅ | 自适应组卷 + 错题专项复习入口 + 学习进度页已落地;Eval 62/62 | - |
| Phase C2 | ✅ | 腾讯 ASR 朗读评分：录音页 + 一句话识别 + 逐字对齐评分 + events 记录;真机验证通过 | - |
| Phase C3 | ✅ | 语义诗词搜索：poem_embeddings + bge-m3 + pgvector 混合检索已落地;140 首诗已回填 | - |
| Phase D-1 | ✅ | 数据验收脚本 + `Tang` 源数据修正 + 构建字体去外部依赖 | `470318a` |
| Phase D-2 | ✅ | Memory 膨胀治理：去重、时间衰减、单用户上限;Eval 62/62 | `1005212` |
| Phase D-3 | ✅ | 沉浸模式 Memory 整合：出境后抽取真实情绪/困惑信号;Eval 62/62 | `4506995` |
| Phase D-4 | ✅ | 题库审核闭环 v1：audit:quiz 0 critical,旧 v1 warning 留痕;Eval 62/62 | `5ec428b` |
| Phase D-5 | 🔨 | 蓝图规模化准备：覆盖 dry-run + 批次/抽检计划 | - |
| Phase D | ⏳ | 优化提纲 P0 清偿(CHARTER.md 第五节) | - |
| Phase E | ⏳ | Demo 视频 + README 终稿 + key 轮换 | - |

**完成一个 Day 后必须更新这张表**(把 ⏳ 改 ✅,填 commit hash)。

---

## 用户的环境

- Windows 10/11 + PowerShell(不是 bash,命令要兼容)
- Node.js v24.11.0,pnpm v11.7.0
- npm/pnpm registry 已切到 `https://registry.npmmirror.com`
- 代理:FIClash 127.0.0.1:7890(git 已配)
- VS Code + Codex 插件
- 已有 API key:DeepSeek ✅,Anthropic ❌,OpenAI ❌
- Neon 数据库 + pgvector 已开

---

## 工作约定(严格遵守)

### 1. 不要重新做技术选型

所有决策已在 `PROJECT_PLAN.md` 定好。除非用户主动提出,不要建议换栈、加新依赖、改架构。

### 2. 每完成小步骤就 commit

Commit message 用 conventional prefix:
- `feat:` 新功能
- `fix:` 修 bug
- `chore:` 杂项(依赖、配置)
- `docs:` 文档
- `refactor:` 重构
- `style:` 格式
- `test:` 测试

例:`feat: add character prompt v1 + streaming chat UI`

### 3. 不可逆决策必须问用户

可以自由决定的:UI 细节、变量命名、文件组织、增加辅助函数。

**必须问用户**:删除已有数据、改数据库 schema(已 migrate 后)、改公开 API 签名、引入未经讨论的新依赖、切换 LLM 模型。

### 4. 装包优先用国内镜像

```powershell
pnpm config set registry https://registry.npmmirror.com
```

超时再换回官方源 + 走代理。

### 5. 不要把秘密写进代码

所有 API key、数据库 URL 走 `.env.local`(已在 `.gitignore`)。
代码里用 `process.env.XXX` 读,**不要硬编码任何 key**。

### 6. 报错处理顺序

遇到错误按这个顺序排查:
1. 网络/镜像问题(超时、ENOTFOUND)
2. 包版本冲突(peer dependency warning)
3. TypeScript 类型错误
4. 业务逻辑 bug

### 7. 重大功能决策由用户拍板

遇到产品方向、功能取舍、技术选型的岔路时,**先列 2-3 个方案 + 建议,等用户确认**,不要自作主张推进。
可以自行决定的:变量命名、UI 细节、辅助函数实现。
必须问用户的:新功能的交互设计、可能影响数据的操作、第三方服务/依赖引入。

---

## 产品模块（三种对话模式）

| 模式 | 入口 | 特点 | 关键文件 |
|---|---|---|---|
| **chat**（日常对话）| `/chat` | 三层 Memory 注入，青藤人设，流式对话 | `src/app/api/chat/route.ts` |
| **roleplay**（诗境沉浸）| 诗库 → 进入沉浸 | 无 Memory 注入，LLM 扮演诗中角色，guided map 教学 | `src/app/api/session/immersion/` |
| **quiz**（青藤考你）| 诗库 → 出题 | 预生成题库，grounding 防幻觉，三层防护 | `src/ai/quiz/` `src/app/api/quiz/` |

### 出题引擎三层防幻觉

1. **Prompt 注入**：出题时把该诗结构化数据（逐句原文/译/释 + themes/imagery/rhetoric）全部注入，明令禁止使用资料之外的知识
2. **generateObject + Zod**：强制 `evidenceLines` 字段至少 1 条，结构化输出不依赖手动 JSON.parse
3. **Post-validation**：代码层验证每条 evidenceLine 去标点后能在原诗语料中找到，不通过则 qualityScore 打折并存入 `evidenceValid=false`

### 考点蓝图（v2，防同质化）

v1 按"题型×难度"机械生成，会扎堆名句、重复考点。v2 改用考点蓝图驱动：
- `data/quiz-blueprints.json`：每首诗人工设计若干互斥考点（绝句 6 个 / 律诗 8 个）
- 考点类型覆盖中考五大能力：默写/炼字/画面/意象/手法/情感/翻译/综合选择
- 蓝图生成器 `src/ai/quiz/generate-blueprint.ts`：为新诗 AI 自动生成蓝图，人工审核后导入

预生成脚本（v2）：`pnpm import:blueprints && pnpm pregenerate:quiz`
已生成：静夜思 6 道 + 九月九 6 道 + 登高 8 道 = **20 道 v2，evidenceValid 100%**

---

## 关键文件位置

```
qingteng/
├── AGENTS.md                 ← 你正在读的这份
├── PROJECT_PLAN.md            ← 完整方案,设计决策都在这
├── README.md                  ← 对外门面
├── .env.local                 ← 密钥(永远不提交)
├── .env.example               ← 密钥模板(可提交)
├── drizzle.config.ts
├── data/poems/                ← 140 首诗词 JSON 数据
├── scripts/
│   ├── import-poems.ts        ← 数据导入
│   └── verify-poems.ts        ← 数据验证
└── src/
    ├── app/
    │   ├── (app)/chat/page.tsx       ← 对话主页
    │   ├── api/chat/route.ts         ← AI 流式接口
    │   └── ...
    ├── ai/
    │   ├── router.ts                  ← 多模型路由
    │   ├── memory.ts                  ← 三层 Memory(Week 2)
    │   └── prompts/v1/
    │       ├── character.ts           ← 青藤人设
    │       └── ...
    ├── db/
    │   ├── schema.ts                  ← Drizzle schema
    │   ├── index.ts                   ← db client
    │   └── migrations/                ← drizzle-kit 生成
    └── components/ui/                  ← shadcn/ui
```

---

## 当前需要关注的已知问题

- localhost:3001 在用户机器上需要走 `127.0.0.1:3001` 或局域网 IP 访问(FIClash 拦截 localhost)
- 数据验收入口为 `pnpm verify:data`; 口径见 `notes/phase-d/2026-07-08-data-readiness.md`

---

## 新会话启动流程

每次用户在一个新的 Codex 会话里给你指令时,**按这个顺序响应**:

1. 读 `AGENTS.md`(本文件)、`CHARTER.md`、`PROJECT_PLAN.md` 和 `README.md`
2. 跑 `git log --oneline -10` 看最近 commit,判断进度
3. 用一句话总结你理解的当前状态,例如:
   > "已读项目记忆。当前 Week 1 Day 3 完成,140 首诗已入库。最近 commit `xxxx feat: ...`。准备执行你的指令。"
4. **然后才**开始执行用户的新指令

不要每次都问"项目背景是什么",答案在本文件。
