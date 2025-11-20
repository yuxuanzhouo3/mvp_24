# 🚀 生产上线核查清单（Go-Live Check）

生成时间：2025-10-30  
仓库：mvp_24-main  
框架：Next.js 15.1.6 / React 19 / TypeScript 5  
部署目标：Vercel（regions: sin1, hnd1） + Supabase + Stripe/PayPal + 多 AI Provider

---

## 概览与结论

- 生产就绪度：约 70%（核心链路完整，需补强安全、监控与测试）
- Go/No-Go：完成本文“上线前必须完成”的阻断项后建议先小流量灰度发布
- 主要风险：
  - CORS 过宽（vercel.json 对 /api/_ 为 _）
  - 构建门禁绕过 Lint/Typecheck（next.config 忽略错误）
  - 监控/错误追踪/告警缺失
  - Webhook 全链路需要一次预发实测（签名校验/幂等等）

---

## 当前配置画像（事实陈述）

- 包管理与脚本
  - scripts：build/dev/lint/start + supabase 脚本齐全
  - 未见测试脚本集成到主应用（lib/architecture-modules 子包有 jest 配置）
- Next 配置（next.config.mjs）
  - eslint.ignoreDuringBuilds = true（构建不阻断 Lint）
  - typescript.ignoreBuildErrors = true（构建不阻断 TS 错误）
  - images.unoptimized = true
  - 已存在站点级安全头（含 CSP/HSTS/XFO/XCTO/Referrer-Policy/Permissions-Policy）
    - 注意：connect-src 目前包含 http: 和 https: 宽泛通配，应在生产环境收紧为精确域名白名单
- 部署（vercel.json）
  - regions: [sin1, hnd1]
  - 对 /api/_ 下发 CORS: _（过宽）
  - functions 对 middleware.ts 指向 @vercel/node（与 Next Middleware 的 Edge 运行模型不一致，建议移除该覆盖）
- 中间件与地理分流
  - middleware.ts：
    - 欧洲 IP 全屏蔽（403）
    - 国内/国际域名分流（依赖 DOMESTIC_SYSTEM_URL 与 INTERNATIONAL_SYSTEM_URL）
- 鉴权与会话
  - API 使用 Bearer（Supabase token）鉴权，/api/auth/status 用 supabase.auth.getSession() 诊断
- 支付
  - /api/payment/create：校验金额（月 9.99 / 年 99.99）、幂等检查（5 分钟窗口）
  - Webhook：
    - Stripe 路由内进行签名校验（constructEvent），默认 runtime（Next 路由默认 NodeJS）
    - 统一处理器 `lib/payment/webhook-handler.ts` 做事件去重与状态落库
- AI 聊天
  - /api/chat/send：SSE 流式响应，runtime = nodejs，Edge 速率限制器，记录 Token 使用
- 速率限制与日志
  - lib/rate-limit.ts：提供 Express 版与 Edge 版；关键路由已接入
  - lib/logger.ts：Node 走 winston + 日志轮换；Edge 回退 console
- 环境变量
  - .env.example 与 .env.ai.example 清单清楚；应仅在平台层设置生产密钥

---

## 上线前必须完成（阻断项）

1. 安全与 CORS 收紧（高）

实施目标：仅允许来自生产域名的跨域请求，最小化前端可访问外联域名，确保任何历史泄露密钥已处理。

实施步骤（建议按序执行）

- CORS 收紧（/api/\*）：
  - 基础方案：在 `vercel.json` 为 `/api/(.*)` 只允许你的生产域名，例如 `https://yourdomain.com`。
  - 如需多域名（例如 `admin.yourdomain.com`），优先在代码中按白名单反射 `Origin`；仅文档说明，避免在生产用 `*`。
  - 若需要携带凭证（cookies/Authorization），确保未使用 `*`，并设置 `Access-Control-Allow-Credentials: true` 与精确的 `Access-Control-Allow-Headers`。
