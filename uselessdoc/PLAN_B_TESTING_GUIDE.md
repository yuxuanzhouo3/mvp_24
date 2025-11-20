# Plan B 集成测试指南

快速验证方案 B 实现是否正确工作。

---

## 🚀 前置准备

### 环境变量检查

确保在 `.env.local` 中配置：

```env
# CloudBase 配置
NEXT_PUBLIC_WECHAT_CLOUDBASE_ID=your_cloudbase_id
CLOUDBASE_SECRET_ID=your_secret_id
CLOUDBASE_SECRET_KEY=your_secret_key

# JWT 配置
JWT_SECRET=your-jwt-secret-key-change-me

# 部署区域
NEXT_PUBLIC_DEPLOY_REGION=CN
```

### 数据库准备

确保 CloudBase 中存在以下集合：

- `web_users` - 用户表
- `refresh_tokens` - 新增 refresh token 表（自动创建）

---

## 🧪 测试用例

### 测试 1: 登录并获取 Tokens

**测试目标**: 验证登录返回正确格式的 accessToken + refreshToken

**步骤**:

```bash
# 1. 使用 curl 登录
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "email": "test@example.com",
    "password": "password123"
  }'
```

**预期响应** (200):

```json
{
  "success": true,
  "user": {
    "id": "user_id_xxx",
    "email": "test@example.com",
    "name": "test"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**检查清单**:

- ✅ `accessToken` 包含有效 JWT
- ✅ `refreshToken` 包含有效 JWT
- ✅ `tokenMeta.accessTokenExpiresIn` = 3600
- ✅ `tokenMeta.refreshTokenExpiresIn` = 604800
- ✅ 保存这两个 token 用于后续测试

---

### 测试 2: 使用 AccessToken 调用 API

**测试目标**: 验证 accessToken 可成功通过认证

**步骤**:

```bash
# 替换为上一步获取的 accessToken
ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 调用需要认证的 API
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**预期响应** (200):

```json
{
  "success": true,
  "user": {
    "id": "user_id_xxx",
    "email": "test@example.com",
    ...
  }
}
```

**检查清单**:

- ✅ 返回 200 (不是 401)
- ✅ 返回用户数据
- ✅ 日志中看到 `[/api/profile] 验证成功`

---

### 测试 3: 无效 Token 返回 401

**测试目标**: 验证无效 token 被正确拒绝

**步骤**:

```bash
# 使用无效 token
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer invalid_token_xxx"
```

**预期响应** (401):

```json
{
  "error": "Unauthorized"
}
```

**检查清单**:

- ✅ 返回 401
- ✅ 不返回用户数据

---

### 测试 4: 刷新 Token

**测试目标**: 验证 refresh token 可生成新 accessToken

**步骤**:

```bash
# 替换为登录时获取的 refreshToken
REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 调用刷新端点
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }"
```

**预期响应** (200):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id_xxx",
    "email": "test@example.com",
    ...
  },
  "tokenMeta": {
    "accessTokenExpiresIn": 3600,
    "refreshTokenExpiresIn": 604800
  }
}
```

**检查清单**:

- ✅ 返回 200
- ✅ 返回新的 accessToken
- ✅ 返回新的 refreshToken (token 轮转)
- ✅ 新 tokens 与旧 tokens 不同
- ✅ 日志中看到 `[/api/auth/refresh] Refresh token 验证成功`

---

### 测试 5: 使用新 AccessToken

**测试目标**: 验证新 accessToken 可成功使用

**步骤**:

```bash
# 使用测试 4 中获取的新 accessToken
NEW_ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN"
```

**预期响应** (200):

```json
{
  "success": true,
  "user": { ... }
}
```

**检查清单**:

- ✅ 返回 200
- ✅ 用户数据一致

---

### 测试 6: 登出并撤销所有 Tokens

**测试目标**: 验证登出能立即撤销所有 tokens

**步骤**:

```bash
# 使用任何一个有效的 accessToken (测试 1、4 中的任意一个)
ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 登出
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**预期响应** (200):

```json
{
  "success": true,
  "message": "Logged out successfully",
  "tokensRevoked": 2
}
```

**检查清单**:

