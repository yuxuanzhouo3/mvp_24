import { NextRequest, NextResponse } from "next/server"
import {
  REFERRAL_ATTRIBUTION_COOKIE,
  REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS,
  encodeReferralAttributionCookie,
  getClientIpFromRequest,
  recordReferralClick,
  resolveReferralOwnerByShareCode,
} from "@/lib/market/referrals"

export const runtime = "nodejs"

function normalizeOrigin(rawValue: string | null | undefined) {
  const raw = String(rawValue || "").trim()
  if (!raw) return ""

  try {
    const parsed = new URL(raw)
    return parsed.origin
  } catch {
    return ""
  }
}

function isLocalOrigin(rawOrigin: string) {
  const origin = normalizeOrigin(rawOrigin)
  if (!origin) return false

  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    if (hostname === "localhost") return true
    if (hostname === "0.0.0.0") return true
    if (hostname === "::1" || hostname === "[::1]") return true
    if (hostname.startsWith("127.")) return true
    return false
  } catch {
    return false
  }
}

function resolveRequestOrigin(request: NextRequest) {
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim().toLowerCase()
  const forwardedHost = String(request.headers.get("x-forwarded-host") || "").split(",")[0]?.trim()

  const forwardedOrigin = forwardedHost
    ? normalizeOrigin(`${forwardedProto || "https"}://${forwardedHost}`)
    : ""

  const requestOrigin = normalizeOrigin(request.nextUrl.origin)
  const siteOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL)

  const preferred = [forwardedOrigin, requestOrigin, siteOrigin].find((value) => value && !isLocalOrigin(value))
  if (preferred) return preferred

  return forwardedOrigin || requestOrigin || siteOrigin || "http://localhost:3000"
}

function normalizeTargetPath(rawValue: string | null, fallbackPath: string) {
  const raw = String(rawValue || "").trim()
  if (!raw) return fallbackPath

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw
  }

  try {
    const parsed = new URL(raw)
    return `${parsed.pathname}${parsed.search || ""}`
  } catch {
    return fallbackPath
  }
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      shareCode: string
    }>
  },
) {
  try {
    const requestOrigin = resolveRequestOrigin(request)
    const params = await context.params
    const shareCode = String(params?.shareCode || "").trim()
    if (!shareCode) {
      return NextResponse.redirect(new URL("/", requestOrigin))
    }

    const referralOwner = await resolveReferralOwnerByShareCode(shareCode)
    if (!referralOwner?.isActive || !referralOwner?.creatorUserId) {
      return NextResponse.redirect(new URL("/", requestOrigin))
    }

    const source = String(request.nextUrl.searchParams.get("source") || referralOwner.sourceDefault || "").trim()
    const fallbackPath = referralOwner.toolSlug ? `/tools/${encodeURIComponent(referralOwner.toolSlug)}` : "/"
    const targetPath = normalizeTargetPath(request.nextUrl.searchParams.get("to"), fallbackPath)
    const targetUrl = new URL(targetPath, requestOrigin)
    targetUrl.searchParams.set("ref", referralOwner.shareCode)
    if (source) {
      targetUrl.searchParams.set("source", source)
    }

    const toolSlug = targetUrl.pathname.startsWith("/tools/")
      ? String(targetUrl.pathname.split("/")[2] || "").trim().toLowerCase()
      : null

    await recordReferralClick({
      shareCode: referralOwner.shareCode,
      source,
      ip: getClientIpFromRequest(request),
      userAgent: request.headers.get("user-agent") || null,
      landingPath: `${targetUrl.pathname}${targetUrl.search}`,
    }).catch(() => null)

    const response = NextResponse.redirect(targetUrl)
    response.cookies.set({
      name: REFERRAL_ATTRIBUTION_COOKIE,
      value: encodeReferralAttributionCookie({
        shareCode: referralOwner.shareCode,
        source: source || null,
        toolSlug,
        ts: Date.now(),
      }),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS,
    })
    return response
  } catch {
    return NextResponse.redirect(new URL("/", resolveRequestOrigin(request)))
  }
}
