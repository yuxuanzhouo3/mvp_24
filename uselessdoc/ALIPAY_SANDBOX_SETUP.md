# 支付宝沙盒配置指南

## 1. 获取沙盒应用

1. 访问 [支付宝开放平台沙盒环境](https://openhome.alipay.com/platform/appDaily.htm)
2. 使用支付宝账号登录
3. 创建沙盒应用（选择"网页&移动应用"）
4. 记录应用 ID (AppId)

## 2. 配置 RSA 密钥对

### 生成 RSA 密钥对

```bash
# 生成私钥
openssl genrsa -out private_key.pem 2048

# 生成公钥
openssl rsa -in private_key.pem -pubout -out public_key.pem

# 查看私钥内容（用于环境变量）
cat private_key.pem

# 查看公钥内容（用于上传到支付宝）
cat public_key.pem
```

### 配置到支付宝沙盒

1. 在沙盒应用设置中，上传生成的公钥
2. 保存后，记录支付宝公钥（用于环境变量）

## 3. 环境变量配置

在 `.env.local` 文件中添加：

```bash
# 支付宝沙盒配置
ALIPAY_APP_ID=你的沙盒应用ID
ALIPAY_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n你的私钥内容\n-----END PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n支付宝公钥内容\n-----END PUBLIC KEY-----"
ALIPAY_GATEWAY_URL=https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_SANDBOX=true

# 应用URL（用于回调）
APP_URL=http://localhost:3000
```

## 4. 回调 URL 配置

在沙盒应用设置中配置：

- **异步通知 URL**: `https://your-domain.com/api/payment/alipay/notify`
- **同步跳转 URL**: `https://your-domain.com/payment/success`

## 5. 测试验证

配置完成后，可以运行测试：

```bash
npx tsx scripts/test-alipay-provider.ts
```

## 注意事项

1. **私钥格式**: 确保私钥包含完整的 PEM 格式（包括-----BEGIN PRIVATE KEY-----和-----END PRIVATE KEY-----）
2. **公钥**: 使用支付宝返回的公钥，而不是你生成的公钥
3. **沙箱环境**: 沙盒环境不产生真实交易，仅用于开发测试
4. **签名验证**: 生产环境必须启用，沙盒环境可以选择跳过（通过 ALIPAY_SANDBOX=true 控制）

## 沙盒测试账号

- **买家账号**: 支付宝提供测试账号
- **支付密码**: 支付宝提供测试密码

更多详情请参考[支付宝沙盒文档](https://opendocs.alipay.com/open/200/105311)。
