# 青藤 · 项目计划与执行指南

> 这份文档既是给开发者看的方案，也是给 **Claude Code 接手时的上下文**。
> 决策已经定了，**不要重新讨论选型**，按本文档直接执行。

---

## 1. 项目定位

**青藤**——一个有记忆、会陪你长大的 AI 诗友。

面向中学生的对话式古诗词共学产品。差异化不在"内容多/题目准"，而在：

1. **常驻 AI 角色（青藤先生）**：有人设、有 Memory，记得每个学生学过什么、卡在哪
2. **对话开场**：打开 App 不是闯关地图，是基于学习画像的个性化开场白
3. **诗境沉浸**：进入诗后可切角色扮演模式（你是李白，今晚⋯⋯）
4. **AI 协同创作**：和 AI 一起写诗，韵脚检测 + 对仗建议
5. **朗读对练**：Whisper API 评分

**这是一份求职作品集项目**，目标是 AI 应用工程师岗位面试。所有取舍以"招聘 ROI"为优先级。

---

## 2. 技术栈（已定，不要改）

```
前端  Next.js 15 App Router + TypeScript (strict) + Tailwind v4 + shadcn/ui
      Zustand (UI 状态) + TanStack Query (服务端) + Framer Motion (基础动效)

服务  Next.js Server Actions / Route Handlers (不要单独搭 Hono/Express)
      Drizzle ORM + Zod schema 校验

数据  PostgreSQL (Neon) + pgvector (Memory) + Upstash Redis (Session/限流) + R2/S3 (音频)

AI    Vercel AI SDK (generateObject / streamText)
      模型路由：DeepSeek (出题/批改) + Claude Haiku (角色对话) + Whisper (朗读)
      自建三层 Memory（短期 Redis / 中期 PG 表 / 长期 pgvector）
      Langfuse trace + 50 题黄金集 Eval

观测  Langfuse · Sentry · Vercel Analytics
部署  Vercel + Neon + Upstash（全 serverless，不要 Docker）
```

**明确不做**：Hono、tRPC、mem0、PWA、CN/HK 双语、教师端、闯关地图 UI、腾讯混元生图、Docker。

---

## 3. 目录结构

```
qingteng/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/
│   │   │   ├── chat/page.tsx           # 对话开场（首屏）
│   │   │   ├── poem/[id]/page.tsx      # 单首诗
│   │   │   └── creative/page.tsx       # AI 协同创作
│   │   └── api/
│   │       ├── chat/route.ts           # AI 流式对话
│   │       ├── quiz/route.ts           # 出题/批改
│   │       └── recite/route.ts         # Whisper 朗读评分
│   ├── db/
│   │   ├── schema.ts                   # Drizzle schema
│   │   ├── index.ts                    # db client
│   │   └── migrations/                 # drizzle-kit 生成
│   ├── ai/
│   │   ├── router.ts                   # 多模型路由
│   │   ├── memory.ts                   # 三层 Memory
│   │   ├── prompts/v1/
│   │   │   ├── character.ts            # 青藤人设 system prompt
│   │   │   ├── quiz.ts                 # 出题 prompt
│   │   │   └── judge.ts                # 批改 prompt
│   │   └── evals/
│   │       └── golden-50.json          # Week 5 写
│   ├── components/
│   │   └── ui/                         # shadcn 生成
│   └── lib/
│       └── cn.ts                       # tailwind merge
├── scripts/
│   └── import-poems.ts                 # 把老项目 100 首诗导入 PG
├── data/
│   └── poems/                          # 从老项目 dataset/poems/ 复制过来
├── drizzle.config.ts
├── .env.local                          # 不提交
├── .env.example                        # 提交
└── package.json
```

---

## 4. Roadmap（6 周）

| 周 | 主题 | 关键交付 |
|---|---|---|
| **1** | 基建 + 数据迁移 | 项目跑通、Drizzle schema 上线、100 首诗导入 PG |
| **2** | 角色对话核心 | 青藤 system prompt + 三层 Memory + 流式对话 |
| **3** | 诗境沉浸 + 创作 MVP | 2-3 首诗精雕角色扮演 + 韵脚检测 + LLM 对仗 |
| **4** | 朗读评分 + 老功能迁移 | Whisper 集成 + 错题本/复习 |
| **5** | Eval + 优化 + 美术 | 50 题黄金集 + Langfuse + 视觉终稿 |
| **6** | Demo + 部署 + 文档 | Vercel 上线 + 3min 视频 + 架构 README |

