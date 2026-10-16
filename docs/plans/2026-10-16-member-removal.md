# Member Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为用户增加受历史数据保护的资产成员删除入口。

**Architecture:** 复用现有 store 和数据库 RLS/外键。独立 MemberManager 弹窗由总览与资产配置打开，读取完整家庭数据判断删除条件；云端以数据库外键作为并发保护。

**Tech Stack:** Vue 3、TypeScript、Supabase、Vitest、Playwright；沿用当前任务专用分支。

### Task 1: 数据删除与保护

Files: `tests/people.test.ts`, `src/lib/store.ts`。

1. 编写空成员删除持久化、账户与孤立交易阻止、云端家庭限定、外键冲突及权限失败测试。
2. `pnpm exec vitest run tests/people.test.ts`，确认新增 API 尚不存在而失败。
3. 实现 `personRemovalBlocker` 与 `removePerson`，云端删除返回记录后才刷新；无云配置拒绝；23503 转中文。
4. 重跑单测，确认通过。

### Task 2: 入口与确认

Files: `e2e/finance.spec.ts`, `src/components/MemberManager.vue`, `src/App.vue`。

1. 浏览器测试新增成员、成员筛选、管理弹窗、取消确认、删除后筛选清空与刷新持久化，检查已有账户禁用删除以及移动端布局。
2. 运行新测试，确认缺少管理入口而失败。
3. 添加独立弹窗、两个管理入口和失效筛选清理。复用现有确认框与样式，保留添加成员入口。
4. 重跑浏览器测试并检查页面。

### Task 3: 云端与交付

Files: `README.md`, `docs/verification.md`。

1. 用合成临时家庭验证空成员删除、已有账户外键拒绝、其他家庭删除拒绝，最后清理。
2. 运行 `pnpm lint`、`pnpm typecheck`、`pnpm exec tsc -p supabase/functions/tsconfig.json`、`pnpm test`、完整 Playwright 与生产构建。
3. 审查差异，记录验证，提交推送并检查 GitHub Actions、正式站点成员管理入口。
