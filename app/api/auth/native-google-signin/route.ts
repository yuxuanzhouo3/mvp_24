import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""

  return { url: url.trim(), key: key.trim() }
}

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json().catch(() => ({}))) as {
      idToken?: unknown
    }

    const token = typeof idToken === "string" ? idToken.trim() : ""
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing Google idToken" },
        { status: 400 }
      )
    }

    const { url, key } = getSupabaseConfig()
    if (!url || !key) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase environment is missing (NEXT_PUBLIC_SUPABASE_URL and key).",
        },
        { status: 500 }
      )
    }

    const supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token,
    })

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Native Google token sign-in failed",
        },
        { status: 400 }
      )
    }

    if (!data?.session || !data.user) {
      return NextResponse.json(
        { success: false, error: "No session returned from Supabase" },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        session: data.session,
        user: data.user,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