- CSP 收紧：
  - 仅保留业务必需域名；删除调试/临时域名；谨慎移除任何 `http:` 源（与 HSTS 冲突）。
  - 关键指令：`default-src`、`script-src`、`style-src`、`img-src`、`font-src`、`connect-src`、`frame-src`、`object-src`、`base-uri`、`form-action`。
- 秘钥卫生：
  - 确认 `.env.local` 不含真实密钥；生产只使用部署平台环境变量。
  - 若有历史泄露，立即轮换：Supabase、Stripe、PayPal、OpenAI/Anthropic/DeepSeek 等。

配置示例（仅文档示例，不代表已应用）

- vercel.json（单域名最小示例）：

  ```json
  {
    "headers": [
      {
        "source": "/api/(.*)",
        "headers": [
          {
            "key": "Access-Control-Allow-Origin",
            "value": "https://yourdomain.com"
          },
          {
            "key": "Access-Control-Allow-Methods",
            "value": "GET, POST, PUT, DELETE, OPTIONS"
          },
          {
            "key": "Access-Control-Allow-Headers",
            "value": "Content-Type, Authorization"
          }
        ]
      }
    ]
  }
  ```

  说明：如需多域名白名单，推荐在 API 路由代码层按白名单校验 `Origin` 并回显；避免在配置层写多条相同 header 导致不确定性。

- CSP 基线策略（需替换为你的实际域名与供应商）：
  ```text
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.paypal.com https://www.gstatic.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.deepseek.com https://YOUR_SUPABASE_PROJECT.supabase.co https://js.stripe.com https://www.paypal.com https://ipapi.co https://ipinfo.io;
  frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.paypal.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://www.paypal.com;
  frame-ancestors 'self';
  ```
  提示：将 `YOUR_SUPABASE_PROJECT` 替换为你的真实 Supabase 项目域名；若生产不依赖部分第三方（如 IP 识别服务），请直接移除对应源。

验证步骤（建议留存截图/命令输出）

- 预检请求（OPTIONS）返回应包含精确的 `Access-Control-Allow-Origin`，不为 `*`。
- 实际跨域请求在生产域名下成功，非白名单域名应 403/阻断。
- 浏览器开发者工具 → 网络 → Response Headers 能看到 CSP 与 CORS 头。
- 使用命令行快速验证（PowerShell）：

  ```powershell
  # 预检
  $headers = @{"Origin"="https://yourdomain.com"; "Access-Control-Request-Method"="POST"}
  Invoke-WebRequest -Method Options https://yourdomain.com/api/health -Headers $headers -SkipCertificateCheck | Select-Object -ExpandProperty Headers

  # 实际请求（示例端点请替换）
  Invoke-WebRequest -Method Get https://yourdomain.com/api/auth/status -Headers @{"Origin"="https://yourdomain.com"} -SkipCertificateCheck | Select-Object -ExpandProperty StatusCode
  ```

验收标准（Acceptance Criteria）

- CORS：仅生产白名单域名可跨域；`Allow-Origin` 不为 `*`；如需凭证，`Allow-Credentials` 为 `true` 且无通配。
- CSP：无不必要通配；仅包含必要第三方；在浏览器控制台无阻断性 CSP 报错（或已评估为可接受）。
- Secrets：仓库无真实秘钥；若检测到历史泄露，已完成密钥轮换与范围内通知。

2. 运行时一致性与 Webhook（高）

- 确认 Stripe Webhook 路由在 NodeJS Runtime 运行（Next 默认即为 NodeJS；切勿切到 Edge）
- 对 PayPal/其他 Webhook 亦统一：显式 NodeJS runtime、严格签名校验
- 预发全链路实测：签名 -> 幂等 -> 订阅/支付记录落库 -> 失败重试/重复事件处理
- 移除 vercel.json 对 middleware.ts 的 Node 函数覆盖（Middleware 应为 Edge Runtime）

