# Family Finance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建可部署 GitHub Pages 的家庭记账理财网站，提供可运行演示与真实托管后端接入。

**Architecture:** Vue 3 静态前端调用 Supabase Auth / REST / Realtime。纯函数处理财务计算和导入验证，服务端 RLS 隔离家庭，Edge Functions 保存 AI 与接收渠道凭据。

**Tech Stack:** Vue 3, TypeScript, Vite, pnpm, Supabase JS, Vitest, Playwright.

---

### Task 1: 项目和财务内核
- Create: package.json, tsconfig.json, vite.config.ts, eslint.config.js, src/lib/types.ts, src/lib/finance.ts, src/lib/import.ts, src/lib/parser.ts, tests/finance.test.ts, tests/import.test.ts, tests/parser.test.ts。
- 配置工具与依赖；先写缺失功能测试，执行 `pnpm test` 观察失败。
- 金额分整数、区间过滤、快照估值、内部转账抵销、Modified Dietz。CSV 使用状态机解析引号、逗号、BOM；官方中文表头标准化、过滤非成功交易、导入预览。
- `pnpm test`：解析歧义、家庭现金流、重复账单、缺失估值等场景应通过。

### Task 2: 云端数据边界
- Create: supabase/migrations/202610160001_initial.sql, supabase/functions/{parse-entry,import-bills}/index.ts, src/lib/cloud.ts, src/lib/store.ts。
- 创建家庭、成员、账户、估值、交易、邀请、渠道表与 RLS；RPC 处理原子创建与邀请，导入用唯一索引防重复。
- 本机演示与登录账本隔离；自动恢复会话，订阅 Realtime，失败保留表单并显示错误。
- 云端函数从服务端环境读取密钥，AI 结果校验后必须确认入账；Webhook 不允许客户端自行指定其他家庭。

### Task 3: 网站界面与用户流程
- Create: src/App.vue, src/components/{AppIcon,TrendChart,EntryDialog,ImportDialog}.vue, src/style.css, src/lib/demo.ts, src/main.ts, index.html。
- 桌面侧栏、手机导航、成员和日期筛选、指标、SVG 趋势与配比；浅色暖白/森林绿设计。
- 先编写 e2e 记账/筛选/导入与持久化断言；实现对应功能；运行 `pnpm test:e2e`。
- 记账支持自然语言、可用浏览器语音、手工填写；所有金额确认后写入；导入先预览再批量保存。

### Task 4: 部署与交付
- Create: .github/workflows/deploy.yml, .env.example, README.md, public/samples/bills.csv, docs/verification.md。
- Actions 验证后构建仓库前缀路径；配置公开 Supabase 参数用仓库 Variables；模型和渠道密钥只用 Supabase Secrets。
- 完整执行 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build --base=/family-finance/`, `pnpm test:e2e`。
- 代码审查与浏览器视觉检查，修复后按变更范围重新验证。记录真实服务尚未联调的边界；保留全部可部署文件，不伪造线上地址。
