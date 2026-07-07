# 青藤 · 新会话引导文档
> 把这段话粘贴到新的 Claude Code 对话开头，作为第一条消息发送。

---

## 你是谁、在做什么

你是我的 AI 编程搭档，我们正在合作开发「青藤」——一个面向中学生的对话式古诗词学习 App，有持久 Memory 的 AI 诗友。这是我的求职作品集项目，目标职位：AI 应用工程师。

项目已上线：https://qingteng-ecru.vercel.app
GitHub：https://github.com/Baiyiruirui/qingteng
本地路径：`D:\workspace\projects\qingteng`（Windows + PowerShell）

---

## 第一件事：读文件，再开口

每次新会话，**按顺序做完这四步，再执行任何指令**：

```
1. 读 CLAUDE.md        ← 项目记忆，进度表，工作约定
2. 读 CHARTER.md       ← 后半程目标、范围、砍单顺序
3. 读 PROJECT_PLAN.md  ← 完整技术方案，不要重新做技术选型
4. git log --oneline -10  ← 确认当前实际进度
5. 用一句话总结你的理解，然后才开始工作
```

---

## 项目现状速览（截至本次会话）

### 功能进度

| 阶段 | 状态 | 核心产出 |
|---|---|---|
| Week 1 | ✅ | Next.js 初始化 + Drizzle schema + 140 首诗入库 + AI 流式对话 |
| Week 2 | ✅ | 注册登录 JWT + 会话持久化 + 三层 Memory（Redis短期/pg中期/pgvector RAG长期） |
| Week 3 | ✅ | 诗境沉浸 roleplay + 青藤考你（出题引擎 grounding + LLM-as-judge）|
| 部署上线 | ✅ | Vercel + Neon + Upstash 全通，CI/CD 踩坑记录完整 |
| **Phase A** | ✅ **P0 收口完成** | 登录/注册 + 诗库 + 聊天页第一轮水墨化;根路径/导航/demo 防护/沉浸剧场化已完成 |
| **Phase B** | ⏳ **下一步** | Eval 黄金集 + Langfuse 观测 + 基线报告 |
| Phase C1 | ⏳ | 难度自适应出题 + 错题专项复习 |
| Phase C2/C3 | ⏳ | Whisper 朗读评分 + 语义诗词搜索(按 CHARTER 砍单顺序保留弹性) |
| Phase E | ⏳ | Demo 视频 + README 终稿 + key 轮换 |

### Phase A：已做 vs 待做

**已完成：**
- 全站颜色/字体 token → `src/app/globals.css` 的 `@layer base :root` + `@theme inline`
- Noto Serif SC 引入（next/font/google + CSS @import 双路）
- 全局 SVG 噪点纹理层（layout.tsx，opacity 0.04）
- 登录/注册页：三层水墨背景（PNG 纹理 + ink-scene.png + CSS 月晕）+ 竖排诗 + 精修卡片（Seal 印章 + CornerMark 四角回纹 + InkField 输入框）
- 新组件：`src/components/Seal.tsx`、`src/components/VerticalPoem.tsx`
- 新动效 keyframe：`animate-ink-rise`、`animate-moon-breathe`、`animate-vine-sway`
- 诗库页第一轮精修（commit `c67dc3e`）
- 聊天页重设 + 「青藤记得你」Memory 可视化（commit `03875a5`）
- P0 demo 落地收口（commit `3b759c2`）：`/` 按登录态重定向、统一 AppNav、公开 demo 调试/高成本接口门禁、隐藏未完成 creative 入口、沉浸页改成「诗境剧场」

**待做（下一步）：**
- Phase B：先做 Eval + Langfuse，证明出题/判题系统可靠性
- Phase A 尾巴可并行：做题页「先生批注」细节、桌面/移动端视觉走查、补 `notes/talking-points/011` 和 `012`
- 不再继续深挖诗库视觉原型，除非出现明确 demo 硬伤

---

## 技术栈（已定，不要动）

```
前端：Next.js 16 App Router + TypeScript strict + Tailwind v4 + shadcn/ui + Framer Motion
AI：  Vercel AI SDK + DeepSeek（chat/judge）
数据：Neon PostgreSQL + pgvector + Upstash Redis
部署：Vercel（auto deploy on push to main）
```

**不做**：Hono、tRPC、mem0、PWA、Docker、教师端。

---

## 关键文件地图

