import { getDatabase } from "@/lib/cloudbase-service";
import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BillingRegion, BillingSettings } from "./types";

const COLLECTION = "billing_settings";

const DEFAULT_SETTINGS: Record<BillingRegion, BillingSettings> = {
  CN: {
    region: "CN",
    profitMultiplier: 2.5,
    creditExchangeRate: 10000,
    rechargeCreditRate: 10000,
    minimumChargeCredits: 1,
    defaultCurrency: "CNY",
    metadata: {},
  },
  INTL: {
    region: "INTL",
    profitMultiplier: 2.5,
    creditExchangeRate: 10000,
    rechargeCreditRate: 10000,
    minimumChargeCredits: 1,
    defaultCurrency: "USD",
    metadata: {},
  },
};

function currentRegion(): BillingRegion {
  return isChinaRegion() ? "CN" : "INTL";
}

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseSettingsRow(row: any, fallback: BillingSettings): BillingSettings {
  return {
    region: fallback.region,
    profitMultiplier: toNumber(
      row?.profit_multiplier ?? row?.profitMultiplier,
      fallback.profitMultiplier
    ),
    creditExchangeRate: toNumber(
      row?.credit_exchange_rate ?? row?.creditExchangeRate,
      fallback.creditExchangeRate
    ),
    rechargeCreditRate: toNumber(
      row?.recharge_credit_rate ?? row?.rechargeCreditRate,
      fallback.rechargeCreditRate
    ),
    minimumChargeCredits: Math.max(
      0,
      Math.floor(
        toNumber(
          row?.minimum_charge_credits ?? row?.minimumChargeCredits,
          fallback.minimumChargeCredits
        )
      )
    ),
    defaultCurrency:
      typeof (row?.default_currency ?? row?.defaultCurrency) === "string"
        ? String(row?.default_currency ?? row?.defaultCurrency)
        : fallback.defaultCurrency,
    metadata:
      row?.metadata && typeof row.metadata === "object"
        ? row.metadata
        : fallback.metadata,
    updatedAt:
      typeof (row?.updated_at ?? row?.updatedAt) === "string"
        ? String(row?.updated_at ?? row?.updatedAt)
        : fallback.updatedAt ?? null,
  };
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

async function ensureCloudbaseCollection() {
  const db = getDatabase();
  try {
    await db.collection(COLLECTION).limit(1).get();
  } catch (error: any) {
    if (!missingCloudbaseCollection(error)) {
      throw error;
    }
    await db.createCollection(COLLECTION);
  }
}

async function ensureCloudbaseDefaults() {
  await ensureCloudbaseCollection();
  const db = getDatabase();
  for (const region of ["CN", "INTL"] as const) {
    const existing = await db.collection(COLLECTION).where({ region }).limit(1).get();
    if (Array.isArray(existing?.data) && existing.data.length > 0) continue;
    const base = DEFAULT_SETTINGS[region];
    await db.collection(COLLECTION).add({
      region,
      profit_multiplier: base.profitMultiplier,
      credit_exchange_rate: base.creditExchangeRate,
      recharge_credit_rate: base.rechargeCreditRate,
      minimum_charge_credits: base.minimumChargeCredits,
      default_currency: base.defaultCurrency,
      metadata: base.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

export function getDefaultBillingSettings(region: BillingRegion = currentRegion()) {
  return DEFAULT_SETTINGS[region];
}

export async function getBillingSettings(
  region: BillingRegion = currentRegion()
): Promise<BillingSettings> {
  const fallback = DEFAULT_SETTINGS[region];

  if (isChinaRegion()) {
    try {
      await ensureCloudbaseDefaults();
      const db = getDatabase();
      const result = await db.collection(COLLECTION).where({ region }).limit(1).get();
      const row = Array.isArray(result?.data) ? result.data[0] : null;
      return row ? parseSettingsRow(row, fallback) : fallback;
    } catch (error) {
      console.error("[billing-settings] CloudBase fetch failed:", error);
      return fallback;
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("billing_settings")
      .select("*")
      .eq("region", region)
      .maybeSingle();
    if (error) {
      console.error("[billing-settings] Supabase fetch failed:", error);
      return fallback;
    }
    return data ? parseSettingsRow(data, fallback) : fallback;
  } catch (error) {
    console.error("[billing-settings] Supabase fetch exception:", error);
    return fallback;
  }
}

export async function upsertBillingSettings(
  input: Partial<BillingSettings> & { region?: BillingRegion }
): Promise<{ success: boolean; error?: string }> {
  const region = input.region || currentRegion();
  const fallback = DEFAULT_SETTINGS[region];
  const payload = parseSettingsRow(input, fallback);

  if (isChinaRegion()) {
    try {
      await ensureCloudbaseDefaults();
      const db = getDatabase();
      const existing = await db.collection(COLLECTION).where({ region }).limit(1).get();
      const base = {
        region,
        profit_multiplier: payload.profitMultiplier,
        credit_exchange_rate: payload.creditExchangeRate,
        recharge_credit_rate: payload.rechargeCreditRate,
        minimum_charge_credits: payload.minimumChargeCredits,
        default_currency: payload.defaultCurrency,
        metadata: payload.metadata || {},
        updated_at: new Date().toISOString(),
      };
      if (Array.isArray(existing?.data) && existing.data.length > 0) {
        await db.collection(COLLECTION).doc(existing.data[0]._id).update(base);
      } else {
        await db.collection(COLLECTION).add({
          ...base,
          created_at: new Date().toISOString(),
        });
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save billing settings",
      };
    }
  }

  try {
    const { error } = await supabaseAdmin.from("billing_settings").upsert(
      {
        region,
        profit_multiplier: payload.profitMultiplier,
        credit_exchange_rate: payload.creditExchangeRate,
        recharge_credit_rate: payload.rechargeCreditRate,
        minimum_charge_credits: payload.minimumChargeCredits,
        default_currency: payload.defaultCurrency,
        metadata: payload.metadata || {},
      },
      { onConflict: "region" }
    );

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save billing settings",
    };
  }
}
