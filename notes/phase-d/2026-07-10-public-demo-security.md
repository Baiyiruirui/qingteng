# Phase D-6 · 公开 Demo 安全与密钥轮换准备

日期：2026-07-10

## 目标

公开 Demo 可以让面试官完整体验 AI 链路，但不能把模型、ASR、embedding 和数据库写入接口变成无上限公共资源。本阶段先完成代码侧预算护栏和轮换准备；真正生成新密钥、更新 Vercel、撤销旧密钥放在 Phase E 执行。

## 已落地的保护

### 1. 内部接口门禁

- `/quiz-test`、`/api/quiz/list`、`/api/quiz/generate` 继续由 `canUseInternalTools` 保护。
- 生产环境仅 `QT_ADMIN_USER_IDS` 中的用户可访问；未配置时默认全部拒绝。

### 2. Redis 固定窗口限流

生产环境自动启用；本地开发默认关闭，可临时设置 `QT_RATE_LIMIT_ENABLED=true` 验证。限流键只保存用户/IP 的 SHA-256 截断摘要，不在 Redis 中存原始 IP。

| 入口 | 窗口 | 上限 |
|---|---:|---:|
| 登录 | 每 IP / 10 分钟 | 15 |
| 注册 | 每 IP / 小时 | 5 |
| 公共 AI 总预算 | 每用户 / 小时 | 60 |
| 公共 AI 总预算 | 每 IP / 小时 | 120 |
| 日常对话 | 每用户 / 分钟 | 8 |
| 沉浸对话 | 每用户 / 分钟 | 8 |
| 开场白 | 每用户 / 小时 | 12 |
| 主观题判题 | 每用户 / 分钟 | 10 |
| 语义搜索 | 每用户 / 分钟 | 12 |
| 腾讯 ASR | 每用户 / 分钟 | 4 |
| 腾讯 ASR | 每用户 / 小时 | 20 |
| 腾讯 ASR | 每 IP / 小时 | 40 |

Redis 未配置或故障时，生产环境的受保护请求返回 `503`，不降级为无限调用。被限流时返回 `429`、`Retry-After` 和 `X-RateLimit-*` 响应头。

### 3. 单次请求边界

- 对话只接受 user/assistant 文本消息：最多 50 条、用户单条 2,000 字、助手单条 6,000 字、总上下文 24,000 字。
- 判题回答最多 2,000 字。
- 搜索词最多 120 字，并在浏览器侧做 350ms 防抖，避免逐字触发 embedding。
- 朗读音频按 Base64 实际长度复算，不信任客户端上报的 `audioBytes`，上限保持 2.5 MB。
- 登录/注册密码最大 128 字符，避免异常超长输入。

## 安全自检

```powershell
pnpm verify:security
```

脚本只报告环境变量是否存在、格式是否合理，不打印值；同时检查当前 Git 跟踪文件中的疑似密钥、环境文件历史、内部接口门禁和高成本路由限流覆盖。

`QT_ADMIN_USER_IDS` 缺失只产生 warning，因为缺失时内部工具默认不可访问，属于安全状态。

自检也会提示 `NODE_TLS_REJECT_UNAUTHORIZED=0`。本次发现它只存在于 Codex 启动的当前进程，未写入 Windows 用户或系统环境；在普通终端和 Vercel 中仍应确认该变量未设置。

## Phase E 密钥轮换清单

以下凭据曾在项目协作截图中出现，按“已暴露”处理：

- `TENCENT_SECRET_ID` + `TENCENT_SECRET_KEY`
- `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`

轮换顺序：

1. 在对应平台创建一组新密钥，暂时保留旧密钥。
2. 更新本地 `.env.local`，运行 `pnpm verify:security`。
3. 更新 Vercel 的 Production 和 Preview 环境变量并重新部署。
4. 在线验证日常对话、Langfuse trace、语义搜索和腾讯 ASR 朗读。
5. 验证通过后立即禁用/删除旧密钥。
6. 最后轮换 `JWT_SECRET`；这一步会让已有登录会话全部失效，应放在其他链路验证完成后。

未在截图或 Git 中发现 `DATABASE_URL`、DeepSeek、Upstash、SiliconFlow 的明文泄露。Phase E 仍需在平台后台核对访问记录、额度上限和告警；如果这些凭据曾复制到其他公开位置，也一并轮换。

## 剩余边界

- 目前没有 CAPTCHA、WAF 规则或平台级每日总金额熔断；现阶段以账号/IP 限流和第三方平台额度告警为主。
- BYOK 仍是章程 P1，未在本阶段引入。
- 限流用于保护作品集 Demo，不作为大规模生产环境的最终风控方案。
