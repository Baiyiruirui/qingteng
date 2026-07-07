# 青藤 · Qingteng

> 一个有记忆、会陪你长大的 AI 诗友。
> An AI-native classical Chinese poetry learning companion with persistent memory.

🔗 **Live Demo**: https://qingteng-ecru.vercel.app

![Status](https://img.shields.io/badge/status-deployed-brightgreen)
![Stack](https://img.shields.io/badge/stack-Next.js_16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 一句话定位

面向中学生的对话式古诗词共学产品。和现有"题库 + 闯关"类应用最大的不同——**核心不是内容，是 AI 角色与你的长期关系**。

---

## 为什么做这个

市面上的古诗词应用 90% 是"内容 + 题库 + 闯关"形态——本质是把纸质练习册搬上屏幕，AI 只是用来出题和判分的工具。但 LLM 真正擅长的是**对话、角色扮演、长期陪伴**。

青藤想验证一个假设：**当 AI 真的"认识"一个学生，记得他学过哪首、卡在哪、为哪句诗动过容，学习的化学反应会完全不一样。**

---

## 核心产品差异

| 场景 | 现有产品 | 青藤 |
|---|---|---|
| 打开 App | 闯关地图 / 题目列表 | 青藤先生基于学习画像的个性化开场白 |
| 学一首诗 | 看翻译 + 听朗读 + 做题 | **诗境沉浸** — AI 扮演诗中角色带你进入场景 |
| 出题练习 | 通用题库，AI 即时出题 | **青藤考你** — 基于 grounding 防幻觉出题，evidenceLines 强制溯源 |
| 写诗 | 没这个功能 | AI 协同创作，实时韵脚 + 对仗反馈 |
| 朗读 | 录音对照原文 | Whisper 转写 + 拼音相似度评分 |
| 记忆 | 仅记录答题历史 | 三层 Memory（短期会话 / 中期画像 / 长期诗友记忆） |

---

## 技术亮点（面向 AI 应用工程师视角）

### 🧠 自建三层 Memory 系统

```
短期 Memory  →  Redis            会话上下文
中期 Memory  →  PostgreSQL       学习画像、近 7 天行为
长期 Memory  →  pgvector         "用户喜欢豪放派"、"上次为李清照动容"
```

每次对话前三层 Memory 拼成 system prompt 注入 —— 把"ChatGPT 套壳"和"真正的 AI 应用"区分开。

### 🎯 多模型路由 + 成本控制

| 任务 | 模型 | 理由 |
|---|---|---|
| 角色对话 | Claude Haiku | 体验关键，要稳 |
| 出题 / 批改 | DeepSeek Chat | 30x 成本优势，质量够用 |
| 朗读评分 | Whisper API | 多模态必需 |

整体 token 成本预估降低 80% 而体验不降级。

### 🔒 结构化输出，告别 JSON.parse 翻车

所有 LLM 返回都用 Vercel AI SDK + Zod schema 强约束：

```ts
const QuizQuestion = z.object({
  type: z.enum(['mcq', 'fill', 'translate', 'appreciate']),
  stem: z.string().min(8),
  answer: z.string(),
  evidenceLines: z.array(z.string()).min(1),  // 必须引用原诗
  qualityScore: z.number().min(0).max(1)
})
```

### 🛡️ Grounding 出题 — 根治 LLM 知识幻觉

LLM 出古诗题容易把典故安在错误的诗句上（案例：《登高》"一句八意"被安在首联写景，正确指向是颈联"万里悲秋常作客"）。三层防护：

1. **Prompt 注入权威资料** — 出题前把该诗逐句原文 + 译 + 释 + 修辞意象全部注入，明令禁止使用资料外知识
2. **generateObject + Zod** — 强制 `evidenceLines` 字段，LLM 必须声明每道题的原诗依据
3. **Post-validation 字符串匹配** — 代码层验证 evidenceLines 真实存在于原诗，不通过标记 `evidenceValid=false` 并降低 qualityScore

### 📊 Eval 驱动开发

50 题黄金集 + Langfuse 全链路 trace。每次 Prompt 改动都跑评估，看准确率 diff —— 把 AI 应用当软件做，不是当玄学做。

---

## 技术栈

```
前端  Next.js 16 (App Router) + TypeScript (strict)
      Tailwind v4 + shadcn/ui + Framer Motion
      Zustand + TanStack Query

服务  Next.js Server Actions / Route Handlers
      Drizzle ORM + Zod

数据  PostgreSQL (Neon) + pgvector + Upstash Redis + R2

AI    Vercel AI SDK
      DeepSeek · Claude Haiku · Whisper
      自建 Memory + 多模型路由 + Prompt 版本化

观测  Langfuse · Sentry · Vercel Analytics
部署  Vercel (全 serverless)
```

---

## 项目进度

> 6 周开发计划已完成 Week 1-3 并上线。当前后半程按 [CHARTER.md](./CHARTER.md) 推进，Phase A 的 P0 demo 落地缺口已收口，准备进入 Phase B（Eval + Langfuse）。

| 周次 | 主题 | 状态 |
|---|---|---|
| 1 | 基建 + 140 首诗数据迁移 | ✅ 完成 |
| 2 | 角色对话核心 + 三层 Memory | ✅ 完成 |
| 3 | 诗境沉浸 + 青藤考你（grounding 出题） | ✅ 完成 — 已部署上线 qingteng-ecru.vercel.app |
| Phase A | 美术与 demo 信息架构收口 | ✅ P0 完成 — 根路径、统一导航、公开 demo 防护、沉浸剧场化 |
| Phase B | Eval 黄金集 + Langfuse 接入 + 基线报告 | 🔨 Eval v0.2 回归 57/57；Langfuse 核心链路已接入 |
| Phase C | 自适应出题 / Whisper / 语义搜索 | ⏳ |
| Phase E | 3min Demo 视频 + 文档 | ⏳ |

详细方案见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。

---

## 数据基础

140 首诗词数据，每首带结构化标注：

- 朝代 / 作者 / 学段 / 体裁
- 主题（themes）/ 意象（imagery）/ 修辞（rhetoric）
- 逐句翻译 + 关键词 + 释义

数据来自前置版本的人工标注 + LLM 补全。

---

## 本地开发

> 文档处于早期阶段，详细步骤陆续补全。

```bash
# 装依赖
pnpm install

# 配环境变量
cp .env.example .env.local
# 填入 DATABASE_URL（Neon）、DEEPSEEK_API_KEY 等

# 数据库迁移
pnpm drizzle-kit migrate

# 导入诗词数据
pnpm tsx scripts/import-poems.ts

# 启动
pnpm dev
```

需要的服务账号：

- [Neon](https://neon.tech) — PostgreSQL 数据库（免费 tier 够用）
- [DeepSeek](https://platform.deepseek.com) — 出题 / 批改
- [Anthropic](https://console.anthropic.com) — 角色对话（可选，未配置时降级到 DeepSeek）
- [Langfuse](https://cloud.langfuse.com) — LLM 观测（可选）

---

## Roadmap 之外（如果时间允许）

- 教师端 SaaS（班级管理 + 自动诊断报告）
- 微信小程序版本
- 词牌创作模式（增加难度梯度）
- 多人协作飞花令

---

## 作者

[@Baiyiruirui](https://github.com/Baiyiruirui)

这是一个求职作品集项目，目标是 AI 应用工程师方向。如果你是面试官或同行，欢迎在 [Issues](../../issues) 留言交流。

---

## License

MIT
