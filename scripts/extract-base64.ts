// scripts/extract-base64.ts - 提取base64私钥
import * as fs from "fs";

function extractBase64FromPEM(pemContent: string): string {
  return pemContent
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/\n/g, "")
    .trim();
}

try {
  // 读取PKCS#1私钥
  const pemKey = fs.readFileSync("pkcs1_private.pem", "utf8");

  // 提取base64内容
  const base64Key = extractBase64FromPEM(pemKey);

  console.log("Base64 private key:");
  console.log(base64Key);

  // 保存到文件
  fs.writeFileSync("alipay_private_base64.txt", base64Key);
  console.log("Saved to alipay_private_base64.txt");
} catch (error) {
  console.error("Error:", error);
  process.exit(1);
}
