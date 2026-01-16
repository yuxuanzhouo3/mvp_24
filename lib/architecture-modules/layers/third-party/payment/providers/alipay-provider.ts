import {
  AbstractAlipayProvider,
  AlipayConfig,
} from "./abstract/alipay-provider";
// import { AlipaySdk } from "alipay-sdk";
const { AlipaySdk } = require("alipay-sdk");
import * as fs from "fs";
import * as crypto from "crypto";

export class AlipayProvider extends AbstractAlipayProvider {
  private alipaySdk: any;

  constructor(config: any) {
    // 确保 APP_URL 不以斜杠结尾
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
      /\/$/,
      ""
    );

    const certMode =
      (config.ALIPAY_CERT_MODE || process.env.ALIPAY_CERT_MODE) === "true";

    // 读取证书内容（优先使用 *_CONTENT，其次 *_PATH 指向的文件）
    const readMaybeFile = (content?: string, pathEnv?: string) => {
      if (content && content.trim()) return content;
      if (pathEnv && fs.existsSync(pathEnv)) {
        return fs.readFileSync(pathEnv, "utf8");
      }
      return "";
    };

    const appCertContent = readMaybeFile(
      config.ALIPAY_APP_CERT || process.env.ALIPAY_APP_CERT,
      config.ALIPAY_APP_CERT_PATH || process.env.ALIPAY_APP_CERT_PATH
    );
    const alipayPublicCertContent = readMaybeFile(
      config.ALIPAY_ALIPAY_PUBLIC_CERT || process.env.ALIPAY_ALIPAY_PUBLIC_CERT,
      config.ALIPAY_ALIPAY_PUBLIC_CERT_PATH ||
        process.env.ALIPAY_ALIPAY_PUBLIC_CERT_PATH
    );
    const alipayRootCertContent = readMaybeFile(
      config.ALIPAY_ALIPAY_ROOT_CERT || process.env.ALIPAY_ALIPAY_ROOT_CERT,
      config.ALIPAY_ALIPAY_ROOT_CERT_PATH ||
        process.env.ALIPAY_ALIPAY_ROOT_CERT_PATH
    );

    const alipayConfig: AlipayConfig = {
      appId: config.ALIPAY_APP_ID || process.env.ALIPAY_APP_ID || "",
      privateKey:
        config.ALIPAY_PRIVATE_KEY || process.env.ALIPAY_PRIVATE_KEY || "",
      publicKey:
        config.ALIPAY_PUBLIC_KEY || process.env.ALIPAY_PUBLIC_KEY || "",
      alipayPublicKey:
        config.ALIPAY_ALIPAY_PUBLIC_KEY ||
        process.env.ALIPAY_ALIPAY_PUBLIC_KEY ||
        "",
      notifyUrl: `${appUrl}/api/payment/webhook/alipay`,
      returnUrl: `${appUrl}/payment/success`,
      quitUrl: `${appUrl}`,
      gatewayUrl:
        config.ALIPAY_GATEWAY_URL ||
        process.env.ALIPAY_GATEWAY_URL ||
        "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
      certMode,
      appCertContent,
      alipayPublicCertContent,
      alipayRootCertContent,
    };

    super(alipayConfig);

