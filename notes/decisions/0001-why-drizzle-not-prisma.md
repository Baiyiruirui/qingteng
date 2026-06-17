# 0001. ORM 选择:Drizzle 而非 Prisma

**日期**: 2026-06-16
**状态**: Accepted

## 背景

项目需要一个 TypeScript ORM 接 PostgreSQL (Neon)。主流候选 Prisma 和 Drizzle。

## 决策

选 Drizzle ORM。

## 备选方案

### 选项 A: Prisma
- 优点:生态成熟、文档好、Studio 工具友好、迁移管理强
- 缺点:包体积大、有独立的 schema DSL 需要学、Edge runtime 支持差、生成 client 步骤额外

### 选项 B: Drizzle
- 优点:轻量、SQL 友好、TS 类型从 schema 直接推导、Edge runtime 友好、无生成步骤
- 缺点:生态新、文档相对少、社区资源少

## 决策理由

1. 项目部署目标是 Vercel + Neon serverless,Edge runtime 友好度优先于生态
2. 学生项目无遗留迁移,新建项目享受 Drizzle 简洁性
3. 招聘 ROI:Drizzle 是 2024-2025 新宠,知道的面试官会加分;Prisma 是默认无加分项
4. Schema 即类型,无需 `prisma generate` 步骤,开发体验更顺

## 后果

**好的**:包体积小、启动快、类型推导即时
**坏的**:遇到边缘问题时网上答案少、迁移工具不如 Prisma 强大
**代价**:复杂 join 查询需要自己写 SQL 而非链式 API

## 如果反悔了

当出现以下情况会重新评估:
- 团队规模扩到 3+ 人,新人对 Prisma 更熟
- 需要复杂的关系建模而 Drizzle relational queries 表达力不够
- 部署目标从 Vercel Edge 改为传统 Node.js 服务器