```
qingteng/
├── CLAUDE.md                    ← 必读：项目记忆 + 进度表 + 工作约定
├── PROJECT_PLAN.md              ← 必读：完整方案，设计决策都在这
├── DESIGN_SYSTEM.md             ← 设计规范：颜色/字体/动效/纹理/组件
├── notes/
│   ├── talking-points/          ← 面试讲点（001-010，格式见 _template.md）
│   ├── decisions/               ← 技术决策记录
│   ├── bugs/                    ← 已修复的 bug 记录
│   └── prompt-feedback/         ← AI prompt 调优记录
├── src/
│   ├── app/
│   │   ├── globals.css          ← 所有设计 token 的唯一来源
│   │   ├── layout.tsx           ← 全局字体 + SVG 噪点底层
│   │   ├── (auth)/login/        ← 登录页（已精修，水墨风）
│   │   ├── (auth)/register/     ← 注册页（已精修，水墨风）
│   │   ├── (app)/poems/         ← 诗库页（待精修）
│   │   ├── (app)/chat/          ← 聊天页（待精修）
│   │   ├── (app)/quiz/          ← 做题页（仅 token 统一，待定妆）
│   │   └── (app)/session/       ← 沉浸页（仅 token 统一，待定妆）
│   ├── ai/
│   │   ├── router.ts            ← 多模型路由
│   │   ├── memory.ts            ← 三层 Memory 实现
│   │   └── quiz/                ← 出题引擎 + LLM-as-judge
│   ├── components/
│   │   ├── Seal.tsx             ← 精细朱砂印章 + CornerMark（登录页用）
│   │   ├── SealStamp.tsx        ← 简版 SVG 印章（其他页用）
│   │   ├── VerticalPoem.tsx     ← 竖排诗句（登录/注册页用）
│   │   └── ui/                  ← shadcn/ui 组件
│   ├── db/
│   │   ├── schema.ts            ← Drizzle 6 张表定义
│   │   └── migrations/          ← drizzle-kit 生成（不要手动改）
│   └── lib/
│       ├── motion.ts            ← inkFadeIn / inkFadeInStagger variant
│       └── poems.ts             ← 登录/注册页静态诗数据（静夜思/竹里馆）
├── public/
│   ├── ink-scene.png            ← 水墨主视觉（藤蔓+远山）
│   ├── paper-texture.png        ← 宣纸纤维纹理
│   └── ink-mountains.png        ← 远山备用（暂未使用）
└── data/poems/                  ← 140 首诗词 JSON（已入库，勿动）
```

---

## 设计系统现状（重要，做美术时必读）

**颜色 token 的唯一来源**：`src/app/globals.css`

目前有**两套命名同时存在**（历史原因，值完全一致）：

| 套 | 前缀 | 示例 | 用在哪 |
|---|---|---|---|
| A（旧） | `qt-` | `bg-qt-paper`、`text-qt-ink` | 诗库页、聊天页、做题页 |
| B（新，v0 短名） | 无 | `bg-paper`、`text-ink`、`text-jade` | 登录/注册页 |

做美术精修时，**新改的代码统一用 B 套（短名）**，旧代码可以随手替换但不强制。最终目标是全站统一到 B 套。

**颜色值参考**：

```
宣纸底色：paper #F7F4EC  paper-block #F2EDE0  edge #D8CFBC
墨色：    ink #2E3A34  ink-mid #5E6E68  ink-faint #9A9384
绿：      jade #6E8B7E
朱砂：    cinnabar #C0623F
暖月：    moon #E8C9A0
按钮墨底：#3A4742（暂无 token，用 inline style）
```

**动效 CSS 类**（globals.css 中，可直接用）：
- `animate-ink-fade-in` — 通用入场，0.5s（服务端组件用，不依赖 Framer Motion）
- `animate-ink-rise` — 登录页入场，1.1s，带 blur
- `animate-moon-breathe` — 月晕呼吸，9s 循环
- `animate-vine-sway` — 藤蔓轻摆，11s 循环

**Framer Motion**（客户端组件用）：
- `inkFadeIn` 和 `inkFadeInStagger` 在 `src/lib/motion.ts`，直接 import 用

---

## 笔记管理体系（必须维护，别让它烂掉）

这个项目有完整的笔记体系，是面试准备的核心资产。**每次实现一个重要功能，都要同步更新对应的 note。**

### notes/talking-points/（面试讲点，最重要）

已有 010 篇，格式见 `_template.md`：

```
001 三层 Memory 设计
002 流式对话 + 持久化
003 短期 Memory + 个性化开场白
004 中期 Memory 学习画像
005 长期 Memory pgvector RAG
006 语义诗词搜索
007 沉浸模式 vs 问答模式的教学逻辑
008 grounding 防幻觉出题
009 LLM-as-judge 主观题评分
010 部署踩坑全记录
```

