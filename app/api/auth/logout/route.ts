/**
 * POST /api/auth/logout
 * Logout user and revoke all refresh tokens (Plan B: JWT + CloudBase)
 *
 * Flow:
 * 1. Verify accessToken is valid
 * 2. Revoke ALL user's refresh tokens in CloudBase
 * 3. Return success
 * 4. Frontend clears localStorage
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth-utils";
import { revokeAllUserTokens } from "@/lib/refresh-token-manager";
import { logSecurityEvent } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const clientIP =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Step 1: Extract and verify accessToken from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn(
        "[/api/auth/logout] Missing or invalid Authorization header"
      );
      logSecurityEvent("logout_unauthorized", undefined, clientIP, {
        reason: "Missing Authorization header",
      });

      return NextResponse.json(
        { error: "Unauthorized - missing Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const authResult = await verifyAuthToken(token);

    if (!authResult.success || !authResult.userId) {
      console.warn("[/api/auth/logout] Unauthorized access attempt");
      logSecurityEvent("logout_unauthorized", undefined, clientIP, {
        reason: authResult.error || "Invalid token",
      });

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.userId;
    console.log("[/api/auth/logout] Logout request from userId:", userId);

    // Step 2: Revoke all user's refresh tokens in CloudBase
    const revokeResult = await revokeAllUserTokens(userId, "logout");

    if (!revokeResult.success) {
      console.error(
        "[/api/auth/logout] Failed to revoke tokens:",
        revokeResult.error
      );
      logSecurityEvent("logout_revoke_failed", userId, clientIP, {
        error: revokeResult.error,
      });

      return NextResponse.json(
        { error: "Failed to revoke tokens" },
        { status: 500 }
      );
    }

    // Step 3: Log success
    console.log(
      "[/api/auth/logout] Successfully revoked all tokens for userId:",
      userId
    );
    logSecurityEvent("logout_success", userId, clientIP, {
      tokensRevoked: revokeResult.revokedCount,
    });

    // Step 4: Return success response (frontend clears localStorage)
    return NextResponse.json(
      {
        success: true,
        message: "Logged out successfully",
        tokensRevoked: revokeResult.revokedCount,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[/api/auth/logout] Error:", error.message);

    logSecurityEvent(
      "logout_error",
      undefined,
      request.headers.get("x-forwarded-for") || "unknown",
      { error: error.message }
    );

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
