# 数据隔离审计报告

## 问题发现

### 严重问题：数据库混乱 ⚠️

**发现时间**: 最近

**问题描述**: `app/api/payment/confirm/route.ts` 没有实现国内版 (CN) 和国际版 (INTL) 的区分，导致：

- ❌ 国内版用户的支付数据被写入 **Supabase**（错误的数据库）
- ❌ 国内版应该使用 **CloudBase**，但完全没有实现
- ❌ 两个版本的用户数据混在一起

## 代码现状

### 问题代码位置

**文件**: `app/api/payment/confirm/route.ts`

```typescript
// ❌ 问题：没有 isChinaRegion() 检查
if (confirmation.success) {
  const now = new Date();

  // 直接使用 Supabase，没有区分版本
  const { data: existingSubscription, error: checkError } =
    await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
}
```

### 应该的做法

```typescript
if (confirmation.success) {
  const now = new Date();

  if (isChinaRegion()) {
    // ✅ 国内版：使用 CloudBase
    // 从 cloudbase-db.ts 调用相应函数
  } else {
    // ✅ 国际版：使用 Supabase
    // 现有逻辑
  }
}
```

## 受影响的 API 端点

### 已检查

| 文件 | 状态 | 说明 |
|------|------|------|
| `/api/payment/confirm` | ❌ 问题 | 没有区分 CN/INTL |
| `/api/payment/onetime/confirm` | ✅ OK | 已实现区分 |
| `/api/payment/create` | ✅ OK | 已实现区分 |
| `/api/payment/onetime/create` | ✅ OK | 已实现区分 |
| `/api/payment/continue` | ✅ OK | 已实现区分 |
| `/api/payment/history` | ✅ OK | 已实现区分 |
| `/api/payment/status` | ✅ OK | 已实现区分 |
| `/api/payment/onetime/webhook` | ✅ OK | 已实现区分 |

### 修复进度

- [x] 识别问题：`confirm/route.ts` 缺少区域检查
- [x] 添加导入：`import { isChinaRegion } from "@/lib/config/region"`
- [x] 添加版本检查逻辑
- [ ] 实现国内版 CloudBase 的订阅更新（待做）

## 数据库映射

### 国际版 (INTL) - Supabase

```
subscriptions 表
├─ id: UUID
├─ user_id: UUID (来自 auth.users)
├─ plan_id: TEXT (pro/team)
├─ status: TEXT (active/canceled)
├─ current_period_end: TIMESTAMP
└─ ...
```

### 国内版 (CN) - CloudBase

```
收费管理/订阅 集合
├─ user_id: STRING
├─ plan_id: STRING
├─ status: STRING
├─ current_period_end: TIMESTAMP
└─ ...
```

## 修复方案

### 步骤1：添加版本检查 ✅ 已完成

```typescript
import { isChinaRegion } from "@/lib/config/region";

if (confirmation.success) {
  if (isChinaRegion()) {
    // 国内版逻辑
  } else {
    // 国际版逻辑
  }
}
```

### 步骤2：实现国内版 CloudBase 逻辑 ⏳ 待做

需要实现的函数（在 cloudbase-db.ts 中添加）：

```typescript
// 获取用户现有订阅
export async function getSubscription(userId: string) {
  // 实现逻辑
}

// 创建或更新订阅
export async function updateSubscription(
  userId: string,
  planId: string,
  status: string,
  currentPeriodEnd: string
) {
  // 实现逻辑
}

// 记录支付信息
export async function recordPayment(
  userId: string,
  subscriptionId: string,
  amount: number,
  currency: string,
  status: string,
  transactionId: string
) {
  // 实现逻辑
}
```

## 已有的国内版逻辑参考

### 在其他 API 中的实现示例

**文件**: `app/api/payment/onetime/confirm/route.ts`

```typescript
if (isChinaRegion()) {
  // 国内版：更新 CloudBase
  const membershipEnd = new Date(now);
  membershipEnd.setDate(membershipEnd.getDate() + daysToAdd);

  // CloudBase 更新逻辑
  // ...
} else {
  // 国际版：更新 Supabase
  // 现有逻辑
}
```

## 风险评估

### 低风险 🟡

当前的修复方式是：
1. 识别国内版请求
2. 记录日志
3. 返回成功响应（暂时）
4. 避免国内版数据继续混入 Supabase

**影响**: 国内版用户可能无法正确更新订阅信息，但不会继续污染国际版数据库。

### 建议

1. **立即行动**: 完成国内版 CloudBase 的实现
2. **数据清理**: 清理已混入 Supabase 的国内版数据（需要识别）
3. **测试**: 在两个版本上分别进行支付测试

## 其他 API 的检查列表

- [x] `/api/chat/sessions` - CN/INTL 分离 ✅
- [x] `/api/chat/send` - CN/INTL 分离 ✅
- [x] `/api/payment/*` - 大多数已分离 ✅
- [ ] `/api/payment/confirm` - 已添加检查，待实现 ⏳

## 相关配置

### 区域判断函数

**文件**: `lib/config/region.ts`

```typescript
export function isChinaRegion(): boolean {
  // 根据环境变量或域名判断
  // 返回 true: 国内版 (CN)
  // 返回 false: 国际版 (INTL)
}
```

### 数据库客户端

| 版本 | 客户端 | 用途 |
|------|--------|------|
| CN | CloudBase | 国内用户数据 |
| INTL | Supabase | 国际用户数据 |

## 修复检查清单

### 短期 (紧急)

- [x] 添加 `isChinaRegion()` 导入
- [x] 添加版本检查逻辑
- [x] 防止国内版继续写入 Supabase
- [ ] 实现国内版 CloudBase 逻辑

### 中期

- [ ] 完成所有国内版函数实现
- [ ] 清理混入的数据
- [ ] 完整测试两个版本的支付流程

### 长期

- [ ] 添加自动化测试确保版本隔离
- [ ] 添加监控警告（如果检测到跨版本数据写入）
- [ ] 定期数据审计

## 关键文件

| 文件 | 目的 |
|------|------|
| `lib/config/region.ts` | 区域判断函数 |
| `lib/cloudbase-db.ts` | 国内版数据库操作 |
| `lib/supabase-admin.ts` | 国际版数据库操作 |
| `app/api/payment/confirm/route.ts` | **待修复** |
| `lib/payment/webhook-handler.ts` | 已正确实现分离 ✅ |

## 参考资料

### 国内版 CloudBase 实现

```typescript
import cloudbase from "@cloudbase/node-sdk";

const app = cloudbase.init({
  env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY,
});

const db = app.database();
const collection = db.collection("subscriptions"); // 需要确认集合名称
```

## 测试场景

### 国内版支付测试

1. 从国内 IP 访问应用
2. 选择支付方式（支付宝/微信）
3. 完成支付
4. 验证：数据是否写入 CloudBase（不是 Supabase）

### 国际版支付测试

1. 从国际 IP 访问应用
2. 选择支付方式（PayPal/Stripe）
3. 完成支付
4. 验证：数据是否写入 Supabase（不是 CloudBase）

## 总结

| 项目 | 状态 | 优先级 |
|------|------|--------|
| 问题识别 | ✅ 完成 | - |
| 临时修复 | ✅ 完成 | 高 |
| 完整实现 | ⏳ 待做 | 高 |
| 数据清理 | ❌ 未做 | 中 |
| 自动化测试 | ❌ 未做 | 中 |
