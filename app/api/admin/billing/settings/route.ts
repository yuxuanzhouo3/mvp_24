import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getBillingSettings, upsertBillingSettings } from "@/lib/billing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }

  const data = await getBillingSettings(session.region);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const result = await upsertBillingSettings({ ...body, region: session.region });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || "保存失败" }, { status: 500 });
  }

  const data = await getBillingSettings(session.region);
  return NextResponse.json({ success: true, data });
}
