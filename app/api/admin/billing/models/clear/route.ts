import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getDatabase } from "@/lib/cloudbase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }

  if (session.region !== "CN") {
    return NextResponse.json({ success: false, error: "仅国内版支持此操作" }, { status: 400 });
  }

  try {
    const db = getDatabase();
    const result = await db.collection("ai_model_catalog").where({ region: "CN" }).limit(1000).get();

    let deleted = 0;
    for (const doc of result.data || []) {
      await db.collection("ai_model_catalog").doc(doc._id).remove();
      deleted++;
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "清空失败" },
      { status: 500 }
    );
  }
}
