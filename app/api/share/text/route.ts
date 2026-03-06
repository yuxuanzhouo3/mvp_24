import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/cloudbase-service";
import { extractTokenFromHeader, verifyAuthToken } from "@/lib/auth-utils";
import { ensureUserReferralCode } from "@/lib/market/referrals";

export const runtime = "nodejs";

const COLLECTION = "shared_texts";
const SHARE_TTL_DAYS = 30;
const MAX_CONTENT_LENGTH = 60_000;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{6,40}$/;
const SHARE_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

function generateShareId() {
  return `s_${crypto.randomBytes(6).toString("base64url")}`;
}

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isMissingCollectionError(error: any) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    message.includes("Db or Table not exist") ||
    message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
    code.includes("DATABASE_COLLECTION_NOT_EXIST")
  );
}

async function ensureShareTextCollection(db: any) {
  try {
    await db.collection(COLLECTION).limit(1).get();
  } catch (error) {
    if (!isMissingCollectionError(error)) {
      throw error;
    }
    await db.createCollection(COLLECTION);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { content?: unknown }
      | null;
    const content =
      typeof body?.content === "string" ? body.content.trim() : "";

    if (!content) {
      return jsonNoStore({ success: false, error: "content is required" }, 400);
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return jsonNoStore(
        {
          success: false,
          error: `content exceeds max length (${MAX_CONTENT_LENGTH})`,
        },
        400
      );
    }

    const id = generateShareId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
    let creatorUserId: string | null = null;
    let creatorReferralCode: string | null = null;

    const authHeader = request.headers.get("authorization");
    const { token } = extractTokenFromHeader(authHeader);
    if (token) {
      const authResult = await verifyAuthToken(token).catch(() => null);
      if (authResult?.success && authResult.userId) {
        creatorUserId = String(authResult.userId);
        try {
          const referralCode = await ensureUserReferralCode({
            userId: creatorUserId,
            userEmail:
              typeof authResult.user?.email === "string"
                ? authResult.user.email
                : null,
            region: authResult.region,
          });
          creatorReferralCode = referralCode || null;
        } catch (error) {
          console.warn("[/api/share/text] ensure referral code failed:", error);
        }
      }
    }

    const db = getDatabase();
    await ensureShareTextCollection(db);
    await db.collection(COLLECTION).doc(id).set({
      content,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      creatorUserId,
      creatorReferralCode,
    });

    const payload: Record<string, unknown> = {
      success: true,
      id,
      expiresAt: expiresAt.toISOString(),
    };
    if (creatorReferralCode) {
      payload.shareCode = creatorReferralCode;
    }

    return jsonNoStore(payload);
  } catch (error) {
    console.error("[/api/share/text] create failed:", error);
    return jsonNoStore({ success: false, error: "create failed" }, 500);
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";

  if (!id || !SHARE_ID_PATTERN.test(id)) {
    return jsonNoStore({ success: false, error: "invalid id" }, 400);
  }

  try {
    const db = getDatabase();
    await ensureShareTextCollection(db);
    const result = await db.collection(COLLECTION).doc(id).get();
    const record = result?.data?.[0] as
      | {
          content?: unknown;
          expiresAt?: unknown;
          creatorReferralCode?: unknown;
        }
      | undefined;

    if (!record) {
      return jsonNoStore({ success: false, error: "not found" }, 404);
    }

    const expiresAt =
      typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : NaN;
    if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
      return jsonNoStore({ success: false, error: "expired" }, 410);
    }

    const content = typeof record.content === "string" ? record.content : "";
    if (!content) {
      return jsonNoStore({ success: false, error: "not found" }, 404);
    }
    const shareCode =
      typeof record.creatorReferralCode === "string" &&
      SHARE_CODE_PATTERN.test(record.creatorReferralCode)
        ? record.creatorReferralCode
        : undefined;

    return jsonNoStore({ success: true, content, shareCode });
  } catch (error) {
    console.error("[/api/share/text] fetch failed:", error);
    return jsonNoStore({ success: false, error: "fetch failed" }, 500);
  }
}
