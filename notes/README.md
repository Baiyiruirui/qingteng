# 工程日志

这个目录记录青藤项目开发过程中的所有非代码产出:决策、问题、调试、思考。

## 子目录用途

| 目录 | 记什么 | 何时记 |
|---|---|---|
| `prompt-feedback/` | AI 对话测试发现的问题、prompt 调优思路 | 每次手动测试发现不满意的回复 |
| `decisions/` | 技术决策的"为什么这样选" | 每次做了不可逆决策(选型、架构、数据结构) |
| `bugs/` | 调试过的疑难杂症及解法 | 解决一个非显然 bug 后(超过 30 分钟才搞定的那种) |
| `talking-points/` | 项目里可以在面试讲的故事 | 实现了一个有意思的设计后立刻记 |

## 文件命名约定

- `prompt-feedback/` 和 `bugs/`:`YYYY-MM-DD-short-slug.md`
- `decisions/`:`NNNN-short-slug.md`(四位数字递增)
- `talking-points/`:`NNN-short-slug.md`(三位数字递增)

## 工作流

每次创建新条目时:
1. 复制对应目录里的 `_template.md`
2. 改名 + 填内容
3. git commit,message 用 `docs(notes): add ...`

不要把这些笔记藏起来——push 到 GitHub,这是工程能力的可见证据。
