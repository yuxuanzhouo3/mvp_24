# 一次性支付系统使用指南

## 概述

本项目现在支持**两套独立的支付系统**:

1. **订阅支付系统** (保留但不启用)
   - 路径: `/api/payment/create`, `/api/payment/confirm`, `/api/payment/webhook`
   - 功能: 自动续费订阅
2. **一次性支付系统** (新建并启用) ✅
   - 路径: `/api/payment/onetime/create`, `/api/payment/onetime/confirm`, `/api/payment/onetime/webhook`
   - 功能: 一次性付款,购买固定天数会员

---

## 一次性支付系统架构

### 核心理念

- **简单明了**: 用户付款 → 获得会员时间
- **无自动续费**: 到期后需要手动再次购买
- **时间累加**: 多次购买会员时间会自动累加

### 支付流程

```
用户点击购买
    ↓
调用 /api/payment/onetime/create
    ↓
获取支付链接 (PayPal/Stripe)
    ↓
用户完成支付
    ↓
跳转到 /api/payment/onetime/confirm
    ↓
延长会员时间
    ↓
完成!
```

---

## API 使用说明

### 1. 创建支付 - `/api/payment/onetime/create`

**请求方法**: `POST`

**请求参数**:

```json
{
  "method": "paypal" | "stripe",
  "billingCycle": "monthly" | "yearly"
}
```

**响应示例**:

```json
{
  "success": true,
  "paymentId": "cs_test_abc123...",
  "paymentUrl": "https://checkout.stripe.com/pay/..."
}
```

**价格和天数**:

- `monthly`: $9.99 USD → 30 天会员
- `yearly`: $99.99 USD → 365 天会员

---

### 2. 确认支付 - `/api/payment/onetime/confirm`

**请求方法**: `GET`

**URL 参数**:

- Stripe: `?session_id=cs_test_xxx`
- PayPal: `?token=EC-xxx`

**响应示例**:

```json
{
  "success": true,
  "transactionId": "cs_test_abc123",
  "amount": 9.99,
  "currency": "USD",
  "daysAdded": 30
}
```

---

### 3. Webhook 处理 - `/api/payment/onetime/webhook`

**请求方法**: `POST`

**功能**:

- 自动处理支付成功回调
- 延长用户会员时间
- 更新支付记录状态

**支持的事件**:

**Stripe**:

- `checkout.session.completed` (mode=payment)

**PayPal**:

- `CHECKOUT.ORDER.APPROVED`

---

## 前端集成示例

### React/Next.js 组件

```typescript
// components/payment/OnetimePaymentButton.tsx
"use client";

import { useState } from "react";

export function OnetimePaymentButton({
  billingCycle,
}: {
  billingCycle: "monthly" | "yearly";
}) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (method: "paypal" | "stripe") => {
    setLoading(true);
    try {
      const response = await fetch("/api/payment/onetime/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, billingCycle }),
      });

      const data = await response.json();

      if (data.success && data.paymentUrl) {
        // 跳转到支付页面
        window.location.href = data.paymentUrl;
      } else {
        alert("支付创建失败: " + (data.error || "未知错误"));
      }
    } catch (error) {
      console.error("Payment error:", error);
      alert("支付失败,请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const price = billingCycle === "monthly" ? "$9.99" : "$99.99";
  const days = billingCycle === "monthly" ? 30 : 365;

  return (
    <div className="payment-card">
      <h3>
        {billingCycle === "monthly" ? "月付" : "年付"} - {price}
      </h3>
      <p>{days} 天高级会员</p>

      <button
        onClick={() => handlePayment("stripe")}
        disabled={loading}
        className="btn-stripe"
      >
        {loading ? "处理中..." : "使用 Stripe 支付"}
      </button>

      <button
        onClick={() => handlePayment("paypal")}
        disabled={loading}
        className="btn-paypal"
      >
        {loading ? "处理中..." : "使用 PayPal 支付"}
      </button>
    </div>
  );
}
```

### 支付成功页面

```typescript
// app/payment/success/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function PaymentSuccessPage() {
  const [confirming, setConfirming] = useState(true);
  const [result, setResult] = useState<any>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const confirmPayment = async () => {
      const sessionId = searchParams.get("session_id");
      const token = searchParams.get("token");

      if (!sessionId && !token) {
        setConfirming(false);
        return;
      }

      try {
        const params = new URLSearchParams();
        if (sessionId) params.set("session_id", sessionId);
        if (token) params.set("token", token);

        const response = await fetch(
          `/api/payment/onetime/confirm?${params.toString()}`
        );
        const data = await response.json();

        setResult(data);
      } catch (error) {
        console.error("Confirmation error:", error);
        setResult({ success: false, error: "确认失败" });
      } finally {
        setConfirming(false);
      }
    };

    confirmPayment();
  }, [searchParams]);

  if (confirming) {
    return <div>正在确认支付...</div>;
  }

  if (!result) {
    return <div>支付信息缺失</div>;
  }

  if (!result.success) {
    return <div>支付确认失败: {result.error}</div>;
  }

  return (
    <div className="success-page">
      <h1>✅ 支付成功!</h1>
      <p>
        已为您添加 <strong>{result.daysAdded}</strong> 天会员时间
      </p>
      <p>交易ID: {result.transactionId}</p>
      <p>
        金额: {result.amount} {result.currency}
      </p>
      <a href="/profile">查看我的会员信息</a>
    </div>
  );
}
```

