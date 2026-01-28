# 支付宝沙箱 INVALID_PARAMETER 问题诊断清单

## 当前状态

✅ SDK 测试成功 - 能正常生成支付表单
✅ 密钥格式正确 - 已添加 PEM 头尾
✅ 参数最简化 - 0.01 元，subject: "test"
✅ 网关地址正确 - https://openapi-sandbox.dl.alipaydev.com/gateway.do
✅ APP_ID 正确 - 9021000157643313
❌ 支付宝返回 INVALID_PARAMETER 错误

## 问题分析

### 可能原因 1: 产品功能未开通 ⭐ 最可能

支付宝沙箱需要在控制台手动开通"电脑网站支付"产品。

**检查步骤：**

1. 登录：https://openhome.alipay.com/develop/sandbox/app
2. 点击您的应用：sandbox 默认应用:2088721086682040
3. 查看"产品绑定"或"功能列表"
4. **确认"电脑网站支付"（或 PC Website Payment）已开通**

**如果未开通：**

- 点击"添加功能"或"产品绑定"
- 搜索"电脑网站支付"
- 点击"签约"或"开通"

### 可能原因 2: 公钥配置错误

沙箱页面显示"公钥模式已启用"，需要确认公钥是否正确上传。

**检查步骤：**

1. 在沙箱应用页面，找到"接口加签方式"
2. 点击"查看/设置"
3. 确认显示的应用公钥与 .env.local 中的 ALIPAY_PUBLIC_KEY 一致

**ALIPAY_PUBLIC_KEY (前 50 字符):**

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApW
```

### 可能原因 3: 沙箱 APP 未激活

某些沙箱应用需要激活后才能使用。

**检查步骤：**

1. 查看应用详情页面的"应用状态"
2. 确认不是"未激活"或"审核中"状态

### 可能原因 4: product_code 不匹配

`FAST_INSTANT_TRADE_PAY` 是电脑网站支付的产品码，但可能需要其他码。

**测试 URL（不带回调）：**

```
https://openapi-sandbox.dl.alipaydev.com/gateway.do?method=alipay.trade.page.pay&app_id=9021000157643313&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2025-11-05%2015%3A59%3A20&sign=IHtVuRVRYlsXHiF1sz5loGTBPp79st0N4QsyWPianUlSapbGWLFsrWVMmV6NlBYNaavFq8pTgQpoZ7s3tjqoM0HL4fopp1CEX6Z4yMjbyQdA2YT9%2Be58ji705UBcVrTV1z00PdYxQz4CHnmOz4W5BeU3RaYaOqImPJwIm7SJFUiorq1yQ60ph%2F7ajhGbKaCLewBx9F1GiPewTvVYizhlBjrgAok6SyXMSrLoX5IGe5vQSx9susGo9SnKfFQosGKUUxYYaLN4Y7O669v7g8bFhN1PLRRs6qTur44G4iGZtxIUxcu3SGAzoFGaWG%2FIVYqiAXLngo1M%2FLUORhO69vp1Tw%3D%3D
```

## 推荐操作步骤

### 第一步：检查产品功能（最重要）

1. 访问 https://openhome.alipay.com/develop/sandbox/app
2. 查看产品功能列表
3. 如果没有"电脑网站支付"，立即开通

### 第二步：验证公钥

1. 在沙箱控制台查看已上传的应用公钥
2. 对比 .env.local 中的 ALIPAY_PUBLIC_KEY
3. 如果不匹配，重新上传

### 第三步：使用沙箱账号测试

支付宝沙箱提供了测试买家账号：

- 在沙箱页面左侧找到"沙箱账号"
- 获取买家账号和密码
- 使用这些账号登录沙箱支付宝进行测试

### 第四步：查看详细错误

在支付宝沙箱页面可能有更详细的错误日志：

- 沙箱应用页面 → 日志查询
- 查看最近的 API 调用记录
- 查看详细的错误码和子错误码（sub_code, sub_msg）

## 测试 URL

复制以下 URL 在浏览器中直接访问，查看详细错误信息：

**测试 1：最简参数（无回调 URL）**

```
https://openapi-sandbox.dl.alipaydev.com/gateway.do?method=alipay.trade.page.pay&app_id=9021000157643313&charset=utf-8&version=1.0&sign_type=RSA2&timestamp=2025-11-05%2015%3A59%3A20&sign=IHtVuRVRYlsXHiF1sz5loGTBPp79st0N4QsyWPianUlSapbGWLFsrWVMmV6NlBYNaavFq8pTgQpoZ7s3tjqoM0HL4fopp1CEX6Z4yMjbyQdA2YT9%2Be58ji705UBcVrTV1z00PdYxQz4CHnmOz4W5BeU3RaYaOqImPJwIm7SJFUiorq1yQ60ph%2F7ajhGbKaCLewBx9F1GiPewTvVYizhlBjrgAok6SyXMSrLoX5IGe5vQSx9susGo9SnKfFQosGKUUxYYaLN4Y7O669v7g8bFhN1PLRRs6qTur44G4iGZtxIUxcu3SGAzoFGaWG%2FIVYqiAXLngo1M%2FLUORhO69vp1Tw%3D%3D
```

## 参考文档

- 支付宝沙箱环境说明：https://opendocs.alipay.com/common/02kkv7
- 电脑网站支付产品介绍：https://opendocs.alipay.com/open/270
- 沙箱环境使用指南：https://opendocs.alipay.com/common/02kkuu

## 下一步

请按照上述步骤检查沙箱配置，特别是：

1. ✅ 确认"电脑网站支付"产品已开通
2. ✅ 确认应用公钥已正确上传
3. ✅ 获取沙箱买家账号用于测试

**如果仍然遇到问题，请提供：**

- 沙箱应用详情页面的截图
- 产品功能列表的截图
- 支付宝返回的完整错误信息（包括 sub_code 和 sub_msg）
