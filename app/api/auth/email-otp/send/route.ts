import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isChinaRegion } from "@/lib/config/region";
import { sendEmailOtp } from "@/lib/email-otp";
import { getCloudBaseApp } from "@/lib/cloudbase/init";

const schema = z.object({
  email: z.string().email("Invalid email"),
  purpose: z.enum(["signup", "password_reset"]),
});

export async function POST(request: NextRequest) {
  try {
    if (!isChinaRegion()) {
      return NextResponse.json(
        { success: false, error: "Only supported in China region" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { email, purpose } = parsed.data;

    const app = getCloudBaseApp();
    const db = app.database();

    const userResult = await db
      .collection("web_users")
      .where({ email })
      .limit(1)
      .get();

    const exists = (userResult?.data?.length || 0) > 0;

    if (purpose === "signup" && exists) {
      return NextResponse.json(
        { success: false, error: "该邮箱已被注册", code: "EMAIL_EXISTS" },
        { status: 409 }
      );
    }

    if (purpose === "password_reset" && !exists) {
      return NextResponse.json(
        { success: false, error: "该邮箱尚未注册", code: "EMAIL_NOT_FOUND" },
        { status: 404 }
      );
    }

    const result = await sendEmailOtp(email, purpose);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "发送验证码失败",
          code: result.code,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        { status: result.code === "TOO_FREQUENT" ? 429 : 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "发送验证码失败",
      },
      { status: 500 }
    );
  }
}
