/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
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
      form-action 'self' https://www.paypal.com;
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
    ];
  },
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
