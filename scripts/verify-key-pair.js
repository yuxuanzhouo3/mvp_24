// 验证私钥和公钥是否匹配
const crypto = require("crypto");
const fs = require("fs");

// 读取 .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
const envLines = envContent.split("\n");

let privateKey = "";
let publicKey = "";

for (const line of envLines) {
  if (line.startsWith("ALIPAY_PRIVATE_KEY=")) {
    privateKey = line.substring("ALIPAY_PRIVATE_KEY=".length).trim();
  } else if (line.startsWith("ALIPAY_PUBLIC_KEY=")) {
    publicKey = line.substring("ALIPAY_PUBLIC_KEY=".length).trim();
  }
}

// 格式化密钥
const formatPrivateKey = (key) => {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN RSA PRIVATE KEY-----\n${key}\n-----END RSA PRIVATE KEY-----`;
};

const formatPublicKey = (key) => {
  if (key.includes("BEGIN")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
};

console.log("验证密钥对是否匹配...\n");

try {
  const formattedPrivateKey = formatPrivateKey(privateKey);
  const formattedPublicKey = formatPublicKey(publicKey);

  // 测试数据
  const testData = "Hello Alipay!";

  // 使用私钥签名
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(testData);
  sign.end();
  const signature = sign.sign(formattedPrivateKey, "base64");

  console.log("✅ 私钥签名成功");
  console.log("签名值:", signature.substring(0, 50) + "...");

  // 使用公钥验证
  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(testData);
  verify.end();
  const isValid = verify.verify(formattedPublicKey, signature, "base64");

  if (isValid) {
    console.log("✅ 公钥验证成功 - 密钥对匹配！\n");
    console.log("密钥对是正确的，问题出在支付宝沙箱配置。");
    console.log("\n请执行以下操作：");
    console.log("1. 访问：https://openhome.alipay.com/develop/sandbox/app");
    console.log("2. 找到 接口加签方式 → 公钥模式 → 设置");
    console.log("3. 上传以下应用公钥（不含 BEGIN/END 行）：\n");
    console.log(publicKey);
    console.log(
      "\n注意：只复制上面这一行，不要包含 -----BEGIN PUBLIC KEY----- 等内容"
    );
  } else {
    console.log("❌ 公钥验证失败 - 密钥对不匹配！");
    console.log("私钥和公钥不是一对，请检查 .env.local 配置");
  }
} catch (error) {
  console.error("❌ 验证过程出错:", error.message);
  console.error("\n可能的问题：");
  console.error("1. 密钥格式错误");
  console.error("2. 密钥不完整");
  console.error("3. 密钥类型不匹配（RSA vs RSA2）");
}
