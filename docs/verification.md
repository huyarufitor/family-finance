# 验证记录 · 2026-10-16

## 本地已执行

- `pnpm lint`：通过，无错误、无警告。
- `pnpm typecheck`：通过。
- `pnpm exec tsc -p supabase/functions/tsconfig.json`：云函数类型检查通过。
- `pnpm test`：5 个文件、25 项测试全部通过。覆盖整数金额与千分位、完整金额解析、转账抵销、日历边界、估值收益、缺失边界估值留空、CSV 解析/去重/跳过记录及字段限制、备份校验、服务端记录校验、未授权请求拦截、渠道归属不可伪造、整批校验、AI 调用额度门禁。
- 浏览器测试：通过 **5 项**，使用 bundled Node.js v24.19.0 执行 `node node_modules/@playwright/test/cli.js test`。覆盖自然语言确认记账、刷新持久化、成员筛选、CSV 重复导入、手机创建账户、完整备份下载、估值更新、时间校验、无效备份拒绝、Escape 关闭弹窗、全部五个页面手机宽度不溢出。
- `pnpm build --base=/family-finance/`：生产构建成功，JS 约 146KB、gzip 约 55KB，CSS gzip 约 8.4KB。
- 实际浏览器检查生产预览 `http://127.0.0.1:5175/family-finance/`：页面 HTTP 200；模板地址 `/family-finance/samples/bills.csv` HTTP 200；无 pageerror。1440px 桌面及 390px 手机截图已目视检查。预览命令须带 `--base=/family-finance/`，与构建前缀一致。
- 独立代码审查发现并修复金额正则截断数字、旧投资估值被当作零收益两项问题，添加失败后通过的回归测试。复核通过。
- `history-atlas` Git 状态保持干净，本次没有修改其文件。

## 真实服务尚待配置及联调

本地未提供 Supabase 项目、SMTP、AI 提供商密钥或已授权的银行/邮件账单来源。系统 Docker daemon 未运行，因此没有声称实际运行 Supabase 数据库。

- SQL 经过静态审查；需在新 Supabase 项目执行迁移，使用不同账号验证 RLS、邀请一次使用与过期、并发写入去重和 Realtime。
- 云函数经过类型检查与模拟外部服务的请求测试，未实际调用模型、银行或邮件服务。
- GitHub Actions 工作流和子路径构建已准备，尚未创建远程仓库或在线部署。
- 浏览器语音取决于浏览器、权限和其识别服务，本地未进行真实语音录音测试。

## 交付状态

独立项目位于 `/Users/fitor/Documents/个人/family-finance`，本地开发预览为 `http://127.0.0.1:5180/`。无配置时为本机演示模式。托管后端配置步骤、公开环境变量、服务端 Secrets、授权账单接收协议与计算口径见 README。
