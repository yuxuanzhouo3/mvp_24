import { NextResponse, NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { authRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";

export async function GET(req: NextRequest) {
  // Apply rate limiting using a wrapper
  return new Promise<NextResponse>((resolve) => {
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => resolve(NextResponse.json(data, { status: code })),
      }),
      setHeader: () => {},
      getHeader: () => undefined,
    };

    authRateLimit(req as any, mockRes as any, async () => {
      // Rate limit not exceeded, handle the request
      resolve(await handleAuthStatus());
    });
  });
}

async function handleAuthStatus() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hasSession: false,
          session: null,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // 检查localStorage中的token（服务端无法直接访问，但我们可以检查session）
    const hasValidSession = !!session && !!session.access_token;
    const isExpired = session?.expires_at
      ? new Date(session.expires_at * 1000) < new Date()
      : false;

    return NextResponse.json({
      hasSession: hasValidSession,
      isExpired,
      userId: session?.user?.id || null,
      email: session?.user?.email || null,
      expiresAt: session?.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      sessionData: session
        ? {
            access_token: session.access_token ? "present" : "missing",
            refresh_token: session.refresh_token ? "present" : "missing",
            token_type: session.token_type,
            expires_in: session.expires_in,
          }
        : null,
      timestamp: new Date().toISOString(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch (err) {
    captureException(err);
    return NextResponse.json(
      {
        error: "Failed to check auth status",
        details: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
