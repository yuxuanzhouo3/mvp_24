# 🚀 Apple IAP 新架构快速参考

## 核心思想（一句话）
**Apple 控制订阅状态，前端动态查询，后端只是记录员。**

## 三个关键端点

### 1️⃣ 支付确认 → 只记录
```bash
POST /api/payment/ios-iap/confirm
```
**做什么**：记录 Apple 的 transactionId（不计算过期时间）  
**响应**：{ success, transactionId, verificationStatus }  
**数据库存储**：provider_subscription_id = transactionId

### 2️⃣ 查询状态 → 动态获取
```bash
GET /api/payment/ios-iap/status
```
**做什么**：用 transactionId 去 Apple 查询真实过期时间  
**响应**：{ expiresAt, daysLeft, isExpired, source }  
**source 值**：
- `"apple"` = 实时数据 ✅
- `"cached"` = Apple 不可用，用备份 ⚠️

### 3️⃣ Apple 验证 → 工具函数
```typescript
verifyAppleSubscription(transactionId, bundleId, productId, isProduction)
```
**返回**：{ isValid, expiresDate, autoRenewStatus, errorMessage }

---

## iOS 前端集成

### 旧方式 ❌
```swift
// 直接读数据库
let expiresAt = user.subscription?.current_period_end
```

### 新方式 ✅
```swift
// 查询后端，后端查 Apple
let response = await fetch("/api/payment/ios-iap/status")
let expiresAt = response.expiresAt  // Apple 的真实时间
```

---

## 必需的环境变量

```env
APPLE_KEY_ID=<从 App Store Connect 获取>
APPLE_ISSUER_ID=<从 App Store Connect 获取>
APPLE_PRIVATE_KEY=<.p8 文件内容>
APPLE_BUNDLE_ID=co.median.ios.jbnwrjr
```

---

## 测试清单

- [ ] 配置 Apple 凭证到 .env.local
- [ ] iOS App 在沙箱购买（返回 5 分钟过期）
- [ ] 调用 POST /confirm，验证返回 success
- [ ] 调用 GET /status，验证返回 5 分钟
- [ ] 等待 5 分钟，再次 GET /status，验证显示 expired
- [ ] 检查日志，source 应该是 "apple"

---

## 关键改变

| 项目 | 旧 | 新 |
|------|----|----|
| 存储过期时间 | ✅ 保存 current_period_end | ❌ 不保存 |
| 过期时间来源 | DB（可能过期） | Apple（实时） |
| 支付时延 | 需要 Apple 验证成功 | 允许先记录，Apple API 可选 |
| 数据同步问题 | ❌ 存在（Apple 改，DB 没改） | ✅ 不存在（动态查询） |
| 用户在 App Store 改设置 | ❌ 需要等待同步 | ✅ 立即生效 |

---

## 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| GET /status 返回 cached | Apple API 不可用 | 检查 APPLE_KEY_ID、APPLE_ISSUER_ID 配置 |
| POST /confirm 返回 400 | transactionId 无效 | 确认 iOS 发送的是真实交易 ID |
| 前端显示错误的过期时间 | 仍在读 DB 的 current_period_end | 更新前端调用 GET /status |
| source 永远是 "cached" | Apple 验证模块有问题 | 检查 APPLE_BUNDLE_ID、JWT 生成 |

---

## 重要：删除旧逻辑

❌ 删除这些不再需要的代码：

```typescript
// 不要再调用 extendMembership
await extendMembership(userId, days, transactionId, appleExpiresDate)

// 不要再存储 current_period_end
{ current_period_end: new Date(appleExpiresDate) }

// 不要再计算本地过期时间
const expiresAt = new Date()
expiresAt.setDate(expiresAt.getDate() + 30)  // ❌ 这样做了！
```

✅ 只做这个：

```typescript
// 存储 transactionId（Apple 的凭证）
{ provider_subscription_id: transactionId }

// 让 Apple 控制过期时间
// 前端显示时调用 GET /status
```

---

## 监控关键指标

```bash
# 1. Apple 查询成功率应该 > 95%
grep "source.*apple" logs | wc -l

# 2. 如果 cached 占比高，说明 Apple API 有问题
grep "source.*cached" logs | wc -l

# 3. 验证失败追踪
grep "verificationStatus.*pending" logs
```

---

**图示：为什么新架构更好**

```
旧：前 → 后 → 数据库
    App   支付记录 & 算出期限
    ↓
    前 显示的时间
    ↓
    问题：Apple 改了，DB 没变
    结果：前端显示错误 ❌

新：前 → 后 ↔ Apple
    App   记录  查询
    ↓
    后 返回 Apple 的真实时间
    ↓
    前 显示的时间
    ↓
    结果：永远同步 ✅
```

---

**发布日期**：2025-02-18  
**所有者**：GitHub Copilot  
**状态**：即将上线
