import { ADDON_PACKAGES } from "@/constants/addon-packages";
import { pricingPlans } from "@/constants/pricing";
import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BillingRegion } from "@/lib/billing/types";
import type { BillingCycle } from "@/lib/payment-config";

const COLLECTION = "payment_product_catalog";
const SUBSCRIPTION_PLAN_IDS = ["basic", "pro", "enterprise"] as const;

type ProductType = "SUBSCRIPTION" | "ADDON";

export interface PaymentProductEntry {
  productKey: string;
  region: BillingRegion;
  productType: ProductType;
  planId?: string | null;
  addonPackageId?: string | null;
  billingCycle?: BillingCycle | null;
  currency: string;
  amount: number;
  metadata?: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface PaymentProductCatalog {
  region: BillingRegion;
  currency: string;
  subscriptions: Record<string, { monthly: number; yearly: number }>;
  addons: Record<string, { amount: number; imageCredits: number; videoAudioCredits: number }>;
  entries: PaymentProductEntry[];
}

function currentRegion(): BillingRegion {
  return isChinaRegion() ? "CN" : "INTL";
}

function defaultCurrencyByRegion(region: BillingRegion) {
  return region === "CN" ? "CNY" : "USD";
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parsePriceLabel(value: string | undefined): number {
  const parsed = Number(String(value || "0").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProductKey(input: {
  productType: ProductType;
  planId?: string | null;
  addonPackageId?: string | null;
  billingCycle?: BillingCycle | null;
}) {
  if (input.productType === "SUBSCRIPTION") {
    return `subscription:${String(input.planId || "").toLowerCase()}:${input.billingCycle || "monthly"}`;
  }
  return `addon:${String(input.addonPackageId || "").toLowerCase()}`;
}

function getDefaultEntries(region: BillingRegion = currentRegion()): PaymentProductEntry[] {
  const currency = defaultCurrencyByRegion(region);
  const subscriptionEntries = pricingPlans
    .filter((plan) => SUBSCRIPTION_PLAN_IDS.includes(plan.id.toLowerCase() as (typeof SUBSCRIPTION_PLAN_IDS)[number]))
    .flatMap((plan) => {
      const monthlyAmount = region === "CN" ? parsePriceLabel(plan.priceZh) : parsePriceLabel(plan.price);
      const yearlyAmount = region === "CN" ? parsePriceLabel(plan.annualPriceZh) : parsePriceLabel(plan.annualPrice);
      return [
        {
          productKey: toProductKey({ productType: "SUBSCRIPTION", planId: plan.id, billingCycle: "monthly" }),
          region,
          productType: "SUBSCRIPTION" as const,
          planId: plan.id.toLowerCase(),
          billingCycle: "monthly" as const,
          currency,
          amount: monthlyAmount,
          metadata: {},
        },
        {
          productKey: toProductKey({ productType: "SUBSCRIPTION", planId: plan.id, billingCycle: "yearly" }),
          region,
          productType: "SUBSCRIPTION" as const,
          planId: plan.id.toLowerCase(),
          billingCycle: "yearly" as const,
          currency,
          amount: yearlyAmount,
          metadata: {},
        },
      ];
    });

  const addonEntries = ADDON_PACKAGES.map((pkg) => ({
    productKey: toProductKey({ productType: "ADDON", addonPackageId: pkg.id }),
    region,
    productType: "ADDON" as const,
    addonPackageId: pkg.id,
    billingCycle: null,
    currency,
    amount: region === "CN" ? pkg.priceZh : pkg.price,
    metadata: {
      imageCredits: pkg.imageCredits,
      videoAudioCredits: pkg.videoAudioCredits,
    },
  }));

  return [...subscriptionEntries, ...addonEntries];
}

function buildEntry(row: any, fallback: PaymentProductEntry): PaymentProductEntry {
  return {
    productKey:
      typeof (row?.product_key ?? row?.productKey) === "string"
        ? String(row?.product_key ?? row?.productKey)
        : fallback.productKey,
    region:
      (typeof row?.region === "string" ? row.region : fallback.region) || fallback.region,
    productType:
      String((row?.product_type ?? row?.productType) || fallback.productType).toUpperCase() === "ADDON"
        ? "ADDON"
        : "SUBSCRIPTION",
    planId:
      typeof (row?.plan_id ?? row?.planId) === "string"
        ? String(row?.plan_id ?? row?.planId).toLowerCase()
        : fallback.planId || null,
    addonPackageId:
      typeof (row?.addon_package_id ?? row?.addonPackageId) === "string"
        ? String(row?.addon_package_id ?? row?.addonPackageId)
        : fallback.addonPackageId || null,
    billingCycle:
      row?.billing_cycle === "yearly" || row?.billingCycle === "yearly"
        ? "yearly"
        : row?.billing_cycle === "monthly" || row?.billingCycle === "monthly"
          ? "monthly"
          : fallback.billingCycle || null,
    currency:
      typeof row?.currency === "string"
        ? String(row.currency).toUpperCase()
        : fallback.currency,
    amount: Math.max(0, toNumber(row?.amount, fallback.amount)),
    metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : fallback.metadata || {},
    updatedAt:
      typeof (row?.updated_at ?? row?.updatedAt) === "string"
        ? String(row?.updated_at ?? row?.updatedAt)
        : fallback.updatedAt || null,
  };
}

function mergeWithDefaults(rows: PaymentProductEntry[] | null, region: BillingRegion): PaymentProductEntry[] {
  const defaults = getDefaultEntries(region);
  const merged = new Map(defaults.map((item) => [item.productKey, item]));
  for (const row of rows || []) {
    const fallback = merged.get(row.productKey);
    if (!fallback) continue;
    merged.set(row.productKey, { ...fallback, ...row });
  }
  return defaults.map((item) => merged.get(item.productKey) || item);
}

function missingCloudbaseCollection(error: any) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    message.includes("Db or Table not exist") ||
    message.includes("DATABASE_COLLECTION_NOT_EXIST") ||
    code.includes("DATABASE_COLLECTION_NOT_EXIST")
  );
}

function missingSupabaseTable(error: any, tableName: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "PGRST205" &&
    message.includes(`'public.${tableName}'`)
  );
}

async function ensureCollection() {
  const db = getDatabase();
  try {
    await db.collection(COLLECTION).limit(1).get();
  } catch (error: any) {
    if (!missingCloudbaseCollection(error)) throw error;
    await db.createCollection(COLLECTION);
  }
}

export async function listPaymentProductEntries(
  region: BillingRegion = currentRegion()
): Promise<PaymentProductEntry[]> {
  const defaults = getDefaultEntries(region);

  if (isChinaRegion()) {
    try {
      const db = getDatabase();
      const result = await db.collection(COLLECTION).where({ region }).limit(100).get();
      const rows = Array.isArray(result?.data) ? result.data : [];
      return mergeWithDefaults(
        rows
          .map((row: any) => {
            const key = String(row?.product_key ?? row?.productKey ?? "");
            const fallback = defaults.find((item) => item.productKey === key);
            return fallback ? buildEntry(row, fallback) : null;
          })
          .filter((item: PaymentProductEntry | null): item is PaymentProductEntry => item !== null),
        region
      );
    } catch (error: any) {
      if (!missingCloudbaseCollection(error)) {
        console.error("[payment-products] CloudBase list failed:", error);
      }
      return defaults;
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("payment_product_catalog")
      .select("*")
      .eq("region", region)
      .order("product_key", { ascending: true });
    if (error) {
      if (!missingSupabaseTable(error, "payment_product_catalog")) {
        console.error("[payment-products] Supabase list failed:", error);
      }
      return defaults;
    }

    return mergeWithDefaults(
      (data || [])
        .map((row: any) => {
          const key = String(row?.product_key ?? row?.productKey ?? "");
          const fallback = defaults.find((item) => item.productKey === key);
          return fallback ? buildEntry(row, fallback) : null;
        })
        .filter((item: PaymentProductEntry | null): item is PaymentProductEntry => item !== null),
      region
    );
  } catch (error) {
    console.error("[payment-products] Supabase list exception:", error);
    return defaults;
  }
}

export async function upsertPaymentProductEntries(
  input: Array<Partial<PaymentProductEntry>>,
  region: BillingRegion = currentRegion()
): Promise<{ success: boolean; error?: string }> {
  const defaults = getDefaultEntries(region);
  const defaultMap = new Map(defaults.map((item) => [item.productKey, item]));
  const payload = (input || [])
    .map((item) => {
      const productType = String(item.productType || "SUBSCRIPTION").toUpperCase() === "ADDON" ? "ADDON" : "SUBSCRIPTION";
      const billingCycle = item.billingCycle === "yearly" ? "yearly" : item.billingCycle === "monthly" ? "monthly" : null;
      const productKey = item.productKey || toProductKey({
        productType,
        planId: item.planId,
        addonPackageId: item.addonPackageId,
        billingCycle,
      });
      const fallback = defaultMap.get(productKey);
      if (!fallback) return null;
      return buildEntry(
        {
          ...item,
          productKey,
          product_type: productType,
          region,
          billing_cycle: billingCycle,
        },
        fallback
      );
    })
    .filter((item: PaymentProductEntry | null): item is PaymentProductEntry => item !== null);

  try {
    if (isChinaRegion()) {
      await ensureCollection();
      const db = getDatabase();
      for (const item of payload) {
        const existing = await db.collection(COLLECTION).where({ product_key: item.productKey, region }).limit(1).get();
        const base = {
          product_key: item.productKey,
          region: item.region,
          product_type: item.productType,
          plan_id: item.planId || null,
          addon_package_id: item.addonPackageId || null,
          billing_cycle: item.billingCycle || null,
          currency: item.currency,
          amount: item.amount,
          metadata: item.metadata || {},
          updated_at: new Date().toISOString(),
        };
        if (Array.isArray(existing?.data) && existing.data.length > 0) {
          await db.collection(COLLECTION).doc(existing.data[0]._id).update(base);
        } else {
          await db.collection(COLLECTION).add({ ...base, created_at: new Date().toISOString() });
        }
      }
      return { success: true };
    }

    const { error } = await supabaseAdmin.from("payment_product_catalog").upsert(
      payload.map((item) => ({
        product_key: item.productKey,
        region: item.region,
        product_type: item.productType,
        plan_id: item.planId || null,
        addon_package_id: item.addonPackageId || null,
        billing_cycle: item.billingCycle || null,
        currency: item.currency,
        amount: item.amount,
        metadata: item.metadata || {},
      })),
      { onConflict: "product_key,region" }
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save payment products",
    };
  }
}

export async function getPaymentProductCatalog(
  region: BillingRegion = currentRegion()
): Promise<PaymentProductCatalog> {
  const entries = await listPaymentProductEntries(region);
  const currency = defaultCurrencyByRegion(region);
  const subscriptions: PaymentProductCatalog["subscriptions"] = {};
  const addons: PaymentProductCatalog["addons"] = {};

  for (const planId of SUBSCRIPTION_PLAN_IDS) {
    subscriptions[planId] = { monthly: 0, yearly: 0 };
  }

  for (const entry of entries) {
    if (entry.productType === "SUBSCRIPTION" && entry.planId && entry.billingCycle) {
      subscriptions[entry.planId] = {
        ...(subscriptions[entry.planId] || { monthly: 0, yearly: 0 }),
        [entry.billingCycle]: entry.amount,
      };
      continue;
    }
    if (entry.productType === "ADDON" && entry.addonPackageId) {
      const fallback = ADDON_PACKAGES.find((pkg) => pkg.id === entry.addonPackageId);
      const imageCredits = Math.max(
        0,
        Math.floor(
          toNumber(
            (entry.metadata as any)?.imageCredits,
            fallback?.imageCredits || 0
          )
        )
      );
      const videoAudioCredits = Math.max(
        0,
        Math.floor(
          toNumber(
            (entry.metadata as any)?.videoAudioCredits,
            fallback?.videoAudioCredits || 0
          )
        )
      );
      addons[entry.addonPackageId] = { amount: entry.amount, imageCredits, videoAudioCredits };
    }
  }

  return { region, currency, subscriptions, addons, entries };
}

export async function getSubscriptionProductPrice(
  planId: string,
  billingCycle: BillingCycle,
  region: BillingRegion = currentRegion()
) {
  const entries = await listPaymentProductEntries(region);
  const entry = entries.find(
    (item) => item.productType === "SUBSCRIPTION" && item.planId === String(planId).toLowerCase() && item.billingCycle === billingCycle
  );
  const fallback = getDefaultEntries(region).find(
    (item) => item.productType === "SUBSCRIPTION" && item.planId === String(planId).toLowerCase() && item.billingCycle === billingCycle
  );
  return entry || fallback || null;
}

export async function getAddonProductPrice(
  addonPackageId: string,
  region: BillingRegion = currentRegion()
) {
  const entries = await listPaymentProductEntries(region);
  const entry = entries.find(
    (item) => item.productType === "ADDON" && item.addonPackageId === addonPackageId
  );
  const fallback = getDefaultEntries(region).find(
    (item) => item.productType === "ADDON" && item.addonPackageId === addonPackageId
  );
  return entry || fallback || null;
}
