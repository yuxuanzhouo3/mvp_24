# ✅ Apple IAP 过期时间同步修复（v1.2）

## 问题

```
Apple 真实过期时间: 5分钟 ⏰
数据库显示: 30天 📅
前端显示: 30天 💻
结果: 完全不同步 ❌
```

用户看到订阅有 30 天，但实际上 5 分钟后就过期了。

## 根本原因

老代码的问题：
```typescript
// ❌ 错误：使用本地计算加上 days
const days = getDaysByBillingCycle(billingCycle); // 30 天
newExpiresAt = new Date();
newExpiresAt.setDate(newExpiresAt.getDate() + days); // 加 30 天

// 这导致数据库显示 30 天，忽略了 Apple 的真实 5 分钟
```

## 修复方案

**严格原则：Apple IAP 必须用 Apple 返回的时间，不能用本地计算**

```typescript
// ✅ 正确：只使用 Apple 返回的真实过期时间
const appleExpiresDate = verificationResult.expiresDate; // Apple 的 5分钟
newExpiresAt = new Date(appleExpiresDate); // 直接用，不加任何天数

// 现在数据库显示的就是 Apple 的真实 5分钟
```

## 修改的文件

### 1. `app/api/payment/ios-iap/confirm/route.ts`

**改动：验证失败直接拒绝**

```typescript
// Before: 验证失败继续处理（降级）❌
if (!verificationResult.isValid) {
  // 继续处理... (用 30 天)
}

// After: 验证失败直接返回错误 ✅
if (!verificationResult.isValid) {
  return NextResponse.json(
    {
      success: false,
      error: "Apple verification required",
      message: "Please configure Apple IAP credentials"
    },
    { status: 400 }
  );
}
```

**原因：** 如果无法从 Apple 获取真实过期时间，就不能盲目接受支付

### 2. `app/api/payment/lib/extend-membership.ts`

**改动：简化逻辑，必须使用 Apple 时间**

```typescript
// Before: 有多个分支处理
if (appleExpiresDate) {
  // 使用 Apple
} else if (verificationSource === "fallback") {
  // 使用计算（30天）❌
} else {
  // 其他...
}

// After: 只有一种情况，必须是 Apple 时间
export async function extendMembership(
  userId: string,
  days: number,
  transactionId: string,
  appleExpiresDate: number // 必须有值，必须是 Apple 返回的
): Promise<boolean>

// 直接使用 Apple 时间，不加任何天数
newExpiresAt = new Date(appleExpiresDate);
```

## 支付流程现在

```
1. 用户在 iOS 购买 ✅
   
2. Apple 返回交易信息
   - transactionId: "2000001109790144"
   - expiresDate: 5分钟后
   
3. 后端向 Apple API 验证
   - ✅ 成功: 获得真实过期时间 (5分钟)
   - ❌ 失败: 返回 400 错误
   
4. 如果验证成功:
   - 使用 Apple 的 5分钟 ⏰
   - 存入数据库: current_period_end = 5分钟
   - 返回 200 OK
   
5. 如果验证失败:
   - 返回错误: "Apple verification required"
   - 提示用户配置 Apple API 凭证
   - 返回 400 错误
   
6. 前端显示:
   - 过期时间 = Apple 返回的 5分钟 ✅
   - 不是计算的 30 天 ✅
```

## 关键改进

| 方面 | Before | After |
|------|--------|-------|
| **过期时间来源** | 本地计算 30 天 ❌ | Apple 返回的真实时间 ✅ |
| **Apple 5分钟** | 被忽略 ❌ | 被正确使用 ✅ |
| **数据库** | 30 天 ❌ | 5 分钟 ✅ |
| **前端显示** | 30 天 ❌ | 5 分钟 ✅ |
| **同步性** | 不同步 ❌ | 完全同步 ✅ |

## 现在的数据流

