import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { listModelCatalogEntries, upsertModelCatalogEntries } from "@/lib/billing/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }

  const data = await listModelCatalogEntries(session.region);
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null;
  if (!items) {
    return NextResponse.json({ success: false, error: "JSON must be an array or { items: [] }" }, { status: 400 });
  }

  const result = await upsertModelCatalogEntries(items, session.region);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || "保存失败" }, { status: 500 });
  }

  const data = await listModelCatalogEntries(session.region);
  return NextResponse.json({ success: true, data });
}
