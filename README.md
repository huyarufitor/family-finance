# 有数 · 家庭财务手账

在线访问：[有数 · 家庭财务手账](https://huyarufitor.github.io/family-finance/)。

一个中文家庭记账理财网站。Vue 3 + TypeScript，前端可部署到 GitHub Pages；Supabase 托管身份验证、家庭数据、实时订阅和云函数，无需购买或维护云服务器。

## 本地运行

使用 Node.js 22+ 和 pnpm 9：

```sh
nvm use
pnpm install
pnpm dev
```

访问终端显示的本地地址。不配置环境变量也可使用明确标注的**本机演示账本**，示例数据不会自动上传到云端。演示记录存储在当前浏览器的 localStorage，清理浏览器会丢失，建议导出完整 JSON 备份。

## 已实现的功能

- 总览、收支账本、资产配置、收益分析、数据连接五个页面；桌面和手机布局。
- 按周、月、季度、年度、自定义日期及家庭成员筛选；当前时段统计截至今天。
- 自然语言本地解析（如“中午吃快餐花了25元”），云端 AI 解析；草稿可编辑，确认后才入账。
- 浏览器支持时启用中文语音转文字，麦克风需授权并使用 HTTPS 或 localhost；浏览器可能调用其在线识别服务。浏览器不支持、权限拒绝、识别失败时可用文字/手工录入。
- UTF-8 / GB18030 CSV 账单预览与去重，支持微信/支付宝常见中文表头和通用模板；不支持 Excel/PDF。每次最多 5000 笔、5MB。非成功交易、退款/转账/充值/提现/还款分类跳过并显示跳过笔数，转账另行核对账户后手动录入。
- 资产归属成员、现金/存款/投资/房产/负债账户，历史估值，成员配置图和类别占比。
- GitHub OAuth / 邮箱登录、创建家庭、一次性邀请码加入、家庭 RLS 权限隔离、Realtime 更新。
- 有授权的账单来源可使用云端接收接口，持久化交易号去重，实时更新网页；渠道密钥可撤销。
- 完整 JSON 导出与本机备份验证/恢复。恢复会替换本机账本，界面有明确确认。云端不支持覆盖式恢复，避免部分导入破坏共享账本。

## 1. 部署前端到 GitHub Pages

将本项目作为独立仓库上传 GitHub（建议仓库名 `family-finance`），默认分支设为 `main` 或 `master`。不要上传 `.env`、真实账单、备份或任何密钥。

仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。工作流会先运行 lint、前后端类型检查、单元测试和浏览器测试，再构建并部署 `dist`。

构建前缀自动使用仓库名，如 `/family-finance/`，不硬编码用户名。若是 `username.github.io` 仓库或根路径自定义域名，在 **Settings → Secrets and variables → Actions → Variables** 设置 `PAGES_BASE_PATH=/`。其余项目站点保留默认。

仅前端部署即可访问演示版。开启真实家庭账本需完成下面的托管后端配置。

## 2. 配置 Supabase 家庭账本

1. 创建一个 Supabase 项目。托管服务和模型 API 可能产生费用，具体额度以服务商控制台为准；本项目不自动开通付费资源。
2. 在新项目 SQL Editor 中一次性运行 `supabase/migrations/202610160001_initial.sql`。已有账本不要重复运行；升级时使用新迁移。
3. 在 **Authentication → URL Configuration** 中设置完整站点 URL，例如 `https://YOUR_NAME.github.io/family-finance/`，加入允许的 Redirect URLs。本地需要加入 `http://localhost:5173/` / 实际开发地址。
4. 启用 Email 登录。默认邮件提供登录链接；如果希望使用网页验证码表单，在邮件模板中加入 `{{ .Token }}`。如需多位家人实际使用，按 Supabase 要求配置 SMTP 提供商及发件身份。
5. 从 Project Settings 取得 Project URL 和公开 publishable key / legacy anon key。本地复制 `.env.example` 为 `.env` 填写；线上在 GitHub Actions **Variables** 设置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 后重新构建。
6. 网页打开“数据连接”，用已配置的 GitHub 或邮箱方式登录，创建家庭。先添加资产账户及估值，再开始记账。创建者生成邀请码，家人登录后使用邀请码加入。

前端公开 key 是设计允许公开的客户端凭据，数据权限由 RLS 限制。**绝不能把 service_role、AI_API_KEY、导入渠道密钥放在 VITE_ 环境变量或 GitHub 仓库中。**

家庭协作者可查看和维护整个共享账本，不提供成员之间的私密账户权限。资产归属成员和登录用户分开管理；添加“安安”等资产成员不等同于给其发登录邀请。

## 3. 启用 AI 解析

Supabase CLI 可由官方文档安装；在本项目目录关联项目后部署：

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy parse-entry --no-verify-jwt
supabase functions deploy import-bills --no-verify-jwt
```

在 Supabase Dashboard 的 **Edge Functions → Secrets** 设置：

| 名称 | 用途 |
| --- | --- |
| `AI_API_URL` | 支持 Chat Completions JSON 对象响应的 HTTPS 接口完整地址 |
| `AI_API_KEY` | 模型服务 API key，仅保存在服务端 |
| `AI_MODEL` | 服务商可用模型名 |
| `ALLOWED_ORIGIN` | 推荐设为网页 origin，例如 `https://YOUR_NAME.github.io`，不包含仓库路径 |

当前部署选择 OpenRouter 目录中明确标价为 0、支持 JSON 的 `nvidia/nemotron-3.5-super-vl:free`，接口为 `https://openrouter.ai/api/v1/chat/completions`，服务端设置 `AI_DISABLE_REASONING=true`。不启用付费模型回退；免费额度用完或供应商不可用时返回错误。该配置下主动提交的 AI 文本经 Supabase 转交 OpenRouter 与对应模型提供商；模型仅返回草稿。

例如，使用 DashScope 的兼容接口可将 `AI_API_URL` 设为 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`，模型按你的地域、账号授权与可用模型设置。自选提供商必须支持 `response_format: { type: 'json_object' }`。Supabase 自动注入 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，不要填入前端。

两支函数均在处理器内校验凭据：AI 通过 Supabase Auth 验证用户 JWT，导入通过渠道密钥验证；关闭网关 JWT 检查不等于允许匿名记账。

网页中切换“AI 解析”。该功能需要已登录、已加入家庭；每个用户每天最多 30 次调用（服务端原子计数，按数据库日期），费用由所选模型提供商计收。文本只在你主动选择 AI 时发送，语音由浏览器识别。模型只返回草稿；失败不会自动写入账本。

## 4. 配置持续账单导入

**这里提供真实可部署的授权接收接口，不代表已获得任何银行、微信或支付宝的个人流水 API 权限。** 这些服务没有统一开放的个人账单接口。当前官方导出 CSV 可直接用；自动同步需要你已授权的提供商，或使用托管自动化服务将邮件账单解析成以下格式后推送。普通网页无法读取手机短信。

1. 创建者在“数据连接 → 创建授权接收渠道”中选择一个账户并生成密钥。密钥仅展示一次，数据库只保存 SHA-256 哈希。
2. 将接收地址与渠道密钥交给你控制的服务端账单适配器，例如已授权银行 API、邮件账单解析的托管工作流。密钥相当于该渠道的写入凭证，不放前端、不发给不可信服务。
3. 每次账单变化推送 1—200 条标准记录，金额单位为**分**：

```http
POST https://YOUR_PROJECT.supabase.co/functions/v1/import-bills
Content-Type: application/json
X-Channel-Token: YOUR_ONE_TIME_CHANNEL_TOKEN

{
  "entries": [
    {
      "externalId": "provider-transaction-unique-id",
      "kind": "expense",
      "amount": 2500,
      "date": "2026-10-16",
      "category": "餐饮",
      "note": "中午快餐"
    }
  ]
}
```

接收器根据密钥固定家庭、账户和归属成员；请求不能指定其他家庭。只接收 `income` / `expense`，转账需核对双边账户后录入。重推同一渠道、账户和 `externalId` 不重复写入，返回 `received/inserted/duplicates`；同一批错误记录会整批拒绝。成功后 Realtime 通知已打开的网页。

渠道 id 构成账单来源命名空间。**不同渠道之间、CSV 与渠道之间不自动判重**，同一来源应固定使用一种导入路径，避免重复。创建新渠道替换旧渠道时适配器应保存同步游标，避免重新发送已导入历史账单。

CSV 有源交易号时按来源+账户+源交易号去重，无交易号时以日期、收支类型、金额和备注组合去重。请人工核对同日同额同备注的不同消费；界面会提醒此限制。

撤销渠道后密钥立即失效。网页显示最近接收时间；未接入提供商时保持“待配置”，不会模拟同步状态。

## 5. Resend 专用邮件接收

本项目已实现 `email-bills` 云函数和 `202610160002_email_routes.sql`。与文本 AI 解析独立，邮件 CSV 导入不调用模型。仅处理明确表格，避免误解析正文为交易。

1. 在 Resend 使用 **Full access** 项目密钥。**Sending access / 仅发送邮件** 密钥不能读取收件或配置 webhook；需要另建完整权限密钥。
2. 在 Emails → Receiving → Receiving address 取得账户托管的 `<id>.resend.app` 域名，无需购买域名。Resend 的收件免费额度与限制以控制台为准。
3. 在 Resend 新建 `email.received` webhook，地址设为 `https://YOUR_PROJECT.supabase.co/functions/v1/email-bills`。仅在 Supabase Edge Secrets 保存 `RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET`、`RESEND_RECEIVING_DOMAIN`。
4. 部署 `email-bills`（网关 `verify_jwt=false`，函数自行验证原始请求的 Svix HMAC 签名与 5 分钟时间窗口）。GitHub 构建变量设置公开的 `VITE_MAIL_RECEIVING_DOMAIN`，重新发布后显示邮件接收表单。
5. 登录家庭创建者账号，创建实际账户并核对初始估值。数据连接 → 邮件账单接收，选择账户并填允许的发件/转发邮箱，生成随机专用收件地址。每个渠道只对应一个账户；归属人从该账户确定。
6. 从指定邮箱转发官方未加密 CSV 附件到该专用地址，或由邮箱创建仅匹配所选账单的转发规则。部分邮箱自动转发会保留原始 From，此时应使用实际到达邮件的发件地址。启用真实转发前核对来源与目的地：选中的邮件与附件将经过 Resend、Supabase，并由家庭协作者读取。不要转发其他私人邮件。

每封 1—5 个 CSV、合计最多 5MB / 5000 笔。UTF-8 与 GB18030 共用前端 CSV 解析器。暂不支持 PDF、Excel、加密 ZIP 或正文账单；不支持的附件会记录未导入状态。所有 CSV 先解析再写入，每批最多 200 笔；瞬时故障返回可重试状态，已提交的交易由同渠道的交易号唯一约束防止重复。自动邮件必须包含原始交易号；缺少交易号、格式或编码错误时整封拒绝，记录人工处理提示，不反复重试。请改用手动 CSV 导入并核对预览；同一来源不要同时用另一个渠道或手动 CSV 导入。

只有签名通过、目标域名正确、唯一专用收件地址匹配、发件邮箱被允许的邮件才会触发读取附件。收件地址相当于写入凭证，请保密；发件地址匹配不是银行真实性认证，仍须核对账单。原始邮件不写入账本数据库，但邮件服务可能按其策略保留副本。渠道可在上方列表撤销，撤销级联删除专用地址映射。

## 6. 家人通过 GitHub 登录（免 SMTP）

Supabase 默认邮件服务不能保证向所有家人发信。如果没有已验证的 SMTP 发信域名，可配置 GitHub OAuth；每位家人需要自己的 GitHub 账号。

1. GitHub Settings → Developer settings → OAuth Apps 创建应用。Homepage URL 设置站点完整地址；Authorization callback URL 为 `https://YOUR_PROJECT.supabase.co/auth/v1/callback`。
2. 在 Supabase Authentication → Sign In / Providers → GitHub 设置 Client ID 和 Client secret，启用该提供商。Client secret 仅保存在后端配置中，不放前端变量。
3. GitHub Actions Variables 设置 `VITE_GITHUB_LOGIN_ENABLED=true`，重新发布后显示“通过 GitHub 登录”。站点与 Redirect URLs 已配置为 Pages 完整地址。
4. 家庭创建者与家人分别登录，使用一次性邀请码加入同一家庭。提供商登录账号不会自动授权加入任何家庭。

## 财务计算口径

- 所有金额以人民币分整数保存。账户不换算外币。
- 估值快照表示**当日结束**的价值，已包含当天交易。某日账户余额 = 最近快照 + 快照之后的净交易变动。同日补录交易不会叠加到同日结束快照上。
- 净资产 = 正负资产账户余额合计 − 未偿还负债。负债录入正数；信用账户支出增加负债，从现金账户向负债账户转账减少负债。
- 正资产配比只包含大于零的资产余额，不包含负债；负债单列。没有估值的账户不作零估值推断，指标提示缺失数量。
- 区间包含首尾日，期初值取开始日前一天。内部转账不计收支；跨成员转账分别改变成员余额，在家庭组合中抵销。
- 投资估值收益 = 投资账户期末价值 − 期初价值 − 外部资金净流入。投资账户内分类为“投资收益”的收入视作收益；到账现金账户的股息暂不自动归属某个投资账户，需用户按实际账户记录。
- 期间收益率使用 **Modified Dietz**：收益 /（期初价值 + 按剩余天数加权的资金流），不年化。每日资金流视为当日结束发生。未录入开始日前一天与截止日的投资账户估值、没有投资账户或加权本金非正时收益及收益率留空，不把工资、存款本金或转账当投资回报。
- 估值之间假设未记录价格变化；要看每周/月/季度/年回报，请定期录入相应历史估值。该功能没有接行情 API，不实时估价。

预览仓库子路径的构建时需使用相同前缀，例如 `pnpm preview --base=/family-finance/`，再访问 `/family-finance/`。

## 验证与项目结构

```sh
pnpm lint
pnpm typecheck
pnpm exec tsc -p supabase/functions/tsconfig.json
pnpm test
pnpm build --base=/family-finance/
pnpm exec playwright install chromium
pnpm test:e2e
```

- `src/lib/finance.ts`：金额、日期、余额、投资回报。
- `src/lib/import.ts` / `parser.ts`：CSV、备份校验、文本解析。
- `src/lib/store.ts` / `cloud.ts`：本机与云端隔离、登录、同步。
- `src/App.vue` / `src/components/`：页面与记账/导入弹窗。
- `supabase/migrations/`：数据库、RLS、邀请与渠道 RPC、AI 额度。
- `supabase/functions/`：带登录鉴权的 AI 解析、带渠道鉴权的幂等导入。
- `docs/verification.md`：实际执行的验证和待联调清单。

仓库不包含真实家庭账单或服务端凭据。实际部署和联调结果见 docs/verification.md；未完成的收件服务与登录提供商配置不能当作已接通，邮件渠道也不等于银行个人流水 API。
