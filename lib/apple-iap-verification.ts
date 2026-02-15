/**
 * Apple IAP 服务器验证模块
 * 从 Apple 服务器获取真实的订阅状态和过期时间
 * 而不是仅依赖本地数据库
 */

import { logInfo, logError, logWarn } from "@/lib/logger";

const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com";
const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com";

interface AppleTransactionInfoResponse {
  signedTransactionInfo: string;
  signedRenewalInfo: string;
}

interface DecodedTransactionInfo {
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  transactionId: string;
  purchaseDate: number; // milliseconds
  expiresDate?: number; // milliseconds (subscription only)
  isUpgraded?: boolean;
  offerId?: string;
  inAppOwnershipType?: "PURCHASED" | "FAMILY_SHARED";
  signedDate: number;
  transactionReason?: "PURCHASE" | "RENEWAL";
  environment?: "Sandbox" | "Production";
}

interface DecodedRenewalInfo {
  originalTransactionId: string;
  autoRenewProductId: string;
  autoRenewStatus: 1 | 0; // 1 = auto-renew enabled, 0 = disabled
  expirationIntent?: 1 | 2 | 3 | 4; // 1=billing issue, 2=declined, 3=user cancelled, 4=price increase
  priceIncreaseStatus?: 0 | 1;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  signedDate: number;
}

/**
 * 从 Apple App Store Server API v2 获取订阅信息
 * 需要配置 APPLE_PRIVATE_KEY（从 App Store Connect 获取）
 */
export async function verifyAppleSubscription(
  originalTransactionId: string,
  bundleId: string,
  productId?: string,
  useProduction: boolean = true
): Promise<{
  isValid: boolean;
  expiresDate?: number;
  autoRenewStatus?: boolean;
  errorMessage?: string;
  transactionInfo?: DecodedTransactionInfo;
  renewalInfo?: DecodedRenewalInfo;
}> {
  try {
    // 从环境变量获取 Apple 的密钥（需要配置）
    const applePrivateKey = process.env.APPLE_PRIVATE_KEY;
    const appleKeyId = process.env.APPLE_KEY_ID;
    const appleIssuerId = process.env.APPLE_ISSUER_ID;
    const appleBundleId = process.env.APPLE_BUNDLE_ID || bundleId;

    if (!applePrivateKey || !appleKeyId || !appleIssuerId) {
      logWarn("Apple IAP verification: Missing configuration", {
        hasPrivateKey: !!applePrivateKey,
        hasKeyId: !!appleKeyId,
        hasIssuerId: !!appleIssuerId,
      });
      return {
        isValid: false,
        errorMessage: "Apple IAP verification not configured",
      };
    }

    // 生成 JWT Token 用于 Apple API 认证
    const jwt = generateAppleJWT(
      applePrivateKey,
      appleKeyId,
      appleIssuerId
    );

    const baseUrl = useProduction ? APPLE_PRODUCTION_URL : APPLE_SANDBOX_URL;
    const endpoint = `/inApps/v1/subscriptions/${originalTransactionId}`;

    logInfo("Verifying Apple subscription", {
      originalTransactionId,
      bundleId,
      productId: productId || "(not provided)",
      useProduction,
    });

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError("Apple subscription verification failed", new Error(errorBody), {
        status: response.status,
        originalTransactionId,
      });
      return {
        isValid: false,
        errorMessage: `Apple API error: ${response.status}`,
      };
    }

    const data: AppleTransactionInfoResponse = await response.json();

    // 解码 Apple 返回的签名数据
    const decodedTransaction = decodeAppleToken(data.signedTransactionInfo);
    const decodedRenewal = data.signedRenewalInfo
      ? decodeAppleToken(data.signedRenewalInfo)
      : null;

    // 确保获取的是 transaction 数据
    const transactionInfo = decodedTransaction as DecodedTransactionInfo | null;
    const renewalInfo = decodedRenewal as DecodedRenewalInfo | null;

    if (!transactionInfo) {
      return {
        isValid: false,
        errorMessage: "Failed to decode Apple transaction info",
      };
    }

    // 验证 bundle ID（必须匹配）
    if (transactionInfo.bundleId !== appleBundleId) {
      logWarn("Apple IAP verification: bundle mismatch", {
        expectedBundleId: appleBundleId,
        actualBundleId: transactionInfo.bundleId,
      });
      return {
        isValid: false,
        errorMessage: "Bundle ID mismatch",
      };
    }

    // productId 仅在提供时校验（status 查询可不传）
    const expectedProductId = typeof productId === "string" ? productId.trim() : "";
    if (expectedProductId && transactionInfo.productId !== expectedProductId) {
      logWarn("Apple IAP verification: product mismatch", {
        expectedProductId,
        actualProductId: transactionInfo.productId,
      });
      return {
        isValid: false,
        errorMessage: "Product ID mismatch",
      };
    }

    const now = Date.now();
    const expiresDate = transactionInfo.expiresDate;
    const isValid =
      expiresDate !== undefined ? expiresDate > now : transactionInfo.purchaseDate <= now;
    const autoRenewStatus = renewalInfo?.autoRenewStatus === 1;

    logInfo("Apple subscription verified", {
      originalTransactionId,
      isValid,
      expiresDate,
      autoRenewStatus,
      autoRenewProductId: renewalInfo?.autoRenewProductId,
    });

    return {
      isValid,
      expiresDate,
      autoRenewStatus,
      transactionInfo,
      renewalInfo: renewalInfo || undefined,
    };
  } catch (error) {
    logError(
      "Apple subscription verification error",
      error instanceof Error ? error : new Error(String(error)),
      {
        originalTransactionId,
      }
    );
    return {
      isValid: false,
      errorMessage: "Verification error",
    };
  }
}

/**
 * 生成用于 Apple API 认证的 JWT Token
 */
function generateAppleJWT(
  privateKey: string,
  keyId: string,
  issuerId: string
): string {
  try {
    // 注意：需要安装 jsonwebtoken 包
    // npm install jsonwebtoken
    const jwt = require("jsonwebtoken");

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = now + 3600; // 1 小时有效期

    const payload = {
      iss: issuerId,
      iat: now,
      exp: expiresIn,
      aud: "appstoreconnect-v1",
    };

    return jwt.sign(payload, privateKey, {
      algorithm: "ES256",
      keyid: keyId,
      header: {
        alg: "ES256",
        kid: keyId,
        typ: "JWT",
      },
    });
  } catch (error) {
    logError(
      "Failed to generate Apple JWT",
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}

/**
 * 解码 Apple 返回的 JWS Token（base64url 编码的 JSON）
 * Apple 使用 JWS（JSON Web Signature）而不是完整的 JWT
 */
function decodeAppleToken(
  token: string
): DecodedTransactionInfo | DecodedRenewalInfo | null {
  try {
    // Apple 返回的是 3 部分的 JWS: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      logWarn("Invalid Apple token format", { tokenLength: parts.length });
      return null;
    }

    // 解码 payload 部分（第二部分）
    const payload = parts[1];
    // 添加 padding
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf-8");

    return JSON.parse(decoded);
  } catch (error) {
    logError(
      "Failed to decode Apple token",
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}

/**
 * 简化版：如果只需要快速验证交易有效性而不调用 Apple API
 * 可以验证本地数据库中已保存的信息
 */
export function validateAppleTransactionLocally(
  transactionId: string,
  expiresDate?: number
): boolean {
  if (!transactionId) {
    return false;
  }

  const now = Date.now();
  if (expiresDate !== undefined) {
    return expiresDate > now;
  }

  // 如果没有过期时间，则认为有效（对于一次性购买）
  return true;
}