每篇分三段：一句话讲点 / 30 秒电梯版 / 2 分钟深度版 + 可能的追问。

**美术阶段完成后要补写：**
- `011-design-token-system.md` ← 设计 token 方法论，Tailwind v4 @theme inline
- `012-v0-to-production.md` ← v0 设计稿接入生产代码的工程实践

### notes/decisions/、notes/bugs/、notes/prompt-feedback/

- `decisions/`：技术岔路口的选择记录（"为什么选 A 不选 B"）
- `bugs/`：已修复 bug 的根因 + 解法（防止重犯）
- `prompt-feedback/`：AI prompt 调优的记录（改了什么、效果如何）

---

## 工作约定（严格遵守，不要走样）

### Commit 规范

```
feat:     新功能
fix:      修 bug
chore:    依赖、配置
docs:     文档
refactor: 重构
style:    格式
test:     测试
```

**Commit message 不能有 `Co-authored-by: Claude` 字样** — Vercel 免费版会把它当多人协作，拦截部署。每次 commit 只用用户自己的身份。

### 每步完成必须 commit + push

- push 之后 Vercel 自动部署（约 1-2 分钟）
- 绝对不能只 commit 不 push（吃过亏：本地有 ≠ 线上有）

### 改代码的边界

**可以自行决定**：UI 细节、变量命名、辅助函数、组件内部实现
**必须问用户**：引入新依赖、改 DB schema（已 migrate）、改公开 API 签名、删数据、切换 LLM 模型、任何不可逆操作

### pnpm build 必须通过才 commit

每次改完代码先跑 `pnpm build`，TypeScript 0 错误、0 警告才提交。

### 环境配置

```
Node v24.11.0 / pnpm v11.7.0
registry: https://registry.npmmirror.com
代理: FIClash 127.0.0.1:7890（git 已配）
访问本地开发: 127.0.0.1:3000（不是 localhost，FIClash 会拦）
```

---

## 当前已知问题（别踩坑）

1. 一首诗的 `dynasty` 字段是英文 `'Tang'` 而不是 `'唐'`（140 首里仅此一首），Week 5 数据清洗时统一处理，现在别动
2. `public/ink-mountains.png` 已在 public/ 但代码未引用，是备用资源
3. 诗库页 `_poems-client.tsx` 第 7 行有 `import { SealStamp }` 但 JSX 里未使用（dead import），下次精修时顺手删掉
4. 两套颜色命名（见设计系统现状章节），逐步统一，不用一次全改

---

## 你应该有的工作习惯

1. **读了才说**：先读完 CLAUDE.md + 相关文件，再开口，不要靠猜
2. **小步 commit**：每完成一个有意义的小步骤就 commit，不要攒着
3. **笔记同步**：实现了重要决策，顺手在 notes/ 里留痕
4. **CLAUDE.md 进度表要更新**：每完成一个 Day，把进度表的 ⏳ 改成 ✅ 并填 commit hash
5. **遇到岔路先问**：产品方向、技术选型的岔路，先列 2-3 个方案 + 建议，等用户拍板
6. **build 是红线**：任何时候 pnpm build 出错，优先修，不要绕过

---

## 如果你是在接手 Phase B

下一步要做的是**Eval + Langfuse 勘察和方案落地**：

- 先只读勘察 `src/ai/quiz/`、`src/app/api/quiz/`、`data/quiz-blueprints.json`、现有 `notes/talking-points/008` 和 `009`
- 明确评估对象：grounding 出题质量、evidenceLines 有效性、scoringPoints 命中、LLM-as-judge 完成度判断
- 设计首版可跑的 eval runner，不追求一步到 50 题满配；先能输出稳定基线
- Langfuse 接入优先覆盖 chat/opening/quiz-judge/quiz-generate，trace 字段要服务 README 和面试讲述
- 改 prompt 之前先有基线；Phase B 后改 `src/ai/prompts/` 必跑 eval 并记录结果

---

## 快速定位代码

```bash
# 看完整进度
git log --oneline -20

# 找颜色 token
cat src/app/globals.css

# 找某个功能
# 出题引擎: src/ai/quiz/
# Memory: src/ai/memory.ts + src/ai/prompts/v1/
# 路由保护: src/app/proxy.ts（Next.js 16 rename from middleware）
# DB schema: src/db/schema.ts
```