```
Apple Server (5分钟)
      ↓
验证成功 ✅
      ↓
获得: expiresDate = 1740396600000 (5分钟后)
      ↓
数据库: current_period_end = "2026-01-25T13:07:24Z" (5分钟)
      ↓
前端: 显示 5分钟有效期 ✅
```

## 测试方法

### 沙箱环境（5分钟订阅）

```bash
1. 确保配置了 Apple API 凭证
   APPLE_KEY_ID=...
   APPLE_ISSUER_ID=...
   APPLE_PRIVATE_KEY=...

2. 在 iOS 模拟器中购买（沙箱）

3. 查看后端日志
   [INFO] ✅ Apple subscription verified successfully
   [INFO] 🔥 Using APPLE-PROVIDED expiration date (source of truth)

4. 查看响应
   {
     "success": true,
     "expiresAt": "2026-01-25T13:07:24.000Z",  // 5分钟
     "verificationSource": "apple"
   }

5. 检查数据库
   SELECT current_period_end 
   FROM subscriptions 
   WHERE transaction_id = '2000001109790144'
   
   应该看到: 2026-01-25T13:07:24Z (大约5分钟)
```

### 生产环境（30天订阅）

```bash
同样的流程，但 Apple 返回的是 30 天的过期时间
数据库也会正确显示 30 天
```

## 前端如何显示

```typescript
// API 返回示例
{
  "success": true,
  "expiresAt": "2026-01-25T13:07:24.000Z",
  "verificationSource": "apple"
}

// 前端处理
const expiresDate = new Date("2026-01-25T13:07:24.000Z");
const now = new Date();
const secondsLeft = (expiresDate - now) / 1000;

if (secondsLeft > 0) {
  // 已激活，显示还剩多长时间
  if (secondsLeft < 600) { // 10分钟
    display = "5分钟"; // 沙箱
  } else {
    display = "30天"; // 生产
  }
} else {
  // 已过期
  display = "已过期，请续订";
}
```

## 错误处理

### 情况 1: Apple API 凭证未配置

```
用户购买
   ↓
验证失败: "Failed to generate Apple JWT"
   ↓
返回 400 错误
   ↓
前端提示: "Apple IAP 配置缺失，请联系管理员"
```

**解决：** 配置 `.env.local`
```env
APPLE_KEY_ID=...
APPLE_ISSUER_ID=...
APPLE_PRIVATE_KEY=...
```

### 情况 2: Apple API 凭证已过期

```
用户购买
   ↓
验证失败: "API error: 401"
   ↓
返回 400 错误
   ↓
前端提示: "请更新 Apple API 凭证"
```

**解决：** 在 App Store Connect 重新生成 API Key

## 重要说明

⚠️ **这是 strict 模式，不允许降级处理**

原因：
- Apple IAP 的过期时间必须从 Apple 获取
- 不能用本地计算替代（会导致不同步）
- 如果无法验证，宁可拒绝也不能错误处理

如果需要降级处理，应该在 iOS 端或前端处理，而不是后端。

## 日志示例

### 成功场景
```
[INFO] Attempting to verify subscription with Apple servers
[INFO] ✅ Apple subscription verified successfully {
  expiresDate: 1740396600000,
  autoRenewStatus: true
}
[INFO] 🔥 Using APPLE-PROVIDED expiration date (source of truth)
[INFO] Updated subscription record in CloudBase
[200] POST /api/payment/ios-iap/confirm
```

### 失败场景
```
[INFO] Attempting to verify subscription with Apple servers
[ERROR] ❌ Apple subscription verification FAILED {
  error: "Failed to generate Apple JWT",
  message: "Please configure Apple IAP credentials"
}
[400] POST /api/payment/ios-iap/confirm
```

## 修复总结

✅ **现在过期时间完全同步 Apple**
- Apple 说 5分钟，就是 5分钟
- Apple 说 30天，就是 30天
- 不会有多余的天数被加上去

---

**修复时间：** 2026年1月25日  
**版本：** v1.2 (Strict Mode)  
**状态：** ✅ 已完成，可部署
