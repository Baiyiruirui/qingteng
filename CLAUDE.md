# CLAUDE.md · 给 Claude Code 的项目记忆

> 每次新会话开始,先完整读这个文件,再读 `PROJECT_PLAN.md` 和 `README.md`。
> 读完后简短总结一下你理解的项目状态,再开始执行用户指令。

---

## 项目快照

- **名称**:青藤(Qingteng)
- **定位**:面向中学生的对话式古诗词学习产品,有持久 Memory 的 AI 诗友
- **目标**:求职作品集项目(AI 应用工程师方向)
- **GitHub**:https://github.com/Baiyiruirui/qingteng
- **本地路径**:`D:\workspace\projects\qingteng`(Windows + PowerShell)

详细方案见 `PROJECT_PLAN.md`,不要重新做技术选型。

---

## 技术栈(已定,不要改)

- 前端:Next.js 15 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + Zustand + TanStack Query
- 服务:Next.js Server Actions / Route Handlers(不要单独搭 Hono/Express)
- 数据:PostgreSQL (Neon) + pgvector + Upstash Redis(Week 2 接入)+ R2(后续)
- AI:Vercel AI SDK + DeepSeek + Claude Haiku(后续)+ Whisper(Week 4)
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
| Week 2 Day 3 | ✅ | Redis 短期 Memory + 个性化开场白 | `(见下)` |
| Week 2 | ⏳ | 三层 Memory + 会话持久化 | - |
| Week 3 | ⏳ | 诗境沉浸 + 协同创作 MVP | - |
| Week 4 | ⏳ | Whisper 朗读 + 错题本/复习 | - |
| Week 5 | ⏳ | Eval 50 题 + Langfuse + 美术 | - |
| Week 6 | ⏳ | Vercel 部署 + Demo 视频 + 文档 | - |

**完成一个 Day 后必须更新这张表**(把 ⏳ 改 ✅,填 commit hash)。

---

## 用户的环境

- Windows 10/11 + PowerShell(不是 bash,命令要兼容)
- Node.js v24.11.0,pnpm v11.7.0
- npm/pnpm registry 已切到 `https://registry.npmmirror.com`
- 代理:FIClash 127.0.0.1:7890(git 已配)
- VS Code + Claude Code 插件
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

---

## 关键文件位置

```
qingteng/
├── CLAUDE.md                 ← 你正在读的这份
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

- 一首诗的 `dynasty` 字段值是英文 `'Tang'` 而不是 `'唐'`(140 首里就这一首异常),计划 Week 5 数据清洗时统一处理
- localhost:3001 在用户机器上需要走 `127.0.0.1:3001` 或局域网 IP 访问(FIClash 拦截 localhost)

---

## 新会话启动流程

每次用户在一个新的 Claude Code 会话里给你指令时,**按这个顺序响应**:

1. 读 `CLAUDE.md`(本文件)和 `PROJECT_PLAN.md`
2. 跑 `git log --oneline -10` 看最近 commit,判断进度
3. 用一句话总结你理解的当前状态,例如:
   > "已读项目记忆。当前 Week 1 Day 3 完成,140 首诗已入库。最近 commit `xxxx feat: ...`。准备执行你的指令。"
4. **然后才**开始执行用户的新指令

不要每次都问"项目背景是什么",答案在本文件。
