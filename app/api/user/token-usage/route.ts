import { NextRequest, NextResponse } from "next/server";
import { extractTokenFromHeader, verifyAuthToken } from "@/lib/auth-utils";
import { getUserUsageStats } from "@/lib/ai/token-counter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_COST_CNY = 275 / 100000000;
const TARGET_REVENUE_MULTIPLIER = 1.5;

function resolveMonthRange(monthParam?: string | null): {
  month: string;
  start: Date;
  end: Date;
} {
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();

  const normalized = typeof monthParam === "string" ? monthParam.trim() : "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
    const [y, m] = normalized.split("-");
    year = Number(y);
    monthIndex = Number(m) - 1;
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - 1);
  const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return { month, start, end };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return NextResponse.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || "Unauthorized" },
        { status: 401 }
      );
    }

    const { month, start, end } = resolveMonthRange(
      req.nextUrl.searchParams.get("month")
    );

    const stats = await getUserUsageStats(authResult.userId, start, end);
    if (!stats) {
      return NextResponse.json(
        { error: "Failed to load token usage stats" },
        { status: 500 }
      );
    }

    const estimatedCostCnyRaw = stats.totalTokens * TOKEN_COST_CNY;
    const targetRevenueCnyRaw = estimatedCostCnyRaw * TARGET_REVENUE_MULTIPLIER;
    const targetProfitCnyRaw = targetRevenueCnyRaw - estimatedCostCnyRaw;

    return NextResponse.json({
      month,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      totals: {
        requests: stats.totalRequests,
        tokens: stats.totalTokens,
        costUsd: Number(stats.totalCost.toFixed(6)),
      },
      economics: {
        tokenCostCny: TOKEN_COST_CNY,
        targetRevenueMultiplier: TARGET_REVENUE_MULTIPLIER,
        estimatedCostCny: Number(estimatedCostCnyRaw.toFixed(6)),
        targetRevenueCny: Number(targetRevenueCnyRaw.toFixed(6)),
        targetProfitCny: Number(targetProfitCnyRaw.toFixed(6)),
      },
      byModel: stats.byModel,
    });
  } catch (error) {
    console.error("[/api/user/token-usage] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
