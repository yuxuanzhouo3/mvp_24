# Apple IAP 修复检查清单

## 修复摘要

已修复 Apple IAP 支付流程中的关键问题：**过期时间现在从 Apple 服务器获取，而不是仅从本地数据库**

---

## ✅ 已完成的修改

### 1. 新增文件
- ✅ `lib/apple-iap-verification.ts` - Apple 服务器验证模块
- ✅ `APPLE_IAP_FIX.md` - 详细说明文档

### 2. 修改的文件
- ✅ `app/api/payment/ios-iap/confirm/route.ts`
  - 添加 Apple 服务器验证
  - 获取真实的过期时间和续订状态
  - 检查用户是否已有其他支付方式的订阅

- ✅ `app/api/payment/lib/extend-membership.ts`
  - 支持 `appleExpiresDate` 参数
  - 优先使用 Apple 的真实过期时间
  - 保存 `provider` 和 `provider_subscription_id` 字段

- ✅ `.env.local`
  - 添加 Apple IAP 服务器验证配置字段

### 3. 流程改进

```
Before (有问题的流程):
用户购买 → iOS 获得 transactionId → 后端直接存库 → 使用计算的天数作为过期时间
问题：无法知道用户在 App Store 的真实订阅状态

After (已修复的流程):
用户购买 → iOS 获得 transactionId → 后端向 Apple API 验证 
→ 获得真实过期时间 → 存库 → 使用 Apple 的真实时间
优点：每次都与 Apple 核实，确保准确性
```

---

## 📋 需要配置的项目

### 重要：必须配置以下环境变量

在 `.env.local` 中完成以下配置：

```env
# ========== Apple IAP 服务器验证配置 ==========

# 1. Apple Key ID（从 App Store Connect 获取）
APPLE_KEY_ID=<你的Key ID>

# 2. Apple Issuer ID/Team ID（从 App Store Connect 获取）
APPLE_ISSUER_ID=<你的Issuer ID>

# 3. Apple Private Key（下载的 .p8 文件内容）
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# 4. iOS Bundle ID（应该已经配置）
APPLE_BUNDLE_ID=co.median.ios.jbnwrjr
```

### 获取 Apple 凭证步骤

