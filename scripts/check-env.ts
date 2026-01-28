// scripts/check-env.ts - 检查环境变量
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.readFileSync(envPath, "utf-8");

  const env: Record<string, string> = {};
  const lines = envContent.split("\n");

  for (const line of lines) {
    if (line.trim() && !line.startsWith("#")) {
      const equalIndex = line.indexOf("=");
      if (equalIndex > 0) {
        const key = line.substring(0, equalIndex);
        const value = line.substring(equalIndex + 1);
        env[key] = value;
      }
    }
  }

  return env;
}

const env = loadEnv();

console.log("ALIPAY_APP_ID:", env.ALIPAY_APP_ID);
console.log("ALIPAY_PRIVATE_KEY length:", env.ALIPAY_PRIVATE_KEY?.length);
console.log(
  "ALIPAY_PRIVATE_KEY first 50 chars:",
  env.ALIPAY_PRIVATE_KEY?.substring(0, 50)
);
console.log("ALIPAY_PUBLIC_KEY length:", env.ALIPAY_PUBLIC_KEY?.length);
console.log(
  "ALIPAY_ALIPAY_PUBLIC_KEY length:",
  env.ALIPAY_ALIPAY_PUBLIC_KEY?.length
);
