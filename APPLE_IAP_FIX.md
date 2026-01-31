# Apple IAP 服务器验证修复说明

## 问题分析

之前的 Apple IAP 支付流程存在一个关键问题：**过期时间仅从数据库读取，而不是从 Apple 服务器获取**。

这会导致以下问题：

1. **数据同步风险** - 用户在 App Store 中修改订阅（升级、降级、取消续订），但您的应用仍然认为订阅有效
2. **无法检测用户操作** - App Store 允许用户随时修改订阅，只有 Apple 才知道真实状态
3. **安全问题** - 容易被欺骗或被恶意利用

## 修复内容

### 1. 新增文件：`lib/apple-iap-verification.ts`

这个文件实现了与 Apple App Store Server API v2 的集成：

- `verifyAppleSubscription()` - 从 Apple 服务器获取真实的订阅信息
- `generateAppleJWT()` - 生成 Apple API 认证 Token
- `decodeAppleToken()` - 解码 Apple 返回的 JWS 数据

**关键特性：**
- 使用 ES256 算法与 Apple 通信
- 获取实时的过期时间和续订状态
- 验证 Bundle ID 和 Product ID 匹配

### 2. 更新：`app/api/payment/ios-iap/confirm/route.ts`

现在的流程：

```
用户点击购买
    ↓
iOS 端调用 IAPManager.swift 与 Apple 通信
    ↓
获得 transactionId 和 productId
    ↓
调用后端 /api/payment/ios-iap/confirm
    ↓
✅ 从 Apple 服务器验证交易有效性和真实过期时间
    ↓
检查用户是否已有其他有效订阅
    ↓
使用 Apple 的真实过期时间更新数据库
    ↓
返回成功，应用端更新用户状态
```

### 3. 更新：`app/api/payment/lib/extend-membership.ts`

- 添加 `appleExpiresDate` 参数来接收 Apple 服务器返回的真实过期时间
- 优先使用 Apple 返回的过期时间，而不是计算的天数
- 添加 `provider` 和 `provider_subscription_id` 字段来追踪支付来源

### 4. 新增环境变量配置

在 `.env.local` 中添加了 Apple IAP 服务器验证所需的配置：

```env
# Apple App Store Connect API Key ID
APPLE_KEY_ID=

# Apple App Store Connect Issuer ID (Team ID)  
APPLE_ISSUER_ID=

# Apple App Store Connect Private Key (ES256 格式)
APPLE_PRIVATE_KEY=

# iOS App Bundle ID
APPLE_BUNDLE_ID=co.median.ios.jbnwrjr
```

## 配置步骤

### Step 1: 获取 Apple App Store Connect API 凭证

1. 打开 [App Store Connect](https://appstoreconnect.apple.com)
2. 进入 **Users & Access** → **API Keys**
3. 点击 **Generate an API Key**
4. 选择 **Admin** 角色
5. 生成后，复制以下信息：
   - **Key ID** → `APPLE_KEY_ID`
   - **Issuer ID** → `APPLE_ISSUER_ID`
6. 下载 **.p8** 文件（只能下载一次）

### Step 2: 获取私钥内容

用文本编辑器打开下载的 `.p8` 文件，复制全部内容到 `APPLE_PRIVATE_KEY`：

```
-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQE...
...
-----END PRIVATE KEY-----
```

### Step 3: 验证 Bundle ID

确认 `APPLE_BUNDLE_ID` 与您在 App Store Connect 中配置的 Bundle ID 一致：

```env
APPLE_BUNDLE_ID=co.median.ios.jbnwrjr
```

## 工作流程

### 发起支付

1. **iOS 端** (IAPManager.swift)
   - 调用 `SKPaymentQueue.default().add(payment)`
   - StoreKit 与 Apple 通信
   - 用户完成支付
   - 返回 `transactionId` 和 `productId`

2. **后端验证** (ios-iap/confirm/route.ts)
   ```typescript
   // Step 1: 从 Apple 服务器验证
   const verificationResult = await verifyAppleSubscription(
     transactionId,
     bundleId,
     productId,
     useProduction
   );
   
   // 获得真实的过期时间
   const appleExpiresDate = verificationResult.expiresDate;
   
   // Step 2: 检查用户是否已有其他订阅
   // Step 3: 使用 Apple 的过期时间更新数据库
   ```

3. **数据库同步** (extend-membership.ts)
   ```typescript
   // 优先使用 Apple 的真实过期时间
   if (appleExpiresDate) {
     newExpiresAt = new Date(appleExpiresDate);
   }
   
   // 保存 provider 和 provider_subscription_id
   await db.collection("subscriptions").update({
     current_period_end: newExpiresAt.toISOString(),
     provider: "apple",
     provider_subscription_id: transactionId,
   });
   ```

## 订阅状态同步

Apple 会在以下事件发送服务器通知：

- ✅ 订阅续期成功
- ❌ 续期失败（需要重试或更新支付方式）
- 🔄 用户升级/降级
- ⏸️ 用户暂停
- ❌ 用户取消续订
- 📧 推送通知需要用户操作

**建议：** 实现 App Store Server Notification API 的 webhook，处理这些事件：

```typescript
// 后续可以创建
POST /api/payment/webhook/apple

// 接收 Apple 的服务器通知
// 更新订阅状态
// 处理续期失败、取消等事件
```

## 检查现有代码

确保 iOS 端 `IAPManager.swift` 中：

1. ✅ 正确处理了 `case .success(let verification)`
2. ✅ 返回了 `transactionId`
3. ✅ 调用了 `await transaction.finish()` 确认购买
4. ✅ 与后端交互时传递了正确的参数

## 测试建议

### 沙箱环境测试

1. 在 App Store Connect 中注册沙箱账户
2. 使用沙箱账户在 iOS 模拟器中测试
3. 后端会自动使用沙箱 Apple API（当 `NODE_ENV !== 'production'`）

### 验证步骤

```bash
# 1. 查看日志
console.log("Verifying subscription with Apple servers", {
  transactionId,
  productId,
});

# 2. 检查返回的过期时间
console.log("Apple subscription verified:", {
  expiresDate: appleExpiresDate,
  autoRenewStatus: appleAutoRenewStatus,
});

# 3. 验证数据库更新
# 检查 subscriptions 表的 provider 和 provider_subscription_id 字段
```

## 潜在问题和解决方案

| 问题 | 原因 | 解决方案 |
|------|------|--------|
| `ENOENT: no such file or directory, open '...'` | `jsonwebtoken` 包未安装 | `npm install jsonwebtoken` |
| `Apple API error: 401` | 凭证错误或已过期 | 重新生成 API Key |
| `Product ID mismatch` | Bundle ID 或 Product ID 不匹配 | 检查 App Store Connect 配置 |
| `Token decode failed` | JWS 格式错误 | 检查 Apple 返回的数据格式 |

## 后续计划

- [ ] 实现 Apple Server Notification API webhook
- [ ] 处理订阅续期失败的通知
- [ ] 添加定期同步机制（每月检查一次真实状态）
- [ ] 实现用户在 App Store 取消订阅时的通知处理

## 相关文档

- [Apple App Store Server API Documentation](https://developer.apple.com/documentation/appstoreserverapi)
- [App Store Server Notifications](https://developer.apple.com/documentation/appstoreservenotifications)
- [Implementing a Server-to-Server Subscription](https://developer.apple.com/documentation/storekit/original_api_for_in_app_purchase/validating_subscriptions_with_the_app_store)
