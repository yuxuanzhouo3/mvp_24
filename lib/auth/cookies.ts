import type { NextRequest, NextResponse } from "next/server";

export const ACCESS_TOKEN_COOKIE = "cn-access-token";
export const REFRESH_TOKEN_COOKIE = "cn-refresh-token";

function cookieSecurityOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken?: string
) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieSecurityOptions(),
    maxAge: 60 * 60,
  });

  if (refreshToken) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...cookieSecurityOptions(),
      maxAge: 60 * 60 * 24 * 7,
    });
  }
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    ...cookieSecurityOptions(),
    maxAge: 0,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", {
    ...cookieSecurityOptions(),
    maxAge: 0,
  });
}

export function readAccessTokenFromRequest(request: NextRequest): string | null {
  return (
    request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ||
    request.cookies.get("auth-token")?.value ||
    null
  );
}

export function readRefreshTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_TOKEN_COOKIE)?.value || null;
}
