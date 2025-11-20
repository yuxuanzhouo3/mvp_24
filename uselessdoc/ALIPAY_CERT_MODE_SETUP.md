# 支付宝证书模式（CSR/证书）集成指南

本文介绍如何将当前的密钥模式切换为证书模式（更安全、支付宝官方推荐）。适用于沙箱和生产环境。

## 一、概念与所需文件

证书模式需要 3 份证书（均为 PEM/CRT 文本）：

1. 应用公钥证书（appCertPublicKey_xxx.crt）
2. 支付宝公钥证书（alipayCertPublicKey_xxx.crt）
3. 支付宝根证书（alipayRootCert.crt）

同时仍需应用私钥（用于签名，RSA2）。

## 二、生成 CSR 与申请应用证书

1. 生成 RSA 私钥与 CSR（可用支付宝密钥工具或 openssl）：
   - 建议直接使用支付宝开放平台密钥工具一键生成 RSA2 私钥与 CSR。
2. 在支付宝开放平台（沙箱或生产）中：
   - 接口加签方式选择「证书」
   - 上传 CSR 申请「应用公钥证书」，并下载：appCertPublicKey_xxx.crt
3. 在同一页面下载：
   - 支付宝公钥证书：alipayCertPublicKey_xxx.crt
   - 支付宝根证书：alipayRootCert.crt（沙箱与生产不同）

## 三、环境变量配置（证书模式）

在 `.env.local`（或对应环境）中新增：

```
# 启用证书模式
ALIPAY_CERT_MODE=true

# 私钥（仍然保留，RSA2）
ALIPAY_PRIVATE_KEY=... # PKCS1/PKCS8/纯Base64均可，系统会自动规范化

# 三份证书，任选其一方式提供：直接内容 或 文件路径
# 方式A：直接内容（建议使用多行PEM文本，含 -----BEGIN ...-----/-----END ...-----）
ALIPAY_APP_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
ALIPAY_ALIPAY_PUBLIC_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
ALIPAY_ALIPAY_ROOT_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"

# 方式B：文件路径（放在项目或安全目录中）
# ALIPAY_APP_CERT_PATH=c:\\certs\\appCertPublicKey_XXXX.crt
# ALIPAY_ALIPAY_PUBLIC_CERT_PATH=c:\\certs\\alipayCertPublicKey_XXXX.crt
# ALIPAY_ALIPAY_ROOT_CERT_PATH=c:\\certs\\alipayRootCert.crt

# 其他保留配置
ALIPAY_APP_ID=9021000157643313
ALIPAY_GATEWAY_URL=https://openapi-sandbox.dl.alipaydev.com/gateway.do
ALIPAY_SANDBOX=true
```

注意：

- 证书模式下，`ALIPAY_PUBLIC_KEY` 与 `ALIPAY_ALIPAY_PUBLIC_KEY` 不再用于 SDK 初始化（但保留无妨）。
- 三份证书必须与沙箱/生产环境匹配，不可混用。

## 四、代码已支持证书模式

我们已将 `AlipayProvider` 改造为支持证书模式：

- 通过 `ALIPAY_CERT_MODE=true` 自动启用证书参数：
  - `appCertContent`
  - `alipayPublicCertContent`
  - `alipayRootCertContent`
- 仍然使用 RSA2 签名与 `pageExecute("alipay.trade.page.pay", ...)` 生成表单。
- `AbstractAlipayProvider` 的配置校验会在证书模式下要求三份证书齐全。

## 五、快速测试（证书模式）

准备好三份证书后，可运行下面的测试脚本（已提供）：

```
node test-alipay-cert.js
```

输出预期：

- SDK 初始化成功
- 生成 HTML 表单（包含 <form ...>）

若失败：

- 检查三份证书与环境是否匹配（沙箱/生产）
- 检查证书文本是否完整（包含 BEGIN/END 行）
- 检查私钥是否与应用证书对应的公钥匹配

## 六、切回密钥模式

将 `ALIPAY_CERT_MODE` 删除或设置为 `false` 即可恢复到原有密钥模式（使用 `alipayPublicKey`）。

## 七、常见问题

- INVALID_PARAMETER：多半为产品权限未开通或环境/证书混用。确认「电脑网站支付」已开通，证书均为沙箱/生产对应版本。
- CERTIFICATE_ERROR：证书内容不完整或不匹配。重新下载证书，或确保 PEM 头尾与换行完整。
- 签名错误：优先检查私钥与应用公钥证书是否成对，以及 SDK signType 是否为 RSA2。

---

最后更新：2025-11-05
