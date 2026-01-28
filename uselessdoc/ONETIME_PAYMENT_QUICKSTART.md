# 一次性支付系统 - 快速开始

## 🎯 5 分钟快速上手

### 1. 确认新 API 已成功构建

✅ 已完成! 构建输出显示:

```
├ ƒ /api/payment/onetime/confirm         200 B
├ ƒ /api/payment/onetime/create          200 B
├ ƒ /api/payment/onetime/webhook         200 B
```

### 2. 前端调用示例

**复制粘贴即可使用**:

```typescript
// 创建支付按钮组件
export function BuyMembershipButton() {
  const handlePurchase = async (
    method: "stripe" | "paypal",
    cycle: "monthly" | "yearly"
  ) => {
    try {
      // 1. 创建支付
      const res = await fetch("/api/payment/onetime/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: method,
          billingCycle: cycle,
        }),
      });

      const data = await res.json();

      if (data.success && data.paymentUrl) {
        // 2. 跳转到支付页面
        window.location.href = data.paymentUrl;
      } else {
        alert("创建支付失败: " + data.error);
      }
    } catch (error) {
      alert("网络错误,请稍后重试");
    }
  };

  return (
    <div>
      <h2>购买会员</h2>

      {/* 月付 $9.99 = 30天 */}
      <div>
        <h3>月付 - $9.99</h3>
        <button onClick={() => handlePurchase("stripe", "monthly")}>
          Stripe 支付
        </button>
        <button onClick={() => handlePurchase("paypal", "monthly")}>
          PayPal 支付
        </button>
      </div>

      {/* 年付 $99.99 = 365天 */}
      <div>
        <h3>年付 - $99.99</h3>
        <button onClick={() => handlePurchase("stripe", "yearly")}>
          Stripe 支付
        </button>
        <button onClick={() => handlePurchase("paypal", "yearly")}>
          PayPal 支付
        </button>
      </div>
    </div>
  );
}
```

### 3. 支付成功页面

在 `app/payment/success/page.tsx` 中已经有了,只需要确保它调用一次性支付确认:

```typescript
// app/payment/success/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function PaymentSuccessPage() {
  const [result, setResult] = useState<any>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const confirm = async () => {
      const sessionId = searchParams.get("session_id");
      const token = searchParams.get("token");

      if (!sessionId && !token) return;

      const params = new URLSearchParams();
      if (sessionId) params.set("session_id", sessionId);
      if (token) params.set("token", token);

      // 调用一次性支付确认
      const res = await fetch(
        `/api/payment/onetime/confirm?${params.toString()}`
      );
      const data = await res.json();
      setResult(data);
    };

    confirm();
  }, [searchParams]);

  if (!result) return <div>确认支付中...</div>;

  if (!result.success) {
    return <div>支付失败: {result.error}</div>;
  }

  return (
    <div>
      <h1>✅ 支付成功!</h1>
      <p>已为您添加 {result.daysAdded} 天会员</p>
      <p>交易ID: {result.transactionId}</p>
      <a href="/profile">查看会员状态</a>
    </div>
  );
}
```

### 4. 环境变量配置

确保 `.env.local` 中有以下配置:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# PayPal
PAYPAL_CLIENT_ID=xxxxx
PAYPAL_CLIENT_SECRET=xxxxx
PAYPAL_ENVIRONMENT=sandbox

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
```

### 5. 本地测试

#### A. 启动开发服务器

```bash
npm run dev
```

#### B. 测试 Stripe 支付

1. 访问你的支付页面
2. 点击 "Stripe 支付"
3. 使用测试卡号: `4242 4242 4242 4242`
4. 过期日期: 任意未来日期
5. CVC: 任意 3 位数

#### C. 测试 PayPal 支付

1. 点击 "PayPal 支付"
2. 使用 PayPal Sandbox 测试账号登录
3. 完成支付

### 6. Webhook 配置 (生产环境)

#### Stripe

1. 访问: https://dashboard.stripe.com/webhooks
2. 点击 "Add endpoint"
3. URL: `https://你的域名.com/api/payment/onetime/webhook`
4. 选择事件: `checkout.session.completed`
5. 复制 Signing secret 到 `STRIPE_WEBHOOK_SECRET`

#### PayPal

1. 访问: https://developer.paypal.com/dashboard/
2. 选择你的应用
3. 添加 Webhook URL: `https://你的域名.com/api/payment/onetime/webhook`
4. 选择事件: `CHECKOUT.ORDER.APPROVED`

---

## 📊 查看用户会员状态

### SQL 查询

```sql
SELECT
  id,
  email,
  subscription_plan,
  subscription_status,
  membership_expires_at,
  CASE
    WHEN membership_expires_at > NOW() THEN '有效会员'
    ELSE '已过期'
  END AS status
FROM user_profiles
WHERE id = 'user-uuid';
```

### API 查询 (可选)

创建一个简单的 API 查询用户状态:

```typescript
// app/api/membership/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("subscription_plan, subscription_status, membership_expires_at")
    .eq("id", authResult.user.id)
    .single();

  const now = new Date();
  const expiresAt = data?.membership_expires_at
    ? new Date(data.membership_expires_at)
    : null;
  const isActive = expiresAt && expiresAt > now;

  return NextResponse.json({
    plan: data?.subscription_plan || "free",
    status: data?.subscription_status || "inactive",
    expiresAt: data?.membership_expires_at,
    isActive,
    daysRemaining: isActive
      ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0,
  });
}
```

---

## ✅ 完成检查清单

- [x] 代码已构建成功
- [ ] 环境变量已配置
- [ ] 前端按钮已集成
- [ ] 本地测试通过
- [ ] Webhook 已配置(生产环境)
- [ ] 支付成功页面正常工作

---

## 🚀 部署到生产环境

### Vercel 部署

```bash
# 确保环境变量在 Vercel 中已配置
vercel --prod
```

### 环境变量设置

在 Vercel Dashboard → Settings → Environment Variables 中添加:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENVIRONMENT` = `production`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`

---

## 🎉 就这么简单!

现在你已经有了一个完整的一次性支付系统:

- ✅ 简单易用
- ✅ 无自动续费
- ✅ 会员时间累加
- ✅ 支持 Stripe 和 PayPal
- ✅ 准时下班无压力

**祝你早日上线!** 😊
