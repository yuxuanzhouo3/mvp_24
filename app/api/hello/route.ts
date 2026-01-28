import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/cloudbase-service";

export async function GET(request: NextRequest) {
  try {
    console.log("🔌 初始化CloudBase连接...");

    console.log("📊 连接到MySQL数据库...");
    const db = getDatabase();

    console.log("🔍 查询todos表...");
    const { data } = await db.from("todos").select("*");

    console.log("✅ 查询成功:", data?.length || 0, "条记录");

    return NextResponse.json({
      data,
      success: true,
      message: `查询成功，获取到 ${data?.length || 0} 条记录`,
    });
  } catch (error: any) {
    console.error("❌ API错误:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