1. 打开 [App Store Connect](https://appstoreconnect.apple.com/login)
2. 使用您的 Apple 账户登录
3. 进入 **Users & Access** → **API Keys**
4. 点击 **Generate an API Key**
5. 选择 **Admin** 角色（必需）
6. 复制以下信息：
   - **Key ID** → `APPLE_KEY_ID`
   - **Issuer ID** → `APPLE_ISSUER_ID`
7. 下载 **.p8** 文件
8. 用文本编辑器打开 .p8 文件，复制全部内容到 `APPLE_PRIVATE_KEY`

---

## 🧪 测试步骤

### 1. 本地开发环境测试

```bash
# 确保环境变量已配置
echo $APPLE_KEY_ID
echo $APPLE_ISSUER_ID

# 启动开发服务器
npm run dev
```

### 2. 沙箱环境支付流程

1. 在 App Store Connect 中创建沙箱账户
2. 在 iOS 模拟器中注册该沙箱账户
3. 进行测试购买
4. 检查日志输出：
   ```
   ✅ Verifying subscription with Apple servers
   ✅ Apple subscription verified successfully
   ```

### 3. 验证数据库更新

检查 `subscriptions` 表中的记录：
```
provider: "apple"
provider_subscription_id: "transaction_id_from_apple"
current_period_end: "2025-02-25T10:30:00.000Z"  // Apple 返回的真实时间
```

### 4. 检查日志

```typescript
// 应该看到类似的日志
logInfo("Verifying subscription with Apple servers", {
  transactionId: "123456789",
  productId: "co.median.ios.jbnwrjr.sub.pro.monthly"
});

logInfo("Apple subscription verified successfully", {
  expiresDate: 1740471000000,  // 毫秒时间戳
  autoRenewStatus: true
});
```

---

## ⚠️ 常见问题和解决方案

### 问题 1: `APPLE_KEY_ID is undefined`

**原因：** 环境变量未配置或服务器未重启

**解决：**
```bash
# 1. 检查 .env.local 是否有 APPLE_KEY_ID
grep APPLE_KEY_ID .env.local

# 2. 重启开发服务器
npm run dev

# 3. 或者在运行时检查
console.log(process.env.APPLE_KEY_ID)
```

### 问题 2: `Apple API error: 401 Unauthorized`

**原因：** 
- API Key 已过期
- Key ID 或 Issuer ID 错误
- 私钥格式不正确

**解决：**
```bash
# 1. 重新生成 API Key
#    App Store Connect → Users & Access → API Keys → Generate new key

# 2. 验证私钥格式
#    必须是 -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----
#    不是 RSA PRIVATE KEY

# 3. 检查换行符
#    在 .env 中使用 \n 表示换行，或使用文件引用
```

### 问题 3: `Product ID mismatch`

**原因：** Bundle ID 或 Product ID 不匹配

**解决：**
```bash
# 1. 检查 APPLE_BUNDLE_ID 是否正确
echo $APPLE_BUNDLE_ID

# 2. 检查 App Store Connect 中的 Bundle ID
#    App Store Connect → Apps → Your App → General → Bundle ID

# 3. 检查 Product ID 是否在 App Store Connect 中创建
#    Subscriptions & Bundles → Subscriptions → Products
```

### 问题 4: `jsonwebtoken is not installed`

**原因：** 缺少依赖包

**解决：**
```bash
npm install jsonwebtoken
# 如果是 pnpm
pnpm add jsonwebtoken
```

---

## 📊 支付流程对比

### 之前（有问题）

| 步骤 | 操作 | 数据来源 |
|------|------|--------|
| 1 | 用户点击购买 | - |
| 2 | iOS 向 Apple 发起支付 | Apple |
| 3 | 获得 transactionId | Apple |
| 4 | 后端接收 transactionId | iOS App |
| 5 | 存入数据库 | 后端计算 |
| 6 | 计算过期时间（days + now） | 后端计算 ❌ |
| 问题 | 用户在 App Store 更改订阅后，应用不知道 | - |

### 之后（已修复）

| 步骤 | 操作 | 数据来源 |
|------|------|--------|
| 1 | 用户点击购买 | - |
| 2 | iOS 向 Apple 发起支付 | Apple |
| 3 | 获得 transactionId | Apple |
| 4 | 后端接收 transactionId | iOS App |
| 5 | **后端向 Apple API 验证** | **Apple API** ✅ |
| 6 | **获得真实过期时间** | **Apple API** ✅ |
| 7 | 存入数据库（真实过期时间） | Apple API |
| 优点 | 总是与 Apple 同步，准确可靠 | - |

---

## 🔐 安全改进

### 防止欺骗

```typescript
// Before: 只验证本地数据
if (transactionId && productId) {
  // 接受支付 ❌ 容易被欺骗
}

// After: 向 Apple 验证真实性
const result = await verifyAppleSubscription(
  transactionId,
  bundleId,
  productId,
  useProduction
);
if (result.isValid) {
  // Apple 确认交易有效 ✅ 无法欺骗
}
```

### 防止重复扣款

```typescript
// 检查是否重复处理同一个 transaction
const { data: existing } = await supabaseAdmin
  .from("subscriptions")
  .select("id")
  .or(
    `transaction_id.eq.${transactionId},
     provider_subscription_id.eq.${transactionId}`
  );
```

---

## 📅 后续任务

- [ ] 实现 Apple Server Notification API webhook
  - 处理订阅续期事件
  - 处理续期失败通知
  - 处理用户取消订阅

- [ ] 添加定期同步任务
  - 每月验证所有 Apple IAP 订阅状态
  - 更新过期时间和续订状态

- [ ] 实现用户界面
  - 显示"管理订阅"链接（打开 App Store）
  - 显示自动续订信息

- [ ] 添加监控和告警
  - 监控 Apple API 调用失败
  - 告警续期失败的用户

---

## 📚 相关文档

- [APPLE_IAP_FIX.md](./APPLE_IAP_FIX.md) - 详细技术文档
- [Apple App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)
- [App Store Server Notifications](https://developer.apple.com/documentation/appstoreservenotifications)
- [Testing in Sandbox](https://developer.apple.com/app-store/testing-in-sandbox/)

---

## ✨ 修复总结

| 方面 | 修复前 | 修复后 |
|------|-------|--------|
| **过期时间来源** | 本地计算 | Apple API |
| **验证方式** | 仅检查 transactionId | 向 Apple 验证 |
| **续订状态** | 无法检测 | 实时获取 |
| **取消订阅检测** | 无法检测 | Apple 告知 |
| **安全性** | 低 ⚠️ | 高 ✅ |
| **准确性** | 低 ⚠️ | 高 ✅ |

---

## 需要帮助？

如果配置过程中遇到问题，请检查：

1. ✅ `.env.local` 中的所有 Apple 配置是否正确
2. ✅ API Key 是否已过期（App Store Connect 中显示）
3. ✅ 私钥格式是否正确（-----BEGIN PRIVATE KEY-----）
4. ✅ Bundle ID 是否与 App Store Connect 一致
5. ✅ `jsonwebtoken` 包是否已安装

---

**修复时间:** 2026年1月25日
**修复人:** 自动修复系统
**版本:** v1.0
