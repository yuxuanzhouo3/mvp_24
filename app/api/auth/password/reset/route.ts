import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isChinaRegion } from "@/lib/config/region";
import { getCloudBaseApp } from "@/lib/cloudbase/init";
import { verifyEmailOtp } from "@/lib/email-otp";
import bcrypt from "bcryptjs";

const schema = z
  .object({
    email: z.string().email("Invalid email"),
    otp: z.string().min(4).max(8),
    newPassword: z.string().min(6, "Password must be at least 6 chars"),
    confirmPassword: z.string().min(6),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
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

    const { email, otp, newPassword } = parsed.data;

    const verifyResult = await verifyEmailOtp(email, "password_reset", otp);
    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verifyResult.error || "验证码无效",
          code: verifyResult.code,
          retryAfterSeconds: verifyResult.retryAfterSeconds,
        },
        { status: verifyResult.code === "TOO_MANY_ATTEMPTS" ? 429 : 400 }
      );
    }

    const app = getCloudBaseApp();
    const db = app.database();

    const userResult = await db
      .collection("web_users")
      .where({ email })
      .limit(1)
      .get();

    const user = userResult?.data?.[0];
    if (!user?._id) {
      return NextResponse.json(
        { success: false, error: "用户不存在" },
        { status: 404 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.collection("web_users").doc(user._id).update({
      password: hashedPassword,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "重置密码失败",
      },
      { status: 500 }
    );
  }
}
