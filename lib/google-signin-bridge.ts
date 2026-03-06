"use client"

export interface GoogleSignInResult {
  success: boolean
  idToken?: string
  email?: string
  displayName?: string
  error?: string
}

interface GoogleSignInBridge {
  signIn(clientId: string, callback: string): void
  signOut(callback: string): void
  getCurrentUser(): string | null
}

declare global {
  interface Window {
    GoogleSignIn?: GoogleSignInBridge
  }
}

const DEFAULT_TIMEOUT_MS = 60_000

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function normalizeResult(raw: unknown): GoogleSignInResult {
  let payload: unknown = raw

  if (typeof payload === "string") {
    const rawText = payload
    try {
      payload = JSON.parse(payload)
    } catch {
      return { success: false, error: rawText || "Invalid Google Sign-In response" }
    }
  }

  if (!payload || typeof payload !== "object") {
    return { success: false, error: "Invalid Google Sign-In response" }
  }

  const result = payload as Record<string, unknown>

  return {
    success: Boolean(result.success),
    idToken: toOptionalString(result.idToken),
    email: toOptionalString(result.email),
    displayName: toOptionalString(result.displayName),
    error: toOptionalString(result.error),
  }
}

export function hasNativeGoogleSignInBridge(): boolean {
  return typeof window !== "undefined" && typeof window.GoogleSignIn?.signIn === "function"
}

export function signInWithGoogle(clientId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<GoogleSignInResult> {
  return new Promise((resolve, reject) => {
    if (!hasNativeGoogleSignInBridge()) {
      reject(new Error("GoogleSignIn bridge is not available"))
      return
    }

    const callbackName = `googleSignInCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const callbackStore = window as unknown as Record<string, unknown>
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      delete callbackStore[callbackName]
    }

    const finish = (result: GoogleSignInResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    callbackStore[callbackName] = (nativeResult: unknown) => {
      finish(normalizeResult(nativeResult))
    }

    timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error("Native Google login timeout"))
    }, timeoutMs)

    try {
      window.GoogleSignIn!.signIn(clientId, callbackName)
    } catch (error) {
      cleanup()
      reject(error instanceof Error ? error : new Error("Failed to invoke GoogleSignIn bridge"))
    }
  })
}

export function signOutGoogle(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!hasNativeGoogleSignInBridge()) {
      reject(new Error("GoogleSignIn bridge is not available"))
      return
    }

    const callbackName = `googleSignOutCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const callbackStore = window as unknown as Record<string, unknown>
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      delete callbackStore[callbackName]
    }

    callbackStore[callbackName] = (nativeResult: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      const result = normalizeResult(nativeResult)
      if (result.success) {
        resolve()
        return
      }
      reject(new Error(result.error || "Native Google sign-out failed"))
    }

    timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error("Native Google sign-out timeout"))
    }, timeoutMs)

    try {
      window.GoogleSignIn!.signOut(callbackName)
    } catch (error) {
      cleanup()
      reject(error instanceof Error ? error : new Error("Failed to invoke GoogleSignIn bridge"))
    }
  })
}

export function getCurrentGoogleUser(): GoogleSignInResult | null {
  if (!hasNativeGoogleSignInBridge()) {
    return null
  }

  try {
    const json = window.GoogleSignIn?.getCurrentUser()
    if (!json) return null
    return normalizeResult(json)
  } catch {
    return null
  }
}