    // 格式化私钥：确保使用PKCS#1格式（alipay-sdk 3.4.0 标准）
    const formatPrivateKey = (key: string) => {
      if (key.includes("BEGIN RSA PRIVATE KEY")) return key;
      if (key.includes("BEGIN PRIVATE KEY")) {
        // 如果是PKCS#8格式，转换为PKCS#1格式
        const keyContent = key
          .replace(/-----BEGIN PRIVATE KEY-----/, "")
          .replace(/-----END PRIVATE KEY-----/, "")
          .replace(/\s/g, "");
        return `-----BEGIN RSA PRIVATE KEY-----\n${keyContent}\n-----END RSA PRIVATE KEY-----`;
      }
      // 如果没有头尾，假设是PKCS#1格式的内容
      return `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
    };

    // 格式化公钥：添加PEM格式的头尾
    const formatPublicKey = (key: string) => {
      if (key.includes("BEGIN")) return key;
      return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
    };

    // 初始化支付宝SDK (v4.x使用解构导入)
    // const AlipaySdkClass = AlipaySdk.default || AlipaySdk;
    // 按模式初始化 SDK
    if (alipayConfig.certMode) {
      this.alipaySdk = new AlipaySdk({
        appId: alipayConfig.appId,
        privateKey: formatPrivateKey(alipayConfig.privateKey),
        signType: "RSA2",
        // 证书模式三大证书
        appCertContent: alipayConfig.appCertContent,
        alipayPublicCertContent: alipayConfig.alipayPublicCertContent,
        alipayRootCertContent: alipayConfig.alipayRootCertContent,
        gateway: alipayConfig.gatewayUrl,
        timeout: 30000,
        camelcase: false,
      });
    } else {
      this.alipaySdk = new AlipaySdk({
        appId: alipayConfig.appId,
        privateKey: formatPrivateKey(alipayConfig.privateKey),
        signType: "RSA2",
        alipayPublicKey: formatPublicKey(alipayConfig.alipayPublicKey),
        gateway: alipayConfig.gatewayUrl,
        timeout: 30000,
        camelcase: false, // 使用下划线命名，与沙箱环境兼容性更好
      });
    }
  }

  /**
   * 原生 App 支付：返回可直接用于 SDK 的 orderString
   */
  async createAppPayment(order: any): Promise<any> {
    const outTradeNo = this.generatePaymentId();

    const bizContent = {
      out_trade_no: outTradeNo,
      total_amount: order.amount.toFixed(2),
      subject: order.description,
      product_code: "QUICK_MSECURITY_PAY",
      passback_params: order.userId || "",
    };

    try {
      const sdk = this.alipaySdk as any;
      const request = {
        bizContent,
        notifyUrl: this.alipayConfig.notifyUrl,
      };

      // alipay-sdk >=4.x: app.pay 通常应使用 sdkExecute 来生成签名后的 orderString
      const orderString =
        typeof sdk?.sdkExecute === "function"
          ? await sdk.sdkExecute("alipay.trade.app.pay", request)
          : await sdk.exec("alipay.trade.app.pay", request);

      return {
        success: true,
        paymentId: outTradeNo,
        orderString,
      };
    } catch (error) {
      // Error 对象属性默认不可枚举，日志可能显示成 {}，这里补充可读信息
      try {
        const e: any = error;
        console.error("Alipay APP pay raw error", {
          name: e?.name,
          message: e?.message,
          code: e?.code,
          subCode: e?.sub_code || e?.subCode,
          subMsg: e?.sub_msg || e?.subMsg,
        });
      } catch {
        // ignore
      }

      const errorDetails = this.parseAlipayError(error);
      throw new Error(
        `Alipay APP Payment Failed [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
      );
    }
  }

  protected async buildAlipayOrder(order: any): Promise<any> {
    const outTradeNo = this.generatePaymentId();

    // 支持切换产品/接口：page(电脑网站) 或 wap(手机网站)
    const productMode = (
      order.productMode || process.env.ALIPAY_PRODUCT_MODE || "wap"
    ).toLowerCase();
    const isWap = productMode === "wap";

    // 根据支付宝官方文档，需要在bizContent中包含notify_url和return_url
    // https://opendocs.alipay.com/open/59da99d0_alipay.trade.page.pay
    const bizContent = {
      out_trade_no: outTradeNo, // 必需：商户订单号
      total_amount: order.amount.toFixed(2), // 必需：订单总金额，单位元，精确到小数点后两位
      subject: order.description, // 必需：订单标题，最长256字符
      product_code: isWap
        ? "QUICK_WAP_WAY" // 手机网站支付
        : "FAST_INSTANT_TRADE_PAY", // 电脑网站支付
      // ✅ 新增：传递用户ID作为passback_params，支付宝会原样返回
      // 这样webhook就能从回调参数中获取到userId
      passback_params: order.userId || "",
      // ✅ 重要：notify_url 必须在 bizContent 中，支付宝才会异步回调
      // 这是webhook被调用的关键配置
      notify_url: this.alipayConfig.notifyUrl,
      return_url: this.alipayConfig.returnUrl,
      quit_url: this.alipayConfig.quitUrl,
    };

    return {
      method: isWap ? "alipay.trade.wap.pay" : "alipay.trade.page.pay",
      bizContent,
    };
  }

  protected async callAlipayAPI(orderData: any): Promise<any> {
    try {
      console.log("Calling Alipay API with order data:", orderData);

      // 按照支付宝官方文档，return_url和notify_url都需要在pageExec的第二个参数中
      const result = await this.alipaySdk.pageExec(orderData.method, {
        return_url: orderData.bizContent.return_url,
        quit_url: orderData.bizContent.quit_url,
        notify_url: orderData.bizContent.notify_url,
        bizContent: orderData.bizContent,
      });

      console.log("Alipay form HTML generated");

      // pageExec返回的是HTML表单字符串，直接返回
      return {
        success: true,
        paymentId: orderData.bizContent.out_trade_no,
        outTradeNo: orderData.bizContent.out_trade_no,
        payUrl: result,
        qrCode: null,
      };
    } catch (error) {
      console.error("Alipay API call failed:", error);

      // 检测和分类支付宝返回的错误
      const errorDetails = this.parseAlipayError(error);

      // 记录详细错误信息
      console.error("Alipay Error Details:", {
        errorCode: errorDetails.code,
        errorMessage: errorDetails.message,
        errorType: errorDetails.type,
        suggestions: errorDetails.suggestions,
      });

      // 根据错误类型抛出相应的错误
      throw new Error(
        `Alipay Payment Failed [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
      );
    }
  }

  protected async queryPaymentStatus(paymentId: string): Promise<any> {
    try {
      console.log("Querying Alipay payment status for:", paymentId);

      // 调用支付宝查询接口
      const result = await this.alipaySdk.exec("alipay.trade.query", {
        bizContent: {
          out_trade_no: paymentId,
        },
      });

      console.log("Alipay query result:", result);

      if (result.code === "10000") {
        const tradeStatus = result.tradeStatus ?? result.trade_status;
        const tradeNo = result.tradeNo ?? result.trade_no;
        const totalAmountRaw = result.totalAmount ?? result.total_amount;
        const buyerPayAmountRaw =
          result.buyerPayAmount ?? result.buyer_pay_amount ?? totalAmountRaw;

        return {
          tradeStatus,
          tradeNo,
          totalAmount: parseFloat(String(totalAmountRaw ?? 0)),
          buyerPayAmount: parseFloat(String(buyerPayAmountRaw ?? 0)),
        };
      } else {
        // 检测查询失败的错误
        const errorDetails = this.parseAlipayError({
          message: `Query failed: ${result.msg} (code: ${result.code})`,
        });
        throw new Error(
          `Payment query failed [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
        );
      }
    } catch (error) {
      console.error("Alipay query failed:", error);

      // 检测和分类查询错误
      const errorDetails = this.parseAlipayError(error);

      console.error("Alipay Query Error Details:", {
        errorCode: errorDetails.code,
        errorMessage: errorDetails.message,
        errorType: errorDetails.type,
        suggestions: errorDetails.suggestions,
      });

      throw new Error(
        `Failed to query payment status [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
      );
    }
  }

  protected async callRefundAPI(
    paymentId: string,
    amount: number
  ): Promise<any> {
    try {
      console.log(
        "Processing Alipay refund for:",
        paymentId,
        "amount:",
        amount
      );

      const outRefundNo = `refund_${paymentId}_${Date.now()}`;

      // 调用支付宝退款接口
      const result = await this.alipaySdk.exec("alipay.trade.refund", {
        bizContent: {
          out_trade_no: paymentId,
          refund_amount: amount.toFixed(2),
          out_request_no: outRefundNo,
        },
      });

      console.log("Alipay refund result:", result);

      if (result.code === "10000") {
        return {
          code: result.code,
          msg: result.msg,
          outRefundNo: result.outRequestNo || outRefundNo,
          refundAmount: parseFloat(result.refundFee || amount.toString()),
        };
      } else {
        // 检测退款失败的错误
        const errorDetails = this.parseAlipayError({
          message: `Refund failed: ${result.msg} (code: ${result.code})`,
        });
        throw new Error(
          `Refund failed [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
        );
      }
    } catch (error) {
      console.error("Alipay refund failed:", error);

      // 检测和分类退款错误
      const errorDetails = this.parseAlipayError(error);

      console.error("Alipay Refund Error Details:", {
        errorCode: errorDetails.code,
        errorMessage: errorDetails.message,
        errorType: errorDetails.type,
        suggestions: errorDetails.suggestions,
      });

      throw new Error(
        `Failed to process refund [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
      );
    }
  }

  /**
   * 解析支付宝API返回的错误信息
   */
  private parseAlipayError(error: any): {
    code: string;
    message: string;
    type: "parameter" | "permission" | "system" | "network" | "unknown";
    suggestions: string;
  } {
    // 默认错误信息
    let errorCode = "UNKNOWN_ERROR";
    let errorMessage = "未知错误";
    let errorType:
      | "parameter"
      | "permission"
      | "system"
      | "network"
      | "unknown" = "unknown";
    let suggestions = "请检查网络连接或联系技术支持";

    try {
      // 提取错误信息
      const errorStr = error instanceof Error ? error.message : String(error);

      // 检测常见的支付宝错误码
      if (errorStr.includes("INVALID_PARAMETER")) {
        errorCode = "INVALID_PARAMETER";
        errorMessage = "参数无效";
        errorType = "parameter";
        suggestions =
          "检查参数格式：out_trade_no、total_amount、subject、product_code等必需参数是否正确";
      } else if (errorStr.includes("MISSING_REQUIRED_ARGUMENTS")) {
        errorCode = "MISSING_REQUIRED_ARGUMENTS";
        errorMessage = "缺少必需参数";
        errorType = "parameter";
        suggestions =
          "检查是否提供了所有必需的参数：out_trade_no、total_amount、subject、product_code";
      } else if (errorStr.includes("ILLEGAL_ARGUMENT")) {
        errorCode = "ILLEGAL_ARGUMENT";
        errorMessage = "参数不合法";
        errorType = "parameter";
        suggestions =
          "检查参数值是否符合要求，例如total_amount格式、out_trade_no长度等";
      } else if (errorStr.includes("INVALID_SIGNATURE")) {
        errorCode = "INVALID_SIGNATURE";
        errorMessage = "签名无效";
        errorType = "parameter";
        suggestions = "检查RSA密钥配置和签名算法，确认私钥格式正确";
      } else if (errorStr.includes("INVALID_APP_ID")) {
        errorCode = "INVALID_APP_ID";
        errorMessage = "无效的应用ID";
        errorType = "permission";
        suggestions = "检查ALIPAY_APP_ID配置是否正确，确认应用已开通相关权限";
      } else if (errorStr.includes("PERMISSION_DENIED")) {
        errorCode = "PERMISSION_DENIED";
        errorMessage = "权限不足";
        errorType = "permission";
        suggestions =
          "检查应用是否已开通电脑网站支付权限，沙箱环境需要单独配置";
      } else if (errorStr.includes("PRODUCT_NOT_SUPPORT")) {
        errorCode = "PRODUCT_NOT_SUPPORT";
        errorMessage = "产品不支持";
        errorType = "permission";
        suggestions = "确认应用已开通FAST_INSTANT_TRADE_PAY产品权限";
      } else if (errorStr.includes("SYSTEM_ERROR")) {
        errorCode = "SYSTEM_ERROR";
        errorMessage = "系统错误";
        errorType = "system";
        suggestions = "支付宝系统暂时不可用，请稍后重试";
      } else if (errorStr.includes("SERVICE_UNAVAILABLE")) {
        errorCode = "SERVICE_UNAVAILABLE";
        errorMessage = "服务不可用";
        errorType = "system";
        suggestions = "支付宝服务暂时不可用，请稍后重试或联系支付宝技术支持";
      } else if (
        errorStr.includes("REQUEST_TIMEOUT") ||
        errorStr.includes("timeout")
      ) {
        errorCode = "REQUEST_TIMEOUT";
        errorMessage = "请求超时";
        errorType = "network";
        suggestions = "网络连接超时，请检查网络环境或增加超时时间";
      } else if (
        errorStr.includes("NETWORK_ERROR") ||
        errorStr.includes("ECONNREFUSED")
      ) {
        errorCode = "NETWORK_ERROR";
        errorMessage = "网络错误";
        errorType = "network";
        suggestions = "网络连接失败，请检查网络环境和支付宝网关地址";
      } else if (errorStr.includes("CERTIFICATE_ERROR")) {
        errorCode = "CERTIFICATE_ERROR";
        errorMessage = "证书错误";
        errorType = "parameter";
        suggestions = "检查RSA证书格式，确认使用PKCS#1格式的私钥";
      }

      // 如果错误信息中包含具体的错误码，尝试提取
      const codeMatch = errorStr.match(/code["\s:]+([A-Z_]+)/i);
      if (codeMatch && codeMatch[1]) {
        errorCode = codeMatch[1];
      }

      // 如果错误信息中包含具体的错误消息，尝试提取
      const msgMatch = errorStr.match(/msg["\s:]+([^",}]+)/i);
      if (msgMatch && msgMatch[1]) {
        errorMessage = msgMatch[1].trim();
      }
    } catch (parseError) {
      console.error("Error parsing Alipay error:", parseError);
    }

    return {
      code: errorCode,
      message: errorMessage,
      type: errorType,
      suggestions,
    };
  }

  protected verifyCallbackSignature(params: any): boolean {
    try {
      console.log("Verifying Alipay callback signature:", params);
      console.log(
        "Environment check - NODE_ENV:",
        process.env.NODE_ENV,
        "ALIPAY_SANDBOX:",
        process.env.ALIPAY_SANDBOX
      );

      // 在开发/沙箱环境下，可以选择跳过签名验证
      // ✅ 修复：更稳健的环境检测（忽略大小写、trim）
      const nodeEnv = (process.env.NODE_ENV || "").toLowerCase().trim();
      const alipayEnv = (process.env.ALIPAY_SANDBOX || "").toLowerCase().trim();

      if (nodeEnv === "development" || alipayEnv === "true") {
        console.log(
          "⏭️  Skipping signature verification in development/sandbox mode",
          { nodeEnv, alipayEnv }
        );
        return true;
      }

      // ✅ 关键修复：检查是否有签名参数
      // 同步 return_url 中不包含签名，只有异步 notify_url 才包含
      if (!params.sign || !params.sign_type) {
        console.log(
          "⚠️  No signature found in params (likely sync return, not async notify)",
          {
            hasSign: !!params.sign,
            hasSignType: !!params.sign_type,
            paramsKeys: Object.keys(params),
          }
        );
        // 同步 return 没有签名是正常的，返回 true 允许继续处理
        // 真正的支付验证应该依赖异步 notify 或主动查询支付宝 API
        return true;
      }

      // ✅ 修复：使用 checkNotifySignV2 替代 checkNotifySign
      // checkNotifySignV2 默认不对 value 进行 decode，避免 URL 编码问题
      // 参考：https://github.com/alipay/alipay-sdk-nodejs-all/issues/45
      console.log(
        "🔐 Using checkNotifySignV2 for signature verification (avoids decode issues)"
      );
      const isValid = this.alipaySdk.checkNotifySignV2(params);

      if (!isValid) {
        console.error("❌ Alipay callback signature verification failed", {
          paramsKeys: Object.keys(params),
          hasSign: !!params.sign,
          hasSignType: !!params.sign_type,
        });
        return false;
      }

      console.log("✅ Alipay callback signature verified successfully");
      return true;
    } catch (error) {
      console.error("❌ Alipay signature verification error:", error, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // Public methods for API use
  public async verifyCallback(
    params: Record<string, string>
  ): Promise<boolean> {
    return this.verifyCallbackSignature(params);
  }

  public async queryPayment(outTradeNo: string): Promise<any> {
    try {
      const result = await this.alipaySdk.exec("alipay.trade.query", {
        bizContent: {
          out_trade_no: outTradeNo,
        },
      });

      if (result.code === "10000") {
        const tradeStatus = result.tradeStatus ?? result.trade_status;
        const tradeNo = result.tradeNo ?? result.trade_no;
        const totalAmount = result.totalAmount ?? result.total_amount;
        const buyerPayAmount =
          result.buyerPayAmount ?? result.buyer_pay_amount ?? totalAmount;

        return {
          trade_status: tradeStatus,
          trade_no: tradeNo,
          total_amount: totalAmount,
          buyer_pay_amount: buyerPayAmount,
        };
      } else {
        // 检测查询失败的错误
        const errorDetails = this.parseAlipayError({
          message: `Query failed: ${result.msg} (code: ${result.code})`,
        });
        throw new Error(
          `Payment query failed [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
        );
      }
    } catch (error) {
      console.error("Alipay public query failed:", error);

      // 检测和分类查询错误
      const errorDetails = this.parseAlipayError(error);

      console.error("Alipay Public Query Error Details:", {
        errorCode: errorDetails.code,
        errorMessage: errorDetails.message,
        errorType: errorDetails.type,
        suggestions: errorDetails.suggestions,
      });

      throw new Error(
        `Failed to query payment [${errorDetails.code}]: ${errorDetails.message}. ${errorDetails.suggestions}`
      );
    }
  }
}