每周末必须**能跑、能 demo**，不要憋大招。

---

## 5. Week 1 执行清单

### Day 1：项目初始化

**前置环境**（Windows PowerShell）：

```powershell
# 1. 确认 Node >= 20
node -v

# 2. 装 pnpm（如果没有）
npm install -g pnpm

# 3. 切国内镜像（避免装包超时）
pnpm config set registry https://registry.npmmirror.com

# 4. 创建项目
pnpm create next-app@latest qingteng --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint
cd qingteng

# 5. 装核心依赖
pnpm add ai @ai-sdk/anthropic @ai-sdk/deepseek @ai-sdk/openai
pnpm add drizzle-orm postgres
pnpm add zod zustand @tanstack/react-query
pnpm add lucide-react clsx tailwind-merge framer-motion

# 6. 装 dev 依赖
pnpm add -D drizzle-kit tsx @types/node

# 7. shadcn/ui 初始化（交互问题全选默认）
pnpm dlx shadcn@latest init

# 8. 装第一周要用的 UI 组件
pnpm dlx shadcn@latest add button input card scroll-area avatar separator
```

**验证**：`pnpm dev` 能打开 http://localhost:3000

### Day 2：数据库 + Drizzle schema

**注册 Neon**（免费 tier）：https://neon.tech → 拿到 connection string

**`.env.local`**：

```env
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
DEEPSEEK_API_KEY=sk-xxx
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

**`drizzle.config.ts`**：

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

**`src/db/index.ts`**：

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!, { max: 1 })
export const db = drizzle(client, { schema })
```

**`src/db/schema.ts`**（核心表，Week 1 先建这些）：

```ts
import { pgTable, text, integer, timestamp, jsonb, real, uuid, vector } from 'drizzle-orm/pg-core'

// 诗词
export const poems = pgTable('poems', {
  id: text('id').primaryKey(),                    // TANG_001
  title: text('title').notNull(),
  author: text('author').notNull(),
  dynasty: text('dynasty'),
  grade: text('grade'),                           // 小学/初中/高中
  textType: text('text_type'),                    // 五言绝句等
  themes: jsonb('themes').$type<string[]>(),
  imagery: jsonb('imagery').$type<string[]>(),
  rhetoric: jsonb('rhetoric').$type<string[]>(),
  lines: jsonb('lines').$type<PoemLine[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export type PoemLine = {
  lineId: string
  content: string
  imagery?: string[]
  emotion?: string[]
  translation?: string
  translationKeywords?: string[]
  explanation?: string
}

// 用户
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// 学习事件（保留老项目设计思想，增量算画像用）
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),                   // chat / quiz / recite / draw...
  poemId: text('poem_id').references(() => poems.id),
  meta: jsonb('meta'),
  score: real('score'),
  createdAt: timestamp('created_at').defaultNow(),
})

// 对话会话
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  poemId: text('poem_id').references(() => poems.id),
  mode: text('mode').notNull(),                   // chat / roleplay / creative
  createdAt: timestamp('created_at').defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  role: text('role').notNull(),                   // system / user / assistant
  content: text('content').notNull(),
  meta: jsonb('meta'),                            // 模型、token、cost
  createdAt: timestamp('created_at').defaultNow(),
})

// 长期 Memory（Week 2 启用 pgvector）
export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  source: text('source'),                         // chat / quiz_wrong / explicit
  weight: real('weight').default(1),
  createdAt: timestamp('created_at').defaultNow(),
})
```

**生成迁移并执行**：

