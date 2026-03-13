import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import {
  OPENROUTER_SORT_ORDERS,
  fetchOpenRouterBillingImportItems,
  type OpenRouterSortOrder,
} from "@/lib/importers/openrouter";
import { listModelCatalogEntries, upsertModelCatalogEntries } from "@/lib/billing/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveOrder(value: string | null): OpenRouterSortOrder {
  return OPENROUTER_SORT_ORDERS.includes(value as OpenRouterSortOrder)
    ? (value as OpenRouterSortOrder)
    : "newest";
}

function resolveLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function ensureIntl(session: Awaited<ReturnType<typeof getAdminSession>>) {
  if (!session) {
    return NextResponse.json({ success: false, error: "未授权访问" }, { status: 401 });
  }
  if (session.region !== "INTL") {
    return NextResponse.json({ success: false, error: "仅国际版后台支持 OpenRouter 导入" }, { status: 400 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  const invalid = ensureIntl(session);
  if (invalid) return invalid;

  try {
    const { searchParams } = new URL(req.url);
    const order = resolveOrder(searchParams.get("order"));
    const limit = resolveLimit(searchParams.get("limit"));
    const data = await fetchOpenRouterBillingImportItems({ order, limit });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "OpenRouter 抓取失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  const invalid = ensureIntl(session);
  if (invalid) return invalid;

  try {
    const body = await req.json().catch(() => null);
    const order = resolveOrder(body?.order ?? null);
    const limit = resolveLimit(body?.limit != null ? String(body.limit) : null);
    const fetched = await fetchOpenRouterBillingImportItems({ order, limit });
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
        order: fetched.order,
        imported: fetched.items.length,
        totalAvailable: fetched.totalAvailable,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "OpenRouter 导入失败" },
      { status: 500 }
    );
  }
}
