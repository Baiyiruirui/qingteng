# C2/C3 测试观察与后续缺口

**日期**: 2026-07-08
**耗时**: 半天内多轮联调
**严重程度**: 中

## 现象

Phase C2 腾讯 ASR 朗读评分和 Phase C3 语义诗词搜索联调时,功能主链路已经跑通,但暴露出几类容易误判为"功能坏了"的问题:

1. 朗读页手动访问 `/recite/` 时没有 poemId,用户会卡在错误入口。
2. 腾讯 ASR 本地 `.env.local` 已填写,但 Next dev server 没重启时仍报 `TENCENT_SECRET_ID is not configured`。
3. Vercel 新增环境变量后,线上旧 deployment 不会自动读取,必须 redeploy。
4. Windows 下 `tsx`/Drizzle 有时会访问 `C:\Users\Lenovo\AppData\Local\Temp\tsx-Lenovo` 触发 EPERM。
5. `server-only` 模块不能被独立脚本 import,回填脚本不能直接引用 `src/ai/embedding.ts`。
6. 诗歌内容覆盖口径容易混淆:基础诗词内容和语义 embedding 是 140/140,但沉浸脚本和 v2 题库目前只覆盖精选 3 首。

## 复现步骤

1. 打开 `http://127.0.0.1:3001/recite/`,没有诗 ID。
2. 在 `.env.local` 新增腾讯 ASR 变量后,不重启 Next dev server,直接提交录音。
3. 在 Vercel Settings 添加环境变量后,不 redeploy,直接测线上朗读。
4. 在 Windows PowerShell 中跑 `pnpm drizzle-kit generate` 或 `pnpm tsx -e ...`,遇到 Temp 目录权限错误。
5. 在 `scripts/embed-poems.ts` 中 import 带 `server-only` 的 `src/ai/embedding.ts`。

## 排查过程

- 用本地脚本直接调用腾讯 ASR,确认密钥和 TC3 签名可用。
- 临时检查 Next 运行时是否读到 `TENCENT_SECRET_ID/TENCENT_SECRET_KEY/TENCENT_ASR_REGION`,确认本地服务重启后变量存在。
- 访问 `/api/poems/search` 未登录返回 401,确认语义搜索接口没有公开暴露成本接口。
- 跑 `pnpm embed:poems`,发现 120/140 后被脏数据中的非字符串标签打断,修复 `search-text.ts` 的输入容错后完成 140/140 回填。
- 用 `semanticPoemSearch('孤独')` 验证召回,结果包含《江雪》《独坐敬亭山》《月下独酌》《竹里馆》《登高》等。

## 根因

这些问题主要不是核心算法错误,而是开发/部署边界问题:

- Next 环境变量加载是进程启动时行为,不是热更新保证。
- Vercel 环境变量只注入新 deployment。
- 独立脚本和 Next Server Component 的执行环境不同,`server-only` 不能跨环境复用。
- Windows PowerShell 对引号、反引号和 Temp 目录权限更敏感。
- 产品覆盖口径需要明确区分"基础内容全库"和"AI 增强功能精选覆盖"。

## 解法

已完成:

- 新增 `/recite` 根路径重定向到 `/poems`,避免空入口。
- 把 embedding 实现拆成 `embedding-core`,Next 服务端保留 `server-only` 包装,脚本复用 core。
- `buildPoemSearchText()` 对非字符串标签做过滤,避免脏数据中断回填。
- 完成 `poem_embeddings` 表、HNSW 索引、`pnpm embed:poems` 和 140 首回填。
- 更新 README/AGENTS/CLAUDE/006 讲点,明确 C2/C3 状态。

待注意:

- 线上新增/修改环境变量后必须 redeploy。
- Windows 上跑 tsx/Drizzle 如遇 EPERM,先设置 `TMP/TEMP` 到项目内 `.tmp`。
- `git status` 中的 `.tmp-next-dev*.log` 是本地 dev server 临时日志,不应提交。

## 预防

1. 新增第三方服务时,同时记录"本地 env + Vercel env + redeploy"三步。
2. 可复用的纯逻辑放在不含 `server-only` 的 core 文件里,Next 路由再包一层。
3. 脚本里处理数据库 JSON 字段时,默认把输入当成脏数据。
4. 对外汇报时使用这组口径:
   - 140 首诗基础内容完成
   - 140 首诗语义搜索 embedding 完成
   - 朗读评分可覆盖全库
   - 沉浸/题库是精选 3 首深做