```powershell
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

进 Neon 控制台手动执行一次：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Day 3-4：导入老项目的 100 首诗

把老项目 `dataset/poems/*.json` 复制到 `data/poems/`。

写 `scripts/import-poems.ts`：

```ts
import 'dotenv/config'
import { db } from '@/db'
import { poems } from '@/db/schema'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const dir = 'data/poems'
  const files = await readdir(dir)
  let count = 0
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const raw = await readFile(join(dir, file), 'utf-8')
    const p = JSON.parse(raw)
    await db.insert(poems).values({
      id: p.poem_id,
      title: p.title,
      author: p.author,
      dynasty: p.dynasty,
      grade: p.grade,
      textType: p.text_type,
      themes: p.themes ?? [],
      imagery: p.imagery ?? [],
      rhetoric: p.rhetoric ?? [],
      lines: p.lines.map((l: any) => ({
        lineId: l.line_id,
        content: l.content,
        imagery: l.imagery,
        emotion: l.emotion,
        translation: l.translation,
        translationKeywords: l.translation_keywords,
        explanation: l.explanation,
      })),
    }).onConflictDoNothing()
    count++
  }
  console.log(`Imported ${count} poems.`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

执行：

```powershell
pnpm tsx scripts/import-poems.ts
```

### Day 5-6：第一个 AI 路由（验证全链路）

**`src/ai/router.ts`**：

```ts
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createAnthropic } from '@ai-sdk/anthropic'

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! })
const anthropic = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export const route = {
  characterDialog: anthropic?.('claude-3-5-haiku-latest') ?? deepseek('deepseek-chat'),
  quizGenerate: deepseek('deepseek-chat'),
  quizJudge: deepseek('deepseek-chat'),
} as const
```

**`src/app/api/chat/route.ts`**（第一个流式接口）：

```ts
import { streamText } from 'ai'
import { route } from '@/ai/router'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = streamText({
    model: route.characterDialog,
    system: '你是青藤先生，一位温和、博学的古诗词老师，正在和一位中学生对话。',
    messages,
  })
  return result.toDataStreamResponse()
}
```

**简易前端测试页 `src/app/(app)/chat/page.tsx`**：

```tsx
'use client'
import { useChat } from 'ai/react'

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="space-y-3 mb-4">
        {messages.map(m => (
          <div key={m.id} className="rounded p-3 bg-stone-100">
            <b>{m.role}:</b> {m.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={handleInputChange}
          placeholder="和青藤先生聊聊..."
        />
        <button className="bg-stone-800 text-white px-4 rounded">发送</button>
      </form>
    </div>
  )
}
```

**Week 1 成功标准**：访问 `/chat`，能和青藤先生流式对话，消息可读、字符流式出现。

---

## 6. 给 Claude Code 的工作约定

- **不要重新做技术选型**。决策已定，按本文档执行。
- **每完成一步，先运行验证再继续**。例如装完依赖跑 `pnpm dev`，写完 schema 跑 `pnpm drizzle-kit generate`。
- **代码风格**：TypeScript strict、函数式优先、组件小而专注、命名清晰胜过注释。
- **遇到设计岔路**（比如某个 UI 组件用什么、某个表加什么字段），用工程默认值前进，**不要停下来问**——除非是不可逆决策（删数据、改 schema 迁移、改公开 API）。
- **每个 PR 心智的小步骤**完成后，写一条 commit message：feat/fix/chore/refactor: 一句话。
- **报错处理优先级**：网络/镜像问题 → 包版本冲突 → TS 类型 → 业务 bug。
- **不确定时**问的对象：先问代码（read existing files），再问文档（pnpm/Next.js/Drizzle 官网），最后才问用户。

---

## 7. 老项目可复用的资产

老项目位于用户本地（路径用户自己知道），其中**值得迁移**的：

1. `dataset/poems/*.json` 100 首唐诗 + 扩展，结构完整（`themes`/`imagery`/`rhetoric`/`lines` 都有），**直接迁**
2. `src/i18n.js` 词表里 CN 部分的教育术语（可参考但不强迁，本项目暂不做 HK）
3. 学习画像 / 间隔复习 / 知识图谱的**算法思路**（具体实现重写）

**不要复用**：
- `server.js` 1940 行单文件（架构已经不一样）
- `index.html` 4604 行单文件（前端推倒重做）
- 任何 PowerShell `*.log` 文件、Python legacy 目录、SQLite 文件
