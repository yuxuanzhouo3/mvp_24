import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { apiRateLimit } from "@/lib/rate-limit";
import { logBusinessEvent, logError } from "@/lib/logger";
import { requireAuth, createAuthErrorResponse } from "@/lib/auth";
import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { getAddonPackageById } from "@/constants/addon-packages";

// GET /api/payment/history?page=1&pageSize=20
// Requires Authorization: Bearer <supabase access token>
export async function GET(request: NextRequest) {
  return new Promise<NextResponse>((resolve) => {
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => resolve(NextResponse.json(data, { status: code })),
      }),
      setHeader: () => {},
      getHeader: () => undefined,
    };

    apiRateLimit(request as any, mockRes as any, async () => {
      resolve(await handlePaymentHistory(request));
    });
  });
}

async function handlePaymentHistory(request: NextRequest) {
  const operationId = `payment_history_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }

    const { user } = authResult;
    const accessToken = authResult.session?.access_token;
    const userId = user.id;

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") || "20", 10), 1),
      100
    );
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    logBusinessEvent("payment_history_requested", userId, {
      operationId,
      page,
      pageSize,
      from,
      to,
    });

    let payments: any[] = [];
    let queryError: any = null;

    if (isChinaRegion()) {
      try {
        const db = getDatabase();
        const result = await db
          .collection("payments")
          .where({ user_id: userId })
          .orderBy("created_at", "desc")
          .skip(from)
          .limit(pageSize)
          .get();

        payments = result.data || [];
      } catch (error) {
        queryError = error;
      }
    } else {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        logError(
          "payment_history_config_error",
          new Error("Missing Supabase environment variables"),
          {
            operationId,
          }
        );
        return NextResponse.json(
          { error: "Server misconfigured: missing Supabase env" },
          { status: 500 }
        );
      }

      const supabase = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            Authorization: accessToken
              ? `Bearer ${accessToken}`
              : "",
          },
        },
      });

      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      payments = data || [];
      queryError = error;
    }

    if (queryError) {
      logError(
        "payment_history_fetch_error",
        queryError instanceof Error
          ? queryError
          : new Error(String(queryError)),
        {
          operationId,
          userId,
          page,
          pageSize,
        }
      );
      return NextResponse.json(
        { error: "Failed to fetch billing history" },
        { status: 500 }
      );
    }

    const records = (payments || []).map((p: any) => {
      let uiStatus: "paid" | "pending" | "failed" | "refunded" = "pending";
      switch (p.status) {
        case "completed":
          uiStatus = "paid";
          break;
        case "failed":
          uiStatus = "failed";
          break;
        case "refunded":
          uiStatus = "refunded";
          break;
        default:
          uiStatus = "pending";
      }

      const method = (p.payment_method || "").toString().toLowerCase();
      const paymentMethod =
        method === "stripe"
          ? "Stripe"
          : method === "paypal"
          ? "PayPal"
          : method === "alipay"
          ? "Alipay"
          : method === "wechat"
          ? "WeChat"
          : method || "";

      const productType = String(
        p.type || p.metadata?.productType || "SUBSCRIPTION"
      ).toUpperCase();
      const addonPackageId = p.addon_package_id || p.metadata?.addonPackageId;
      const addonPkg = addonPackageId ? getAddonPackageById(addonPackageId) : undefined;

      const description =
        productType === "ADDON"
          ? addonPkg
            ? addonPkg.nameZh
            : "Addon package"
          : "Subscription payment";

      return {
        id: p._id || p.id,
        date: p.created_at || p.createdAt,
        amount: Number(p.amount),
        currency: p.currency || "USD",
        status: uiStatus,
        description,
        paymentMethod,
        invoiceUrl: null as string | null,
      };
    });

    logBusinessEvent("payment_history_returned", userId, {
      operationId,
      page,
      pageSize,
      recordCount: records.length,
    });

    return NextResponse.json({
      page,
      pageSize,
      count: records.length,
      records,
    });
  } catch (err) {
    logError(
      "payment_history_handler_error",
      err instanceof Error ? err : new Error(String(err)),
      {
        operationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
