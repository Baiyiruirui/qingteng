# 青藤(Qingteng)项目交接文档 · HANDOFF

> 这份文档让新的 AI 顾问对话无缝接手青藤项目。读完这份 + 项目里的 CLAUDE.md + PROJECT_PLAN.md,就掌握全局。

---

## 一、这是什么项目

**青藤** = AI 古诗词学习产品。一个会陪你读诗、带你沉浸、考你练你的 AI 诗友。

- **本质目的**:这是一个**求职作品集项目**,目标岗位 = AI 应用工程师。**一切决策以"招聘 ROI"为最高准则**——能加分的功能优先,炫技但不加分的支线砍掉。
- **开发者**:中文母语,前端/部署经验有限(终端、git、Vercel 都是边学边做),需要**具体到点哪个按钮**级别的指导。GitHub 用户名 Baiyiruirui。
- **线上地址**:`qingteng-ecru.vercel.app`(已部署上线)
- **代码仓库**:github.com/Baiyiruirui/qingteng(Public)
- **本地路径**:`D:\workspace\projects\qingteng`(Windows + PowerShell + VS Code + Claude Code 插件)

---

## 二、协作方式(最重要,新对话必须继承)

这套协作模式是项目成功的关键,**务必延续**:

| 角色 | 职责 |
|---|---|
| **AI 顾问(你)** | 当产品经理 + 资深工程师。提供方案、权衡利弊、给专业建议、主动追问关键决策点、暴露风险。**不替用户做重大决策。** |
| **用户** | 决策者。听建议,拍板。没有用户的"确认",不生成给 Claude Code 的执行指令。 |
| **Claude Code(VS Code 插件)** | 干活的。执行具体编码。用户把顾问写的指令复制给它。 |

### 工作流(每个功能都走这个循环)
```
顾问提方案 + 列决策点(用编号"决策N",标注推荐项)
  → 用户拍板(常用按钮选择)
  → 顾问细化,写出给 Claude Code 的复制粘贴指令
  → 用户发给 Claude Code 执行
  → Claude Code 跑完,用户截图反馈
  → 顾问验收,进入下一个决策点
```

### 铁律
- **重大功能/方向/技术选型的岔路,先列方案+建议问用户,不自作主张推进**
- 风险操作(搬异构代码、改核心逻辑、部署)让 Claude Code **先勘察后动手**,勘察结果给用户确认再放行
- Claude Code 会话跑偏时(它偶尔会输出无关内容),开新会话,让它先读 CLAUDE.md + PROJECT_PLAN.md 归位
- 用中文回复
- 真诚:用户的选择次优时,把利害讲清楚,然后尊重他的决定
- 不断提醒"招聘 ROI",别让支线劫持主线
- 每个里程碑后更新 README.md + CLAUDE.md

---

## 三、技术栈(已锁定,别改)

Next.js 16(App Router)+ TypeScript strict + Tailwind + shadcn/ui + Zustand + TanStack Query。Server Actions/Route Handlers(不用单独 Hono/Express)。Drizzle ORM + Zod。PostgreSQL(Neon)+ pgvector + Upstash Redis。Vercel AI SDK。

**模型**:DeepSeek(出题/判题/对话主力)、Claude Haiku(可选 fallback)、SiliconFlow bge-m3 1024维 embedding(长期记忆 RAG)。

**不做**:tRPC、mem0、PWA、暗色模式、Docker、teacher portal。

---

## 四、环境 & 基础设施

- npm/pnpm registry → npmmirror.com;代理 FIClash 127.0.0.1:7890(localhost 被 Clash 拦,用 127.0.0.1)
- **数据库分两套**:Neon `production` 分支(生产库,Vercel 用,host 含 `ep-floral-voice`+`-pooler`)、`制作`分支(本地开发,host 含 `ep-twilight-paper`)。两库都已装 pgvector + hnsw 索引。**别在本地连生产库开发。**
- **Vercel**:Hobby 免费版,GitHub 登录,连 main 分支自动部署。仓库必须 Public(免费版私有库不支持"多作者",而 Claude Code 提交带 co-author 会触发限制 → 解决:仓库 Public + 干净单作者 commit)
- **Vercel 必填 6 个环境变量**:DATABASE_URL(用生产库)、JWT_SECRET、DEEPSEEK_API_KEY、UPSTASH_REDIS_REST_URL、UPSTASH_REDIS_REST_TOKEN、SILICONFLOW_API_KEY。可选:SILICONFLOW_BASE_URL、ANTHROPIC_API_KEY、LANGFUSE_*
- 国内访问 Vercel 需挂代理(可接受,作品集项目)
- ⚠️ **遗留待办**:API key 曾在截图暴露,用户暂"懒得改"。**对外正式展示(投简历)前,提醒轮换 key + 更新 Vercel/本地**

---

## 五、已完成(Week 1-3 + 部署)

### Week 1:基础
Next.js 脚手架、Drizzle schema、Neon+pgvector、导入 140 首诗(100 TANG + 40 EXTRA)。"青藤"角色 prompt(双响应模式:信息类用讲述式、情感类用启发式;禁舞台说明;禁曲解诗意的玩笑)。流式对话。

