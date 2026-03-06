import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"

async function loadClientIdFromAndroidAppConfig() {
  try {
    const appConfigPath = path.join(
      process.cwd(),
      "multigptandroid-intl",
      "app",
      "src",
      "main",
      "assets",
      "appConfig.json"
    )
    const raw = await readFile(appConfigPath, "utf8")
    const json = JSON.parse(raw) as {
      services?: { nativeGoogleWebClientId?: unknown }
    }
    const clientId = json?.services?.nativeGoogleWebClientId
    return typeof clientId === "string" ? clientId.trim() : ""
  } catch {
    return ""
  }
}

export async function GET() {
  const envClientId =
    process.env.NATIVE_GOOGLE_WEB_CLIENT_ID ||
    process.env.NEXT_PUBLIC_NATIVE_GOOGLE_WEB_CLIENT_ID ||
    ""
  const configClientId = envClientId ? "" : await loadClientIdFromAndroidAppConfig()
  const clientId = envClientId || configClientId || ""

  return NextResponse.json(
    {
      success: true,
      clientId,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  )
}