- ✅ 返回 200
- ✅ `tokensRevoked` > 0 (至少撤销一个 refresh token)
- ✅ 日志中看到 `[/api/auth/logout] Successfully revoked all tokens`

---

### 测试 7: 已撤销 Token 被拒绝

**测试目标**: 验证登出后旧 tokens 全部失效

**步骤**:

```bash
# 使用测试 1 中的原始 accessToken (已被登出撤销)
REVOKED_ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 尝试使用已撤销的 token
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $REVOKED_ACCESS_TOKEN"
```

**预期响应** (401):

```json
{
  "error": "Unauthorized"
}
```

**检查清单**:

- ✅ 返回 401 (即使 JWT 签名有效，但 token 因登出而失效)
- ✅ 不返回用户数据

---

### 测试 8: 已撤销 RefreshToken 被拒绝

**测试目标**: 验证被撤销的 refresh token 无法刷新

**步骤**:

```bash
# 使用测试 1 中的原始 refreshToken (已被测试 6 撤销)
REVOKED_REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 尝试刷新已撤销的 token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REVOKED_REFRESH_TOKEN\"
  }"
```

**预期响应** (401):

```json
{
  "error": "Refresh token 已过期或已被撤销，请重新登录"
}
```

**检查清单**:

- ✅ 返回 401
- ✅ 错误信息提示已撤销
- ✅ 日志中看到 `Refresh token 已被撤销或不存在`

---

## 🗄️ CloudBase 数据库验证

### 检查 refresh_tokens 表

登录 Tencent CloudBase 控制台：

1. 导航到 **数据库** → **refresh_tokens** 集合
2. 应该看到以下记录：

**刚登录的 token 记录**:

```json
{
  "_id": "...",
  "tokenId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_id_xxx",
  "email": "test@example.com",
  "refreshToken": "eyJhbGc...",
  "deviceInfo": "web-login",
  "ipAddress": "127.0.0.1",
  "userAgent": "curl/7.x.x",
  "isRevoked": false,
  "createdAt": "2024-12-XX...",
  "expiresAt": "2024-12-XX..." (7 days later),
  "lastUsedAt": "2024-12-XX...",
  "usageCount": 1,
  "region": "china"
}
```

**刷新后的新 token 记录**:

- 新 `tokenId` (UUID v4)
- `isRevoked: false`
- `createdAt` 为最新时间
- `usageCount: 0`

**登出后的撤销记录**:

- `isRevoked: true`
- `revokedAt` 为登出时间
- `revokeReason: "logout"`

---

## 📊 完整测试流程 (自动化)

如果要一键测试，创建以下脚本 `test-plan-b.sh`：

```bash
#!/bin/bash

set -e

BASE_URL="http://localhost:3000"

echo "🧪 Plan B 集成测试"
echo "==================="

# Test 1: 登录
echo -e "\n✅ Test 1: 登录"
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "email": "test@example.com",
    "password": "password123"
  }')

echo "响应: $LOGIN_RESPONSE"

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
REFRESH_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.refreshToken')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
  echo "❌ 获取 accessToken 失败"
  exit 1
fi

echo "✓ accessToken: ${ACCESS_TOKEN:0:20}..."
echo "✓ refreshToken: ${REFRESH_TOKEN:0:20}..."

# Test 2: 使用 accessToken 调用 API
echo -e "\n✅ Test 2: 使用 accessToken 调用 API"
PROFILE_RESPONSE=$(curl -s -X GET $BASE_URL/api/profile \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "响应: $PROFILE_RESPONSE"
SUCCESS=$(echo $PROFILE_RESPONSE | jq -r '.success')

if [ "$SUCCESS" != "true" ]; then
  echo "❌ API 调用失败"
  exit 1
fi

echo "✓ API 调用成功"

# Test 3: 刷新 token
echo -e "\n✅ Test 3: 刷新 token"
REFRESH_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }")

echo "响应: $REFRESH_RESPONSE"

NEW_ACCESS_TOKEN=$(echo $REFRESH_RESPONSE | jq -r '.accessToken')
NEW_REFRESH_TOKEN=$(echo $REFRESH_RESPONSE | jq -r '.refreshToken')

if [ -z "$NEW_ACCESS_TOKEN" ] || [ "$NEW_ACCESS_TOKEN" == "null" ]; then
  echo "❌ 刷新失败"
  exit 1
fi

echo "✓ 新 accessToken: ${NEW_ACCESS_TOKEN:0:20}..."
echo "✓ 新 refreshToken: ${NEW_REFRESH_TOKEN:0:20}..."

# Test 4: 登出
echo -e "\n✅ Test 4: 登出"
LOGOUT_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/logout \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN")

echo "响应: $LOGOUT_RESPONSE"

TOKENS_REVOKED=$(echo $LOGOUT_RESPONSE | jq -r '.tokensRevoked')

if [ -z "$TOKENS_REVOKED" ] || [ "$TOKENS_REVOKED" -lt 1 ]; then
  echo "❌ 登出失败"
  exit 1
fi

echo "✓ 成功撤销 $TOKENS_REVOKED 个 tokens"

# Test 5: 尝试使用已撤销的 token
echo -e "\n✅ Test 5: 尝试使用已撤销的 token"
REVOKED_RESPONSE=$(curl -s -X GET $BASE_URL/api/profile \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN")

echo "响应: $REVOKED_RESPONSE"

ERROR=$(echo $REVOKED_RESPONSE | jq -r '.error // empty')

if [ -z "$ERROR" ]; then
  echo "❌ 应该返回 401 错误，但返回了成功"
  exit 1
fi

echo "✓ 正确返回 401 错误"

echo -e "\n✅ 所有测试通过！Plan B 实现正确"
```

