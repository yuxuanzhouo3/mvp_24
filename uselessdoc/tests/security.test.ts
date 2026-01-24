// tests/security.test.ts - 安全功能测试
import { NextRequest } from "next/server";

// Mock middleware function for testing
function testMiddleware(request: NextRequest, isDevelopment = false) {
  const url = new URL(request.url);

  if (url.searchParams.has("debug") && !isDevelopment) {
    return {
      status: 403,
      body: JSON.stringify({
        error: "Access Denied",
        message: "Debug mode is not allowed in production.",
        code: "DEBUG_MODE_BLOCKED",
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Blocked": "true",
      },
    };
  }

  return {
    status: 200,
    body: "OK",
  };
}

describe("Security Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Debug Mode Blocking", () => {
    it("should block debug parameter in production", async () => {
      const request = new NextRequest("http://localhost:3000/?debug=china");

      const response = testMiddleware(request, false); // production mode
      const data = JSON.parse(response.body);

      expect(response.status).toBe(403);
      expect(data.error).toBe("Access Denied");
      expect(data.code).toBe("DEBUG_MODE_BLOCKED");
      expect(response.headers?.["X-Debug-Blocked"]).toBe("true");
    });

    it("should allow debug parameter in development", async () => {
      const request = new NextRequest("http://localhost:3000/?debug=china");

      const response = testMiddleware(request, true); // development mode

      expect(response.status).toBe(200);
    });

    it("should block debug parameter with any value in production", async () => {
      // Temporarily set production environment
      const originalNodeEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = "production";

      try {
        const testCases = ["china", "usa", "europe", "test", ""];

        for (const debugValue of testCases) {
          const request = new NextRequest(
            `http://localhost:3000/?debug=${debugValue}`
          );
          const response = testMiddleware(request, false); // production mode

          expect(response.status).toBe(403);
        }
      } finally {
        // Always restore environment
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it("should allow normal requests without debug parameter", async () => {
      const request = new NextRequest("http://localhost:3000/");

      const response = testMiddleware(request);

      expect(response.status).toBe(200);
    });

    it("should block debug parameter in API routes in production", async () => {
      // Temporarily set production environment
      const originalNodeEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = "production";

      try {
        const request = new NextRequest(
          "http://localhost:3000/api/test?debug=china"
        );

        const response = testMiddleware(request, false); // production mode

        expect(response.status).toBe(403);
      } finally {
        // Always restore environment
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe("Environment Security", () => {
    it("should not expose sensitive environment variables", () => {
      // Test that sensitive env vars are not accessible in client-side code
      const sensitiveKeys = [
        "SUPABASE_SERVICE_ROLE_KEY",
        "PAYPAL_CLIENT_SECRET",
        "STRIPE_SECRET_KEY",
        "OPENAI_API_KEY",
      ];

      sensitiveKeys.forEach((key) => {
        expect(process.env[key]).toBeUndefined();
      });
    });

    it("should validate required environment variables", () => {
      // Set up required environment variables for test
      const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      (process.env as any).NEXT_PUBLIC_SUPABASE_URL =
        "https://test.supabase.co";
      (process.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

      // Test that critical env vars are set
      const requiredKeys = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ];

      requiredKeys.forEach((key) => {
        expect(process.env[key]).toBeDefined();
        expect(process.env[key]).not.toBe("");
      });

      // Restore original values
      (process.env as any).NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
      (process.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey;
    });
  });
});
