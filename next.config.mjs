/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // 临时忽略 ESLint 错误（循环依赖问题）
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 跳过静态错误页面生成
  generateBuildId: async () => {
    return "build-" + Date.now();
  },
  staticPageGenerationTimeout: 120,
  async headers() {
    // Security headers applied to all routes
    const ContentSecurityPolicy = `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://www.paypal.com https://www.gstatic.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      img-src 'self' data: blob: https:;
      font-src 'self' https://fonts.gstatic.com;
      connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.deepseek.com https://ipapi.co https://ipinfo.io https://ip-api.com https://*.supabase.co https://*.vercel.app;
      frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.paypal.com;
      object-src 'none';
      base-uri 'self';
      form-action 'self' https://www.paypal.com https://openapi.alipay.com https://*.alipaydev.com;
      frame-ancestors 'self';
    `
      .replace(/\s{2,}/g, " ")
      .trim();

    const securityHeaders = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "Content-Security-Policy", value: ContentSecurityPolicy },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // 支付重定向页面：允许向支付宝提交表单
        source: "/payment/redirect",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            // 对于支付重定向页面，允许向任何 HTTPS 地址提交表单
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-eval' 'unsafe-inline';
              style-src 'self' 'unsafe-inline';
              form-action https:;
              frame-ancestors 'self';
            `
              .replace(/\s{2,}/g, " ")
              .trim(),
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Add path mapping for @ alias
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "."),
    };

    // Mark Node.js native modules as external for server-side code
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        {
          "node-fetch": "node-fetch",
          ws: "ws",
          "@cloudbase/adapter-node": "@cloudbase/adapter-node",
          "@cloudbase/node-sdk": "@cloudbase/node-sdk",
          bcryptjs: "bcryptjs",
          jsonwebtoken: "jsonwebtoken",
        },
      ];
    }

    return config;
  },
};

export default nextConfig;