运行测试:

```bash
chmod +x test-plan-b.sh
./test-plan-b.sh
```

---

## 🔍 故障排查

### 问题 1: 登录返回 500

**可能原因**:

- JWT_SECRET 环境变量未设置
- CloudBase 连接失败
- web_users 表不存在

**解决**:

```bash
# 检查环境变量
echo $JWT_SECRET
echo $NEXT_PUBLIC_WECHAT_CLOUDBASE_ID

# 检查日志
tail -f .next/logs/server.log
```

---

### 问题 2: 刷新 Token 返回 401

**可能原因**:

- refresh_tokens 集合不存在
- CloudBase 连接失败
- Token 已过期

**解决**:

```bash
# 检查 CloudBase 中是否有 refresh_tokens 集合
# 如果没有，会在第一次登录时自动创建

# 检查 CloudBase 日志
# 控制台 → 函数日志
```

---

### 问题 3: 登出不生效

**可能原因**:

- Authorization header 格式错误
- 用户 ID 提取失败
- CloudBase 更新失败

**解决**:

```bash
# 确保 Authorization header 格式正确
# 应该是: "Bearer eyJhbGc..."

# 检查日志中是否看到
# "[/api/auth/logout] Successfully revoked all tokens"
```

---

## 📈 性能指标

在本地测试中，预期性能：

- **登录**: < 500ms
- **API 调用 (有认证)**: < 100ms
- **刷新 Token**: < 300ms
- **登出**: < 200ms

如果性能低于预期，检查 CloudBase 网络连接。

---

## ✅ 最终检查清单

完成所有测试后，验证：

- [ ] 登录返回 accessToken + refreshToken
- [ ] AccessToken 有效期 1 小时
- [ ] RefreshToken 有效期 7 天
- [ ] 使用 accessToken 可调用 API
- [ ] 刷新后获得新的 tokens (token 轮转)
- [ ] 登出后所有旧 tokens 失效
- [ ] CloudBase 中记录了所有 token 操作
- [ ] 设备信息 (IP, User-Agent) 被正确记录
- [ ] 日志中没有错误信息

---

**测试完成后**，Plan B 实现已生产就绪！🎉

---

## 🎯 下一步

1. **前端集成**: 更新前端代码以使用新的 token 格式

   - 分别存储 accessToken 和 refreshToken
   - 实现自动刷新逻辑
   - 实现登出逻辑

2. **监控告警**: 设置告警

   - 多次 401 错误
   - 登出异常
   - Token 生成失败

3. **定期清理**: 配置 Cron Job
   - 定期清理过期 tokens
   - 生成登录统计报告

---

**作者**: GitHub Copilot  
**日期**: 2024-12-XX  
**版本**: v1.0