### Week 2:三层记忆(最值钱的一周)
- 认证:bcryptjs + jose JWT httpOnly cookie + 中间件路由保护(Next.js 16 把 middleware.ts 改名 proxy.ts)
- 对话持久化
- **短期记忆**(Redis):最近 6 条 + 个性化开场(回忆具体细节非泛泛氛围)
- **中期记忆**(PG 画像):字符串匹配抽取诗/主题,Redis 缓存,作背景注入不张扬
- **长期记忆**(pgvector RAG):LLM 抽取情感/偏好信号 → bge-m3 embed → 存 → 语义召回。修了两个 RAG bug:召回幻觉(grounding 约束)、多记忆冲突(分组注入+偏好优先)

### Week 3:三模式 + 青藤考你(出题判题)
- 对话模式架构:chat(日常)/ roleplay(诗境沉浸)/ quiz(青藤考你)
- **诗境沉浸**:受控角色扮演(脚本=引导地图非台词)。用户觉得"一般",保留,后续配意境图增强
- **青藤考你(主线)**:
  - **考点蓝图**(`data/quiz-blueprints.json`):解决出题同质化。每首诗定义一组互斥考点(默写/炼字/画面/意象/手法/情感/翻译/综合选择),基于中考五大考点。v1 同质化(扎堆名句)→ v2 蓝图驱动覆盖全诗
  - **grounding 出题**:注入诗的真实结构化数据 + evidenceLines 强制溯源 + 后校验。解决"登高八悲"幻觉。evidenceValid ~94-100%
  - **LLM-as-judge 判题**:客观题规则判;主观题=要点命中(scoringPoints,出题时生成)+ 青藤点评。**关键判定哲学:主观题不判对错,显示"完成度"**——评估标准服务产品目标(鼓励而非淘汰)。判题也 grounding 防幻觉
  - 一题一屏刷题 + 错题本 + 答题记录入库
  - 修过:主观题判定太严(答对核心判没答到)、错题计数重复 bug

### 部署上线(A 阶段)✅
本地 pnpm build 零错误 → 建 Neon production 生产库 → Vercel 连 GitHub 配 6 个环境变量 → 部署。踩坑全解决:漏 push 导致线上缺刷题功能(Vercel 部署的是 remote 不是本地)、Vercel 免费版 co-author 协作限制(仓库改 Public + 干净 commit)、Next.js 16 middleware→proxy。线上确认:登录/对话/诗库/做题全通。

---

## 六、当前阶段:Phase A P0 demo 收口完成,准备 Phase B

### 已定方案
- 路线:**A 部署✅ → Phase A 美术/信息架构收口✅ → Phase B Eval + Langfuse(下一步) → Phase C 功能扩展/录 Demo**
- 风格:**宣纸水墨为主 + 暖色(朱砂/暖月)极克制点缀**,锁定亮色不做暗色
- 加强项(全要):霞鹜文楷全站统一、慢柔墨晕动效、宣纸纹理层、诗意空状态/加载、朱砂印章标志符号
- 设计规范见 `DESIGN_SYSTEM.md`(颜色/字体/动效/纹理/印章/空状态全部 token)
- 后半程范围和砍单顺序以 `CHARTER.md` 为准;章程可修订,但要先提出建设性问题和取舍建议,由用户拍板

### 当前进度
- 登录/注册、诗库、聊天页已完成水墨风格第一轮;聊天页已显性展示「青藤记得你」Memory 价值
- `3b759c2` 完成 P0 demo 落地收口:根路径 `/` 按登录态重定向;新增统一 AppNav;隐藏未完成 creative 入口;`/quiz-test`、`/api/quiz/list`、`/api/quiz/generate` 加内部工具门禁;沉浸页改成「诗境剧场」
- 本地 `pnpm build` 已通过(字体网络需代理 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897`)
- 仍未做完的视觉尾巴:做题页「先生批注」细节、一次移动端/桌面视觉走查、设计讲点 011/012

### 下一步
先做 Phase B:Eval + Langfuse。目标是把 grounding 出题和 LLM-as-judge 从「能跑」推进到「可量化证明」。不要继续在诗库视觉上消耗主线时间;视觉尾巴可与 Phase B 并行收口。

---

## 七、整体路线图(往后)

1. **Phase B**:Eval 黄金集 + Langfuse 观测 + 基线报告
2. **Phase C1**:难度自适应出题 + 错题专项复习
3. **Phase C2/C3**:Whisper 朗读评分、语义诗词搜索(按 CHARTER 砍单顺序保留弹性)
4. **Demo 收尾**:3 分钟视频 + README 终稿 + 投简历前轮换暴露过的 API key

---

## 八、关键文档清单(项目内)

- `PROJECT_PLAN.md` — master plan
- `CLAUDE.md` — Claude Code 项目记忆(进度表、工作约定、产品模块)
- `DESIGN_SYSTEM.md` — 视觉设计系统
- `data/quiz-blueprints.json` — 考点蓝图
- `notes/talking-points/` — 面试讲点(002-009:持久化/短期/中期/长期记忆、grounded-quiz、llm-as-judge、沉浸教育学007、语义搜索006)
- `notes/decisions/`、`notes/prompt-feedback/`、`notes/bugs/` — 决策/调prompt/踩坑记录
- `html/` — v0 导出的登录页设计代码(待接入)

---

## 九、给新顾问的开场建议

接手后**先确认两件事再推进**:
1. 用户当前卡在哪一步(很可能是登录页接入的验收,或已进入诗库/聊天页美术)
2. 让用户描述/截图当前线上状态,对齐进度

然后**延续协作模式**:提方案 → 列决策点(编号+推荐)→ 用户拍板 → 写 Claude Code 指令。不要一上来就大改,先对齐再动。
