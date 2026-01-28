# 支付宝生产环境配置指南

## 🚀 获取生产环境配置的步骤

### 1. 登录支付宝开放平台

访问：https://open.alipay.com/
使用你的支付宝账号登录

### 2. 创建或选择应用

- 如果没有应用：点击"控制台" -> "我的应用" -> "创建应用"
- 如果有应用：选择你的应用进入详情页

### 3. 配置 RSA 密钥 🔑

**重要：你看到的页面可能不是 RSA 密钥配置页面**

在应用详情页：

1. 点击左侧菜单 **"开发配置"** -> **"开发设置"**
2. 找到 **"接口加签方式"** 部分
3. 如果显示"已设置"，点击"查看"或"修改"
4. 如果没有设置，点击"设置"

### 4. 生成 RSA 密钥对

有两种方式：

#### 方式一：让支付宝生成（推荐）

- 点击"支付宝生成密钥"
- 系统会自动生成 RSA 密钥对
- **重要**：立即下载并保存私钥文件（.pem 格式）
- 复制支付宝公钥内容

#### 方式二：使用自己的密钥

- 点击"自己生成"
- 使用 OpenSSL 生成 RSA 密钥对：

```bash
# 生成私钥
openssl genrsa -out private_key.pem 2048

# 生成公钥
openssl rsa -in private_key.pem -pubout -out public_key.pem

# 转换为PKCS#1格式（支付宝要求）
openssl rsa -in private_key.pem -out private_key_pkcs1.pem
```

### 5. 获取 App ID

在应用详情页的"基本信息"中找到"App ID"，复制保存

### 6. 配置到项目

将获取的信息填入 `.env.local`：

```bash
# 生产环境App ID
ALIPAY_APP_ID=你的App_ID

# 私钥（PKCS#1格式）
ALIPAY_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
你的私钥内容
-----END RSA PRIVATE KEY-----

# 你的公钥（可选，用于验证）
ALIPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
你的公钥内容
-----END PUBLIC KEY-----

# 支付宝公钥（从开放平台获取）
ALIPAY_ALIPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
支付宝的公钥内容
-----END PUBLIC KEY-----
```

## ⚠️ 重要提醒

1. **私钥务必妥善保存**，一旦丢失无法恢复
2. **不要将私钥提交到代码仓库**
3. **生产环境配置完成后，立即删除沙箱配置**
4. **定期更换生产环境的密钥对**

## 🔍 验证配置

配置完成后运行：

```bash
node check-alipay-config.js
```

如果显示 ✅，说明配置正确。
