// scripts/debug-paypal-headers.ts - 调试PayPal webhook头
import { createServer } from "http";

console.log("🔍 PayPal Webhook Headers Debug Server");
console.log("=====================================");

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/payment/webhook/paypal") {
    console.log("\n📨 Received PayPal webhook request:");
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`Headers:`);

    // 记录所有PayPal相关的头
    const paypalHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key.toLowerCase().includes("paypal") ||
        key.toLowerCase().includes("transmission")
      ) {
        paypalHeaders[key] = Array.isArray(value)
          ? value.join(", ")
          : value || "";
        console.log(`  ${key}: ${paypalHeaders[key]}`);
      }
    }

    // 记录所有头（用于调试）
    console.log("\nAll headers:");
    for (const [key, value] of Object.entries(req.headers)) {
      console.log(
        `  ${key}: ${Array.isArray(value) ? value.join(", ") : value || ""}`
      );
    }

    // 读取body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      console.log("\nBody:");
      try {
        const parsed = JSON.parse(body);
        console.log(JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log(body);
      }

      console.log("\n=====================================\n");

      // 返回成功响应
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", received: true }));
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Debug server listening on port ${PORT}`);
  console.log(
    `📡 Forward PayPal webhooks to: http://localhost:${PORT}/api/payment/webhook/paypal`
  );
  console.log(`\n💡 To test:`);
  console.log(
    `1. Update your PayPal webhook URL to: http://your-public-ip:${PORT}/api/payment/webhook/paypal`
  );
  console.log(`2. Or use ngrok: ngrok http ${PORT}`);
  console.log(`3. Trigger a PayPal webhook event`);
  console.log(`\n⚠️  Press Ctrl+C to stop the server`);
});
