# Phase D-7 · 代表性题库规模化

日期：2026-07-13  
决策：Owner 选择方案 B，以代表作深覆盖作为作品集发布门槛。

## 完成口径

- 14 首中小学高频代表诗，不宣称 140 首已全部出题。
- 95 道 v2 题，覆盖默写、炼字、画面、意象、手法、情感、翻译、综合选择 8 类考点。
- 每个蓝图考点恰好对应 1 道可展示题。
- 140 首结构化诗歌与 embedding 保持完整，其余 126 首题库扩展进入后续 backlog。

## 工程闭环

1. `generate:blueprints:representative` 先写可审阅 JSON，不直接写数据库，并支持 checkpoint 续跑。
2. 蓝图导入前校验题型/表单映射、考点数量、类型多样性以及 targetLines 是否来自原诗。
3. 预生成改为幂等：已有合格考点自动跳过，缺失考点逐个生成并最多重试 3 次。
4. v2 题在入库前检查 evidence、MCQ 答案、评分点和 qualityScore；Demo API 运行时再次执行相同质量门槛。
5. `verify:quiz:representative` 验证代表集完整性，`audit:quiz` 继续审计全题库。

## 语义抽样

对 14 首代表诗各抽 1 题，并覆盖 8 类考点。机械校验之外发现并原位修正 3 处语义问题，题目 ID 保持不变：

- 《次北固山下》p6：将“行舟行驶在绿水之前”修正为“行驶在绿水之上”。
- 《春望》p7：删除原诗资料没有的“露珠”，回到花鸟拟人化的资料口径。
- 《使至塞上》p5：删除“完成使命的欣慰、情感转为豪迈”的过度推断，改为内容概述与首尾照应。

《夜雨寄北》的思念对象在文学史上存在不同说法；项目结构化资料明确采用“友人/友情”口径，因此题目保持与项目 grounding 一致，不在本阶段改动基础语料。

## 验收结果

| 检查 | 结果 |
|---|---|
| `pnpm verify:quiz:representative` | 14/14 蓝图，95/95 demo-ready，8 类考点 |
| `pnpm audit:quiz` | 0 critical；22 warning 均来自不进入 Demo 的旧 v1 题 |
| `pnpm verify:data` | 通过；140 首、140 embeddings、95 道 v2 |
| `pnpm eval` | 62/62（100%） |
| `pnpm verify:security` | 27/27；仅 `QT_ADMIN_USER_IDS` 未配置 warning，内部工具默认拒绝 |
| `pnpm build` | Next.js 16.2.9 生产构建通过 |

## 已知边界

- 本地 FIClash 规则节点曾阻断 Neon 5432，表现为 TLS `ECONNRESET`；验收时只在 DB 命令窗口临时切 direct，结束后恢复 rule。
- 旧 v1 的 22 条 warning 继续留作审计历史，不进入 v2 Demo 流程。
- 本阶段没有新增数据库 schema、第三方依赖或公开 API。
