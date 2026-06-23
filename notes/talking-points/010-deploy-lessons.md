# 010 · 部署踩坑全记录：从 0 到上线的三个教训

**适用场景**: 面试/Demo 被问"项目是怎么部署的"或"上线过程有没有踩坑"时

---

## 背景

青藤在 Vercel + Neon + Upstash 全 serverless 环境上线。看似"push 一下就完事"，实际踩了三个真实的 CI/CD 坑。

---

## 坑一：本地有 ≠ 线上有（漏 push 导致线上缺整个功能）

**现象**：刷题页（`/quiz/[poemId]`、`/wrong`、`/api/quiz/judge`）在本地完全正常，线上访问全部 404。

**根因**：刷题功能开发完毕后 commit 了 6 个本地 commit，但没有 push 到 GitHub remote。Vercel 部署的是 remote，所以它根本不知道这些 commit 的存在。

**排查信号**：`git status` 显示 `Your branch is ahead of 'origin/main' by 6 commits`——这就是"线上功能缺失"的直接证据。

**教训**：
- 每完成一个可运行的功能就 commit + push，不要积攒本地 commit
- 部署前必跑 `git log --oneline origin/main..HEAD`，确认 remote 是最新状态
- Vercel 的 deployment log 会显示它部署的 commit hash，可以和本地对比

---

## 坑二：Vercel 免费版把 Co-authored-by 当多人协作

**现象**：push 后 Vercel 部署被拦，报错提示"多人协作功能需要付费版"。

**根因**：commit message 里带了 `Co-authored-by: Claude Sonnet <noreply@anthropic.com>`，Vercel 把这个解析为多人协作，触发了付费检测。

**解决**：
1. 以后 commit 不再添加 Co-authored-by 尾巴
2. 补一个只有自己身份的 `git commit --allow-empty -m "chore: trigger redeploy"` 触发重新部署

**教训**：Git 的 `Co-authored-by` trailer 是 GitHub 等平台识别多人协作的机制，Vercel 免费版会据此限制。AI 工具辅助开发时注意 commit message 的元数据。

---

## 坑三：Next.js 16 把 middleware.ts 改名为 proxy.ts

**现象**：`pnpm build` 报 warning：`"middleware" file convention is deprecated, use "proxy"`，同时 Vercel 上路由保护失效（未登录用户可以直接访问 `/chat`）。

**根因**：Next.js 16 将中间件文件从 `middleware.ts` 重命名为 `proxy.ts`，导出函数名也从 `middleware` 改为 `proxy`。旧文件在 16.x 上静默失效——不报错，但路由保护不执行。

**修复**：
```
src/middleware.ts  →  src/proxy.ts
export function middleware(...)  →  export async function proxy(...)
```

**教训**：框架大版本升级时留意文件约定的 breaking change。Next.js 的 changelog 里写了，但不看就踩。`pnpm build` 的 warning 是信号——警告要当错误处理。

---

## 整体 CI/CD 流程（踩完坑后的标准做法）

```
1. 功能开发完 → commit（no Co-authored-by）+ push 到 main
2. Vercel 自动检测 main 分支 push → 触发 build
3. Build 用 pnpm build（Next.js 默认）
4. 环境变量在 Vercel Dashboard 手动填（DATABASE_URL / JWT_SECRET 等 8 个）
5. Build 成功 → 自动部署到 qingteng-ecru.vercel.app
```

**Vercel 环境变量清单**（本项目用到的 6 个必填）：

| 变量 | 用途 |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL（建议用 pooler 连接串） |
| `JWT_SECRET` | 登录 cookie 签名 |
| `DEEPSEEK_API_KEY` | 出题 + 判题 + 对话 |
| `UPSTASH_REDIS_REST_URL` | 短期 Memory |
| `UPSTASH_REDIS_REST_TOKEN` | 短期 Memory |
| `SILICONFLOW_API_KEY` | embedding（长期 Memory RAG） |

---

## 面试追问

- "为什么不用 Docker？" → Vercel 全 serverless，Next.js 天生适配，没有容器化的必要性；DB 用 Neon serverless + HTTP，Redis 用 Upstash HTTP，整个后端无长连接
- "serverless 数据库连接怎么处理？" → `postgres-js` 设置 `max: 1` 限制单函数实例连接数，Neon 建议用 `-pooler` 连接串（pgBouncer）避免连接爆炸
- "怎么确认 Vercel 部署的是最新代码？" → Vercel Dashboard 的 deployment log 显示 commit hash，和 `git log -1 --format=%H` 对比即可
