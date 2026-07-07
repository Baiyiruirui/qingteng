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
| Subjective judge pass rate | blocked: DeepSeek 返回 `Insufficient Balance` |
| Overall pass rate | objective-only: 12/12 = 100%; smoke with 1 subjective error: 12/13 = 92.3% |
| JSON report | `outputs/evals/eval-v0-2026-07-07T04-18-45-490Z.json`、`outputs/evals/eval-v0-2026-07-07T04-17-33-747Z.json` |

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

主观题 smoke 已验证 runner 能调用 LLM-as-judge,但当前 DeepSeek 账号余额不足:

```text
Subjective judge: 0/1 (0%)
FAIL sub-jys-emotion-strong error=Insufficient Balance
Overall: 12/13 (92.3%)
```

这不是 judge 逻辑失败,而是模型供应商返回 402。补足 DeepSeek 余额后,直接运行默认 `pnpm eval` 即可跑完整 10 个主观题 case。

## 设计取舍

- 客观题必须精确稳定,因此用布尔正确率。
- 主观题不追求单一精确分数,而是用人工标注的 completionRate 区间做回归检测。
- 首版 Eval 复用现有 v2 蓝图题,不把 AI 新生成的题伪装成外部黄金集。
- runner 每次会把机器可读 JSON 写到 `outputs/evals/`,该目录作为本地运行产物不入库。
- 后续 Phase B 再扩展:出题质量 20 题、判题一致性 15 题、记忆召回 10 例、开场白质量 5 例。
