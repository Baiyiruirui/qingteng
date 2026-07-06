# 0009. 引入 ui-ux-pro-max 设计技能(本地辅助,gitignore)

**日期**: 2026-07-06
**状态**: Accepted

## 背景

Owner 发现 GitHub 项目 `nextlevelbuilder/ui-ux-pro-max-skill`,希望用它辅助青藤的进一步设计。

顾问初步评估后**不建议整包引入**(理由见下"备选"),建议"只揖精华"。Owner 复议后**拍板安装使用**——决策权在 Owner,顾问执行。

## 决策

1. 通过官方 CLI 安装:`npm install -g ui-ux-pro-max-cli` → `uipro init --ai claude --offline`,落地到 `.claude/skills/`(7 个子技能,146 文件,3MB)。
2. **加入 `.gitignore`(`.claude/skills/`)**:作为本地设计辅助工具,不入库——避免第三方设计数据污染作品集仓库,随时 `uipro init` 可重装。
3. 使用方式:Python 推荐引擎在本机无法运行(未装 Python),但数据(`data/*.csv`:161 配色/57 字体搭配/67 风格/UX 指南)与参考 md 可由 Claude Code 直接读取取用。

## 备选方案

### 选项 A: 只揖精华不装包(顾问初始推荐)
- 优点:零依赖、不碰 Python、不改仓库
- 缺点:每次要顾问手动翻数据,不能作为常驻技能被调用

### 选项 B: 整包安装(Owner 拍板)
- 优点:技能常驻 `.claude/`,后续设计可持续调用;数据齐全
- 缺点:第三方全局 npm 包(2 天前新发布,供应链风险);推荐引擎依赖 Python(本机没有),半残;3MB 文件

### 选项 C: 官方 Marketplace 插件
- 未采用:`/plugin` 在当前非交互会话不可用,且同样依赖 Python

## 决策理由

- Owner 作为决策者明确要用,顾问尊重并执行(工作约定第 7 条)。
- 包体检查通过:MIT、依赖仅 chalk/commander/ora/prompts(标准 CLI 库),无可疑脚本。
- gitignore 是"要它的能力、不要它污染作品集"的折衷——技能本地可用,仓库保持干净。

## 后果

**好的**:设计时多一个 161 配色/57 字体搭配/风格库可查;字体搭配数据已证明有用(见下)。
**坏的**:核心 Python 引擎跑不了,只能当静态数据库用;工具由第三方维护,更新需手动 `uipro update`。
**代价**:新机器/重装需重跑 `uipro init`。

## 首次取用的契合项(供后续页面精修参考)

从 `data/typography.csv` 挑出与水墨/文人气质契合的字体搭配:
- **#4 Editorial Classic**(Cormorant Garamond + Libre Baskerville):literary/bookish,拉丁文标题气质;中文侧配 Noto Serif SC / 思源宋体
- **#8 Wellness Calm**(Lora + Raleway):calm/organic/natural,契合诗词的静气
从 `data/styles.csv`:Minimalism & Swiss 的中性色板(Beige #F5F1E8 / Taupe #B38B6D)与青藤 paper 系一致,可佐证现有 token 方向。

## 如果反悔了

- 若发现它把设计往通用 SaaS 观感带、稀释水墨辨识度,`uipro uninstall` 移除,回到 DESIGN_SYSTEM.md 单一基准。

## 关联

- [[0007]] 产品评审(Playwright 等新依赖已开先例)
- 设计基准仍以 `DESIGN_SYSTEM.md` 为准,本技能仅作灵感来源、不覆盖既定水墨系统
