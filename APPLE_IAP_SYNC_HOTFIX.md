# 🔧 Apple IAP 过期时间同步问题已修复 (v1.2)

## 问题

```
Apple 过期: 5分钟 ⏰
数据库: 30天 ❌
前端: 30天 ❌
同步性: 0% ❌
```

## 原因

代码在添加 30 天的时候，**完全忽略了 Apple 返回的真实过期时间**（5分钟）。

## 修复内容

### 关键改动

1. **Apple 验证失败时：直接拒绝**（不再降级处理）
2. **Apple 验证成功时：只使用 Apple 的时间**（不再加 30 天）

### 修改的代码

```typescript
// ✅ 修复前：使用本地计算
newExpiresAt = new Date();
newExpiresAt.setDate(newExpiresAt.getDate() + 30); // ❌ 加 30 天

// ✅ 修复后：使用 Apple 返回的时间
newExpiresAt = new Date(appleExpiresDate); // ✅ 只用 Apple 的时间
```

## 现在的行为

```
用户购买
   ↓
Apple 返回: 5分钟过期
   ↓
后端验证成功 ✅
   ↓
数据库保存: 5分钟 ✅
   ↓
前端显示: 5分钟 ✅
   ↓
完全同步！✅
```

## 必须做的事

### 1. 配置 Apple API 凭证（否则验证会失败）

```env
# .env.local
APPLE_KEY_ID=<从 App Store Connect 获取>
APPLE_ISSUER_ID=<从 App Store Connect 获取>
APPLE_PRIVATE_KEY=<.p8 文件内容>
```

### 2. 安装依赖

```bash
npm install jsonwebtoken
```

### 3. 重启服务器

```bash
npm run dev
```

## 测试

```bash
1. 在 iOS 模拟器中购买（沙箱环境）
2. 查看日志看到: "Apple subscription verified successfully"
3. 查看响应: "expiresAt": "5分钟"
4. 检查数据库: current_period_end = 5分钟
```

## 关键区别

| 方面 | 修复前 ❌ | 修复后 ✅ |
|------|---------|---------|
| 数据来源 | 本地计算 | Apple API |
| Apple 5分钟 | 被忽略 | 被使用 |
| 数据库 | 30 天 | 5分钟 |
| 前端显示 | 30 天 | 5分钟 |
| 同步性 | 0% | 100% |

## 严格模式

现在采用 **strict mode**：
- ✅ Apple 验证成功 → 使用 Apple 时间
- ❌ Apple 验证失败 → 拒绝支付（需要配置 API 凭证）

不再有降级方案（因为这会导致数据不同步）。

## 文档

- 📄 [详细说明](./APPLE_IAP_SYNC_FIX.md)
- 📄 [完整技术文档](./APPLE_IAP_FIX.md)
- 📄 [配置检查清单](./APPLE_IAP_CHECKLIST.md)

---

**修复完成！✅ 现在过期时间会与 Apple 完全同步。**
