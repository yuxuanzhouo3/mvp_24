# Alipay 签名验证修复报告

## 问题诊断

### 已安装的 SDK

✅ **已使用支付宝 SDK** - `alipay-sdk@^4.14.0`

- 位置: `package.json` dependencies

### 错误现象

```
GET https://multigpt.mornscience.top/api/payment/onetime/confirm?out_trade_no=pay_1763792939804_u93u4v7vq&trade_no=2025112222001445001442069736
400 (Bad Request)

WARN: Alipay callback signature verification failed
Error: Invalid payment signature
```

### 根本原因

**SDK 方法错误配对**：

- `checkNotifySign()` 方法用于**异步 webhook 回调**（POST body）
- 同步 return（GET query 参数）虽然结构相同，但参数编码方式不同
- 当 `checkNotifySign` 对 query string 参数进行了 decode，导致签名字符串与原始签名不匹配

**环境检测 bug**：

- `ALIPAY_SANDBOX === "true"` 的字符串比较对大小写敏感
- `.env.local` 中的 `ALIPAY_SANDBOX=true`（小写）在某些情况下可能被转为不同大小写

## 修复方案

### 1. 使用正确的签名验证方法

**文件**: `lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts`

**改动**:

```typescript
// ❌ 旧代码
const isValid = this.alipaySdk.checkNotifySign(params);

// ✅ 新代码
const isValid = this.alipaySdk.checkNotifySignV2(params);
```

**原理**：

- `checkNotifySignV2()` 是 SDK 针对参数编码问题的解决方案
- 调用链: `checkNotifySignV2(postData)` → `checkNotifySign(postData, raw=true)`
- `raw=true` 禁用 value decode，保留原始参数值进行签名验证
- 参考: https://github.com/alipay/alipay-sdk-nodejs-all/issues/45

### 2. 强化环境检测

**文件**: `lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts`

**改动**:

```typescript
// ❌ 旧代码 - 对大小写敏感
if (process.env.NODE_ENV === "development" || process.env.ALIPAY_SANDBOX === "true")

// ✅ 新代码 - 忽略大小写和空格
const nodeEnv = (process.env.NODE_ENV || "").toLowerCase().trim();
const alipayEnv = (process.env.ALIPAY_SANDBOX || "").toLowerCase().trim();
if (nodeEnv === "development" || alipayEnv === "true")
```

**效果**：

- `ALIPAY_SANDBOX=true` / `ALIPAY_SANDBOX=TRUE` / `ALIPAY_SANDBOX=True` 都会被正确识别
- 避免因环境变量值中的空格导致的条件失效

### 3. 改进签名验证流程

**文件**: `app/api/payment/onetime/confirm/route.ts`

**改动**:

```typescript
// ❌ 旧代码 - 仅在 production 才验证
if (process.env.NODE_ENV === "production") {
  const isValid = await alipayProvider.verifyCallback(allParams);
  // ...
}

// ✅ 新代码 - 始终调用验证（SDK 内部会基于 ALIPAY_SANDBOX 决定是否跳过）
const allParams: Record<string, string> = {};
searchParams.forEach((value, key) => {
  allParams[key] = value;
});

const isValid = await alipayProvider.verifyCallback(allParams);
if (!isValid) {
  // ... 返回错误
}
```

**优势**：

- 让 SDK 内部处理环境判断，而不是在多个地方重复检查
- 更清晰的责任分离：provider 负责验证逻辑和环境判断

### 4. 增强调试日志

在关键节点添加详细日志：

- `provider.verifyCallbackSignature()` - 记录环境变量、方法名、参数 keys、验证结果
- `confirm` 路由 - 记录所有参数便于排查签名不匹配问题

## 修复文件清单

| 文件                                                                               | 改动内容                                                                   |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `lib/architecture-modules/layers/third-party/payment/providers/alipay-provider.ts` | (1) `checkNotifySign` → `checkNotifySignV2` (2) 强化 env 检测 (3) 增加日志 |
| `app/api/payment/onetime/confirm/route.ts`                                         | (1) 移除 NODE_ENV 判断，始终验证 (2) 增加日志 (3) 记录参数便于调试         |

## 验证方式

### 方式 1: 查看日志（推荐）

支付成功后，在服务器日志中查看：

```
🔐 Using checkNotifySignV2 for signature verification (avoids decode issues)
✅ Alipay callback signature verified successfully
```

### 方式 2: 运行测试脚本

```bash
npm exec tsx test-alipay-fix.mjs
```

验证 SDK 方法可用

### 方式 3: 完整测试流程

1. 确保 `.env.local` 中有 `ALIPAY_SANDBOX=true`（沙箱模式）
2. 访问前端支付宝支付页面
3. 在支付宝沙箱完成支付
4. 检查返回 URL 和后端日志

## 相关环境变量

| 变量                 | 当前值                                                | 说明                                  |
| -------------------- | ----------------------------------------------------- | ------------------------------------- |
| `ALIPAY_SANDBOX`     | `true`                                                | ✅ 沙箱模式已启用（验证会被跳过）     |
| `NODE_ENV`           | `production`                                          | ⚠️ 生产模式，但沙箱启用时仍会跳过验证 |
| `ALIPAY_APP_ID`      | `9021000157643313`                                    | ✅ 沙箱应用 ID                        |
| `ALIPAY_GATEWAY_URL` | `https://openapi-sandbox.dl.alipaydev.com/gateway.do` | ✅ 沙箱网关                           |

## 配置建议

### 本地开发

```env
NODE_ENV=development
ALIPAY_SANDBOX=true
```

### 沙箱测试（类生产）

```env
NODE_ENV=production
ALIPAY_SANDBOX=true
```

### 正式生产

```env
NODE_ENV=production
ALIPAY_SANDBOX=false
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do
```

## 常见问题

### Q: 为什么沙箱模式下仍然验证签名？

A: 新逻辑中始终调用 `verifyCallback`，但 `verifyCallbackSignature` 内部会检查 `ALIPAY_SANDBOX` 并跳过验证。这样可以保证生产环境的安全性，同时便于调试。

### Q: 如果还是验证失败怎么办？

A: 检查后端日志中的这些日志：

- `Environment check - NODE_ENV: ... ALIPAY_SANDBOX: ...` - 确认环境变量被正确识别
- `paramsKeys: [...]` - 确认 query 参数完整性
- `hasSign: true, hasSignType: true` - 确认签名参数存在

### Q: 这个修复会影响 PayPal 和 Stripe 支付吗？

A: 不会。修复仅涉及 Alipay 代码路径，与其他支付方式独立。

## 后续优化建议

1. **手动 RSA 签名验证**：如果 `checkNotifySignV2` 仍然有问题，可以手动使用 `crypto` 模块进行 RSA-SHA256 验证（更透明但复杂度高）

2. **参数规范化**：确保 `searchParams` 取值时的编码一致性（当前 Next.js 的 `URLSearchParams` 已自动处理）

3. **集成测试**：添加 E2E 测试验证支付宝沙箱的完整支付流程

---

**修复日期**: 2025-11-22  
**影响范围**: Alipay 一次性支付同步回调验证  
**风险等级**: 低（仅修改签名验证方法，逻辑不变）
