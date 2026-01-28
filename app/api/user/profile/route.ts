import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/adapter";

/**
 * GET /api/user/profile
 * 获取用户资料（从 web_users 表）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    // 从 web_users 表获取用户资料
    const profile = await db.getById("web_users", userId);

    if (!profile) {
      return NextResponse.json(null);
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Get profile error:", error);

    // 如果是数据库认证错误，返回 null 而不是错误
    if (error instanceof Error && error.message.includes("数据库认证失败")) {
      console.warn("⚠️ 数据库认证失败，返回 null");
      return NextResponse.json(null);
    }

    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/profile
 * 创建或更新用户资料（到 web_users 表）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...profileData } = body;

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const db = getDatabase();

    // 尝试获取现有用户资料
    const existing = await db.getById("web_users", id);

    if (existing) {
      // 更新 web_users 表中的用户记录
      const updated = await db.update("web_users", id, profileData);
      return NextResponse.json(updated);
    } else {
      // 创建新记录（注意：web_users 通常已经存在，这个分支可能不会执行）
      const created = await db.insert("web_users", { id, ...profileData });
      return NextResponse.json(created);
    }
  } catch (error) {
    console.error("Save profile error:", error);

    // 如果是数据库认证错误，返回适当的错误信息
    if (error instanceof Error && error.message.includes("数据库认证失败")) {
      return NextResponse.json(
        {
          error:
            "Database authentication failed. Please configure valid Tencent Cloud credentials.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 500 }
    );
  }
}
