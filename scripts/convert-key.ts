// scripts/convert-key.ts - 转换RSA密钥格式
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// 从.env.local文件读取私钥
function loadPrivateKeyFromEnv(): string {
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.readFileSync(envPath, "utf-8");

  const lines = envContent.split("\n");
  for (const line of lines) {
    if (line.startsWith("ALIPAY_PRIVATE_KEY=")) {
      return line.substring("ALIPAY_PRIVATE_KEY=".length);
    }
  }

  throw new Error("ALIPAY_PRIVATE_KEY not found in .env.local");
}

function convertPrivateKeyToPKCS1(pemKey: string): string {
  try {
    // 尝试不同的PEM格式
    let formattedKey = pemKey;

    // 如果没有BEGIN标记，尝试添加PKCS#1头尾
    if (!pemKey.includes("-----BEGIN")) {
      formattedKey = `-----BEGIN RSA PRIVATE KEY-----\n${pemKey}\n-----END RSA PRIVATE KEY-----`;
    }

    console.log("Trying PKCS#1 format...");

    // 尝试创建私钥
    const privateKey = crypto.createPrivateKey(formattedKey);

    // 验证这是RSA私钥
    console.log("Private key created successfully");

    // 导出为PKCS#1格式
    const pkcs1Key = privateKey.export({
      type: "pkcs1",
      format: "pem",
    });

    return pkcs1Key.toString();
  } catch (pkcs1Error) {
    console.log("PKCS#1 failed, trying PKCS#8...");

    try {
      let formattedKey = pemKey;
      if (!pemKey.includes("-----BEGIN")) {
        formattedKey = `-----BEGIN PRIVATE KEY-----\n${pemKey}\n-----END PRIVATE KEY-----`;
      }

      const privateKey = crypto.createPrivateKey(formattedKey);
      const pkcs1Key = privateKey.export({
        type: "pkcs1",
        format: "pem",
      });

      return pkcs1Key.toString();
    } catch (pkcs8Error) {
      console.error("PKCS#1 error:", pkcs1Error);
      console.error("PKCS#8 error:", pkcs8Error);
      throw new Error(
        "Unable to parse private key in either PKCS#1 or PKCS#8 format"
      );
    }
  }
}

try {
  const privateKeyPem = loadPrivateKeyFromEnv();
  const pkcs1Key = convertPrivateKeyToPKCS1(privateKeyPem);
  console.log("PKCS#1 Private Key:");
  console.log(pkcs1Key);

  // 保存到文件
  fs.writeFileSync("pkcs1_private.pem", pkcs1Key);
  console.log("PKCS#1 key saved to pkcs1_private.pem");
} catch (error) {
  console.error("Conversion failed:", error);
  process.exit(1);
}