3. 监控、错误追踪与告警（高）

- 集成 Sentry/Datadog：捕获后端路由与 Webhook 的异常、性能指标
- 配置 Uptime 监控与健康检查端点（/api/health）
- 定义基础告警（5xx 错误率、Webhook 失败、429 过多、响应时间异常）

4. 质量门禁与 CI（高）

- 新建 GitHub Actions：install → typecheck → lint → unit/integration tests → build
- 暂时将 Lint/TS 错误从“非阻断”过渡为“告警”，1-2 周内改为阻断

5. 最小化测试套件（高）

- API：/api/auth/status、/api/chat/send、/api/payment/create 的基础用例（成功 + 1 个错误路径）
- Webhook：Stripe 的签名校验 + 重放重复事件幂等验证 + 订阅状态流转

---

## 上线后一至两周内完成（中）

- 性能与缓存：为热点接口引入缓存（Redis/Vercel KV/Edge Config），定义 TTL 与失效策略
- 文档与运维：事故处置 Runbook（密钥轮换、回滚策略、常见告警处理）
- 安全增强：
  - （可选）Webhook 来源 IP 白名单
  - 输入验证统一层（zod）强化与输出清洗
- 前端/后端 Bundle 体积监控与优化

---

## 环境变量矩阵（生产必需，核对）

- Supabase
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY（仅后端使用，不暴露到客户端）
- Stripe
  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - 价格 ID：STRIPE_PRO_MONTHLY_PRICE_ID / STRIPE_PRO_ANNUAL_PRICE_ID（如有团队版相应补齐）
- PayPal
  - PAYPAL_CLIENT_ID
  - PAYPAL_CLIENT_SECRET
  - 对应 PLAN_ID（与产品配置一致）
- AI Provider
  - OPENAI_API_KEY / ANTHROPIC_API_KEY /（国内：DEEPSEEK_API_KEY 等）
- 地理/分流（若启用）
  - DOMESTIC_SYSTEM_URL
  - INTERNATIONAL_SYSTEM_URL

提示：生产环境仅在部署平台（Vercel/Supabase）配置，不在仓库保留真实 .env.local。

---

## 质量门禁结果（当前会话内评估）

- Build：未实际执行；按配置“可能通过但忽略错误”（风险）
- Lint/Typecheck：FAIL（构建时被忽略）
- Tests：FAIL（缺少主应用可运行测试）

→ 需在 CI 中补齐并过渡到“阻断”。

---

## 灰度发布策略与回滚

- 小流量灰度（10%-20%）观察 24-48 小时：关注 5xx/错误率、Webhook 失败、超时、429
- 明确回滚机制：一键回滚到上一个稳定版本；数据库迁移需可逆或向前兼容
- 建立告警升级路径（P1/P2/P3）与责任人

---

## 实操验证建议（上线前一键清单）

- [ ] 生产域名 + HTTPS（HSTS 生效）
- [ ] CSP/安全头生效（实际抓包核对，connect-src 为白名单）
- [ ] CORS 为生产域名白名单（预检与实际请求通过）
- [ ] Stripe/PayPal Webhook：签名校验通过，重复事件不重复入库
- [ ] 错误追踪平台收到生产测试事件
- [ ] 健康检查就绪，Uptime 监控正常报警
- [ ] CI 全绿（typecheck/lint/test/build）并启用主分支保护
- [ ] 环境变量核对且所有可能泄露的密钥已旋转
- [ ] 速率限制命中可观测（429 量在可控范围）
- [ ] 欧洲 IP 屏蔽策略经法务复核留痕

---

## 备注与说明

- 本核查基于仓库当前文件快照与常见生产最佳实践给出。如与你的实际部署平台或业务流程不一致，请以生产平台要求为准并补充差异说明。
- 建议将本文件纳入变更评审（CAB/CR）流程，作为上线前的标准化检查清单。

— 完 —
