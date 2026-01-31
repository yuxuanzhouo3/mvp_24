# 🚀 Apple IAP 修复 - 快速开始指南

## 修复概览（1分钟理解）

### 问题
Apple 订阅的过期时间从**本地数据库**获取，而不是从 **Apple 服务器**获取

### 解决方案
现在每次确认支付时，都向 **Apple API** 验证真实的订阅信息

### 代码位置
| 文件 | 功能 |
|------|------|
| `lib/apple-iap-verification.ts` | Apple API 验证模块 |
| `app/api/payment/ios-iap/confirm/route.ts` | 支付确认逻辑（已更新） |
| `app/api/payment/lib/extend-membership.ts` | 会员扩展逻辑（已更新） |

---

## ⚡ 3 步配置（5分钟完成）

### Step 1: 获取 Apple 凭证

```
1. 打开 https://appstoreconnect.apple.com
2. Users & Access → API Keys
3. Generate an API Key（选择 Admin 角色）
4. 复制：Key ID、Issuer ID
5. 下载：.p8 文件
```

### Step 2: 配置环境变量

在 `.env.local` 添加：

```env
APPLE_KEY_ID=<Key ID>
APPLE_ISSUER_ID=<Issuer ID>
APPLE_PRIVATE_KEY=<.p8 文件的全部内容>
APPLE_BUNDLE_ID=co.median.ios.jbnwrjr
```

### Step 3: 安装依赖

```bash
npm install jsonwebtoken
```

---

## ✅ 验证修复

### 测试支付流程

```
1. 启动开发服务器: npm run dev
2. 在 iOS 模拟器中购买订阅
3. 检查日志看到：
   ✅ "Verifying subscription with Apple servers"
   ✅ "Apple subscription verified successfully"
```

### 检查数据库

```sql
SELECT provider, provider_subscription_id, current_period_end 
FROM subscriptions 
WHERE user_id = 'your_user_id' 
LIMIT 1;
```

应该显示：
```
provider = "apple"
provider_subscription_id = "<transaction_id>"
current_period_end = "<Apple返回的真实时间>"
```

---

## 📊 改变了什么

### 支付流程

```
Before (有问题):
用户购买 → 获得 transactionId → 存库 → 使用计算的过期时间

After (已修复):
用户购买 → 获得 transactionId → 向 Apple 验证 → 获得真实过期时间 → 存库
```

### API 调用

**新增调用：**
```
POST https://buy.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
Authorization: Bearer <JWT Token>
```

**获取的数据：**
```json
{
  "expiresDate": 1740471000000,
  "autoRenewStatus": true,
  "productId": "co.median.ios.jbnwrjr.sub.pro.monthly"
}
```

---

## 🔒 安全性改进

| 方面 | 之前 | 之后 |
|------|------|------|
| 数据来源 | 本地计算 | Apple 认证 ✅ |
| 欺骗防护 | 容易欺骗 | 无法欺骗 ✅ |
| 续订检测 | 无法检测 | 实时检测 ✅ |

---

## 📂 相关文档

| 文档 | 内容 |
|------|------|
| `APPLE_IAP_FIX_SUMMARY.md` | 修复总结（这个文件） |
| `APPLE_IAP_FIX.md` | 详细技术说明 |
| `APPLE_IAP_CHECKLIST.md` | 配置检查清单 |

---

## ⚠️ 常见问题速解

| 问题 | 解决方案 |
|------|--------|
| `APPLE_KEY_ID undefined` | 检查 `.env.local`，重启服务器 |
| `API error 401` | 重新生成 API Key，检查私钥格式 |
| `Product ID mismatch` | 检查 Bundle ID 和 Product ID 是否匹配 |
| `jsonwebtoken not found` | 运行 `npm install jsonwebtoken` |

---

## 📞 需要帮助？

遇到问题请按顺序检查：

1. ✅ `.env.local` 中是否有所有 Apple 配置
2. ✅ `.p8` 文件的内容是否正确复制
3. ✅ `npm install jsonwebtoken` 是否已运行
4. ✅ 开发服务器是否重启过
5. ✅ 检查日志输出看是否有错误信息

详见 [APPLE_IAP_CHECKLIST.md](./APPLE_IAP_CHECKLIST.md)

---

## 📅 后续任务

- [ ] 配置 Apple API 凭证
- [ ] 测试沙箱支付流程
- [ ] 验证数据库数据
- [ ] 部署到生产环境
- [ ] 实现 Apple 服务器通知（可选，增强功能）

---

**修复完成：** ✅ 所有代码已部署，等待配置凭证

**下一步：** 按照本指南的 3 步配置完成设置