---

## 数据库结构

### payments 表

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL, -- pending, completed, failed
  payment_method VARCHAR(20) NOT NULL, -- stripe, paypal
  transaction_id TEXT,
  metadata JSONB, -- { days: 30, paymentType: "onetime", billingCycle: "monthly" }
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### user_profiles 表

需要确保有以下字段:

```sql
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'inactive';
```

---

## 环境变量配置

### Stripe (一次性支付)

```env
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
```

### PayPal (一次性支付)

```env
# PayPal API Credentials
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx
PAYPAL_ENVIRONMENT=sandbox  # or production

# App URLs
APP_URL=http://localhost:3000
```

**注意**: 一次性支付**不需要**配置订阅计划 ID:

- ❌ 不需要: `STRIPE_PRO_MONTHLY_PRICE_ID`
- ❌ 不需要: `PAYPAL_PRO_MONTHLY_PLAN_ID`
- ✅ 只需要: API Keys

---

## Webhook 配置

### Stripe Webhook

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. 添加 endpoint: `https://yourdomain.com/api/payment/onetime/webhook`
3. 选择事件: `checkout.session.completed`
4. 复制 signing secret 到 `STRIPE_WEBHOOK_SECRET`

### PayPal Webhook

1. 登录 [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications)
2. 选择你的应用
3. 添加 Webhook URL: `https://yourdomain.com/api/payment/onetime/webhook`
4. 选择事件: `CHECKOUT.ORDER.APPROVED`

---

## 测试

### Stripe 测试卡号

```
卡号: 4242 4242 4242 4242
过期日期: 任意未来日期
CVC: 任意3位数
ZIP: 任意5位数
```

### PayPal 测试账号

使用 PayPal Sandbox 账号:

- 访问: https://www.sandbox.paypal.com
- 使用测试买家账号登录

---

## 常见问题

### Q: 用户多次购买会怎样?

A: 会员时间会自动累加。例如:

- 当前到期时间: 2025-12-01
- 购买 30 天会员
- 新到期时间: 2025-12-31

### Q: 如果用户已经过期了再购买?

A: 从购买当天开始计算。例如:

- 当前时间: 2025-11-01
- 购买 30 天会员
- 到期时间: 2025-12-01

### Q: 支持退款吗?

A: 可以通过 PayPal/Stripe 后台手动退款,但不会自动减少会员时间。需要手动调整用户的 `membership_expires_at`。

### Q: 如何查看用户会员状态?

```sql
SELECT
  id,
  email,
  subscription_plan,
  subscription_status,
  membership_expires_at,
  membership_expires_at > NOW() AS is_active
FROM user_profiles
WHERE id = 'user-uuid';
```

---

## 迁移计划

如果将来想从订阅系统迁移到一次性支付:

1. **前端修改**: 将所有支付按钮指向 `/api/payment/onetime/create`
2. **停用订阅 Webhook**: 不再处理订阅相关事件
3. **已有订阅用户**: 继续有效直到到期,到期后引导使用一次性支付

---

## 优势对比

| 特性       | 订阅支付 | 一次性支付 ✅ |
| ---------- | -------- | ------------- |
| 自动续费   | ✅       | ❌            |
| 用户控制力 | 低       | 高            |
| 代码复杂度 | 高       | 低            |
| 退款处理   | 复杂     | 简单          |
| 升级/降级  | 复杂     | 不需要        |
| 维护成本   | 高       | 低            |
| 准时下班   | ❌       | ✅            |

---

## 总结

一次性支付系统现已准备就绪! 🎉

**核心优势**:

- ✅ 简单易用
- ✅ 无自动续费纠纷
- ✅ 代码简洁
- ✅ 易于维护

**前端只需要**:

1. 调用 `/api/payment/onetime/create` 获取支付链接
2. 跳转到支付页面
3. 支付成功后自动跳转回 `/payment/success?session_id=xxx`
4. 在成功页面调用 `/api/payment/onetime/confirm` 确认支付

**就这么简单!** 😊
