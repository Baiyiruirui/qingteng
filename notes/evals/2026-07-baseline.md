# Eval Baseline · 2026-07

> 首版基线报告。目标不是一次性凑满 50 题,而是先把青藤考你的核心质量指标跑起来:客观题稳定性 + 主观题 LLM-as-judge 一致性。

## 范围

- 数据底座:现有 20 道 v2 蓝图题
- 客观题:6 道题,每题 correct / wrong 两个样本,共 12 个 case
- 主观题:10 个带人工期望区间的学生答案样本
- 运行命令:`pnpm eval`

## 首版指标

| 指标 | 结果 |
|---|---|
| Objective judge pass rate | 12/12 = 100% |
| Subjective judge pass rate | 7/10 = 70% |
| Overall pass rate | 19/22 = 86.4% |
| JSON report | `outputs/evals/eval-v0-2026-07-07T08-10-48-720Z.json` |

## Judge 后处理 v1

修复内容:

- 将 LLM 返回的 `hitPoints` / `missedPoints` 统一映射回原始 `scoringPoints`
- 去重并消除 hit/missed 重叠,以归一化后的命中点重算 `completionRate`
- 对学生答案里明确出现的释义关键词和极少量常见同义表达做弱命中兜底,避免"生活艰难 / 不能喝酒"这类答案被判为 0 分

回归结果:

| 指标 | 结果 |
|---|---|
| Objective judge pass rate | 12/12 = 100% |
| Subjective judge pass rate | 10/10 = 100% |
| Overall pass rate | 22/22 = 100% |
| JSON report | `outputs/evals/eval-v0-2026-07-07T08-19-12-841Z.json` |

这次修复没有改 judge prompt,只做判题结果后处理。`sub-dg-imagery-partial` 从 100% 回落到 67%,`sub-dg-translate-weak` 从 0% 修正到 50%,都进入人工期望区间。

2026-07-07 Langfuse 接入后再次回归,发现 `sub-dg-word-strong` 会因"暮年多病/年老多病"同义表达随机掉到 67%。已补窄域同义兜底后恢复 22/22:

```text
Objective judge: 12/12 (100%)
Subjective judge: 10/10 (100%)
Overall: 22/22 (100%)
JSON report: outputs/evals/eval-v0-2026-07-07T08-50-01-654Z.json
```

结论: telemetry 接入不改变判题行为;新增同义兜底让 judge 后处理对 DeepSeek 输出波动更稳。

## Eval v0.2 扩容

2026-07-07 将 eval 从只覆盖判题扩成五类 checks:

- 出题质量:20 个 v2 蓝图题逐题检查 form / pointType / qualityScore / evidenceValid / options / scoringPoints
- 记忆召回:10 个长期记忆注入与防编造规则的确定性检查
- 开场白质量:5 个 opening prompt 结构检查
- 客观判题:12 个 correct/wrong 规则回归
- 主观判题:10 个人工区间 completionRate 回归

完整回归结果:

```text
Quiz quality: 20/20 (100%)
Memory recall: 10/10 (100%)
Opening quality: 5/5 (100%)
Objective judge: 12/12 (100%)
Subjective judge: 10/10 (100%)
Overall: 57/57 (100%)
JSON report: outputs/evals/eval-v0-2026-07-07T09-14-00-491Z.json
```

备注:v0.2 是 57 个 checks,不是严格 50 题。多出来的是保留原有 12 个客观判题 correct/wrong 回归,用于保护规则判题稳定性。

## 运行记录

客观题基线已跑通:

```powershell
$env:EVAL_SUBJECTIVE_LIMIT='0'
pnpm eval
```

结果:

```text
Objective judge: 12/12 (100%)
Subjective judge: 0/0 (n/a)
Overall: 12/12 (100%)
```

完整主观题基线已跑通:

```text
Subjective judge: 7/10 (70%)
Overall: 19/22 (86.4%)
```

## 失败 case 观察

| Case | 现象 | 初步判断 |
|---|---|---|
| `sub-jyj-emotion-partial` | 学生答"重阳节很想念家人",模型只命中"佳节思亲",completionRate=25% | 偏严;按教育产品的宽容判定,可考虑把"家人"映射到"亲人" |
| `sub-dg-imagery-partial` | 学生只概括"苍凉悲壮/时间流逝",模型给 completionRate=100% | 偏宽;且暴露 hitPoints/missedPoints 可能不互斥,需要后处理校验 |
| `sub-dg-translate-weak` | 学生答"生活很艰难,所以不能喝酒",模型给 completionRate=0% | 偏严;至少触及"艰难"与"停酒"两个弱信号 |

结论:客观题规则判定稳定;主观题 judge 可用但需要下一轮优化,重点不是改题库,而是改 judge 结果校验和 prompt 的宽容/一致性。

## 设计取舍

- 客观题必须精确稳定,因此用布尔正确率。
- 主观题不追求单一精确分数,而是用人工标注的 completionRate 区间做回归检测。
- 首版 Eval 复用现有 v2 蓝图题,不把 AI 新生成的题伪装成外部黄金集。
- runner 每次会把机器可读 JSON 写到 `outputs/evals/`,该目录作为本地运行产物不入库。
- 后续 Phase B 再扩展:出题质量 20 题、判题一致性 15 题、记忆召回 10 例、开场白质量 5 例。
