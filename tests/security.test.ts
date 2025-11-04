// tests/security.test.ts - 安全功能测试
import { NextRequest } from "next/server";

// Mock middleware function for testing
async function testMiddleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Check for debug parameter (should be blocked in all environments)
  const debugParam = searchParams.get("debug");

  if (debugParam) {
    return new Response(
      JSON.stringify({
        error: "Access Denied",
        message: "Debug mode is not allowed.",
        code: "DEBUG_MODE_BLOCKED",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Blocked": "true",
        },
      }
    );
  }

  return new Response("OK", { status: 200 });
}

describe("Security Tests", () => {
  describe("Debug Mode Blocking", () => {
    it("should block debug parameter in all environments", async () => {
      const request = new NextRequest("http://localhost:3000/?debug=china");

      const response = await testMiddleware(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Access Denied");
      expect(data.code).toBe("DEBUG_MODE_BLOCKED");
      expect(response.headers.get("X-Debug-Blocked")).toBe("true");
    });

    it("should block debug parameter with any value", async () => {
      const testCases = ["china", "usa", "europe", "test", ""];

      for (const debugValue of testCases) {
        const request = new NextRequest(
          `http://localhost:3000/?debug=${debugValue}`
        );
        const response = await testMiddleware(request);

        expect(response.status).toBe(403);
      }
    });

    it("should allow normal requests without debug parameter", async () => {
      const request = new NextRequest("http://localhost:3000/");

      const response = await testMiddleware(request);

      expect(response.status).toBe(200);
    });

    it("should block debug parameter in API routes", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/test?debug=china"
      );

      const response = await testMiddleware(request);

      expect(response.status).toBe(403);
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
      // Test that critical env vars are set
      const requiredKeys = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ];

      requiredKeys.forEach((key) => {
        expect(process.env[key]).toBeDefined();
        expect(process.env[key]).not.toBe("");
      });
    });
  });
});
