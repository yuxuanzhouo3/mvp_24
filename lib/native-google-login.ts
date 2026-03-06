"use client"

import { hasNativeGoogleSignInBridge, signInWithGoogle } from "@/lib/google-signin-bridge"
import { getSupabaseClient } from "@/lib/supabase"

const DEFAULT_TIMEOUT_MS = 60_000
type NativeGoogleLoginFailureReason =
  | "cancelled"
  | "timeout"
  | "bridge_unavailable"
  | "not_android_webview"
  | "native_error"
type NativeGoogleLoginResult =
  | { success: true; user: any }
  | { success: false; reason: NativeGoogleLoginFailureReason; error?: string }

type SupabaseSessionPayload = {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  token_type?: string
  user?: any
}

function isAndroidWebView(): boolean {
  if (typeof window === "undefined") return false
  const ua = window.navigator.userAgent || ""
  return /Android/i.test(ua) && /; wv\)|Version\/\d+\.\d+.*Chrome\//i.test(ua)
}

async function loadNativeGoogleWebClientId(): Promise<string> {
  try {
    const response = await fetch("/api/auth/native-google-config", {
      method: "GET",
      cache: "no-store",
    })

    if (!response.ok) return ""

    const json = await response.json()
    return String(json?.clientId || "").trim()
  } catch {
    return ""
  }
}

function shouldFallbackToServerExchange(errorText: string): boolean {
  return /failed to fetch|networkerror|load failed|ssl|handshake|connection|fetch/i.test(
    errorText
  )
}

function getSupabaseStorageKey(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const host = new URL(url).host
    const projectRef = host.split(".")[0]
    if (!projectRef) return null
    return `sb-${projectRef}-auth-token`
  } catch {
    return null
  }
}

function persistSupabaseSession(session: SupabaseSessionPayload) {
  if (typeof window === "undefined") return
  const storageKey = getSupabaseStorageKey()
  if (!storageKey) return

  const normalizedSession = {
    ...session,
    token_type: session.token_type || "bearer",
  }

  localStorage.setItem(storageKey, JSON.stringify(normalizedSession))
}

async function signInSupabaseWithGoogleIdTokenViaServer(idToken: string) {
  const response = await fetch("/api/auth/native-google-signin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ idToken }),
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || "Native Google server exchange failed"))
  }

  const session = (json?.session || {}) as SupabaseSessionPayload
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("Native Google server exchange returned invalid session")
  }

  persistSupabaseSession(session)
  return json?.user || session.user
}

async function signInSupabaseWithGoogleIdToken(idToken: string) {
  try {
    const { data, error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    })

    if (error) {
      const message = error.message || "Native Google token sign-in failed"
      if (shouldFallbackToServerExchange(message)) {
        return await signInSupabaseWithGoogleIdTokenViaServer(idToken)
      }
      throw new Error(message)
    }

    if (!data?.user) {
      throw new Error("No user returned from native Google token sign-in")
    }

    return data.user
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "")
    if (shouldFallbackToServerExchange(message)) {
      return await signInSupabaseWithGoogleIdTokenViaServer(idToken)
    }
    throw error instanceof Error ? error : new Error(message || "Native Google token sign-in failed")
  }
}

function mapNativeErrorReason(errorText: string): "cancelled" | "timeout" | "native_error" {
  if (/cancel/i.test(errorText)) {
    return "cancelled"
  }
  if (/timeout/i.test(errorText)) {
    return "timeout"
  }
  return "native_error"
}

async function signInViaGoogleJavascriptInterface(input: { webClientId: string; timeoutMs: number }): Promise<NativeGoogleLoginResult> {
  try {
    const bridgeResult = await signInWithGoogle(input.webClientId, input.timeoutMs)

    if (!bridgeResult.success) {
      const errorText = String(bridgeResult.error || "")
      return {
        success: false,
        reason: mapNativeErrorReason(errorText),
        error: errorText || "Native Google login failed",
      }
    }

    const idToken = String(bridgeResult.idToken || "")
    if (!idToken) {
      return { success: false, reason: "native_error", error: "Native Google idToken is missing" }
    }

    const user = await signInSupabaseWithGoogleIdToken(idToken)
    return { success: true, user }
  } catch (error: unknown) {
    const errorText = error instanceof Error ? error.message : String(error || "")
    const reason = mapNativeErrorReason(errorText)
    return {
      success: false,
      reason,
      error:
        errorText ||
        (reason === "timeout" ? "Native Google login timeout" : "Native Google login failed"),
    }
  }
}

export async function signInWithNativeGoogleBridge(input?: { timeoutMs?: number }) {
  const timeoutMs = input?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!isAndroidWebView()) {
    return { success: false as const, reason: "not_android_webview" as const }
  }

  if (!hasNativeGoogleSignInBridge()) {
    return { success: false as const, reason: "bridge_unavailable" as const }
  }

  const webClientId = await loadNativeGoogleWebClientId()
  return signInViaGoogleJavascriptInterface({ webClientId, timeoutMs })
}
