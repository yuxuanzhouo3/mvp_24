import { NextResponse } from "next/server";
import { getPaymentProductCatalog } from "@/lib/payment-product-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getPaymentProductCatalog();
  return NextResponse.json({ success: true, data });
}
