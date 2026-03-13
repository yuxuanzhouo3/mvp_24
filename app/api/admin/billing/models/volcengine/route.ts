import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import {
  deleteModelCatalogEntriesByProvider,
  listModelCatalogEntries,
  upsertModelCatalogEntries,
} from "@/lib/billing/catalog";
import { fetchVolcengineBillingImportItems } from "@/lib/importers/volcengine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function ensureCn(session: Awaited<ReturnType<typeof getAdminSession>>) {
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }
  if (session.region !== "CN") {
    return NextResponse.json({ success: false, error: "仅国内版后台支持火山引擎导入" }, { status: 400 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  const invalid = ensureCn(session);
  if (invalid) return invalid;

  try {
    const { searchParams } = new URL(req.url);
    const limit = resolveLimit(searchParams.get("limit"));
    const data = await fetchVolcengineBillingImportItems({ limit });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "火山引擎抓取失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  const invalid = ensureCn(session);
  if (invalid) return invalid;

  try {
    const body = await req.json().catch(() => null);
    const limit = resolveLimit(body?.limit != null ? String(body.limit) : null);
    const requestedItems = Array.isArray(body?.items) ? body.items : null;
    const fetched = requestedItems
      ? {
          fetchedAt: new Date().toISOString(),
          totalAvailable: requestedItems.length,
          returned: requestedItems.length,
          sourcePageUrl: "manual-selection",
          items: requestedItems,
        }
      : await fetchVolcengineBillingImportItems({ limit });

    const deleteResult = await deleteModelCatalogEntriesByProvider("volcengine", session!.region);
    if (!deleteResult.success) {
      return NextResponse.json(
        { success: false, error: deleteResult.error || "清理旧火山模型失败" },
        { status: 500 }
      );
    }

    const result = await upsertModelCatalogEntries(fetched.items, session!.region);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "保存失败" }, { status: 500 });
    }
    const data = await listModelCatalogEntries(session!.region);
    return NextResponse.json({
      success: true,
      data,
      meta: {
        fetchedAt: fetched.fetchedAt,
        imported: fetched.items.length,
        totalAvailable: fetched.totalAvailable,
        deleted: deleteResult.deleted,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "火山引擎导入失败" },
      { status: 500 }
    );
  }
}
