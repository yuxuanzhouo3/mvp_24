import { isChinaRegion } from "@/lib/config/region";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDatabase } from "@/lib/cloudbase-service";
import {
  getBasicMonthlyPhotoLimit,
  getBasicMonthlyVideoAudioLimit,
  getEnterpriseMonthlyPhotoLimit,
  getEnterpriseMonthlyVideoAudioLimit,
  getFreeMonthlyPhotoLimit,
  getFreeMonthlyVideoAudioLimit,
  getProMonthlyPhotoLimit,
  getProMonthlyVideoAudioLimit,
} from "@/utils/model-limits";

export const PLAN_IDS = ["free", "basic", "pro", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanQuotaSettings {
  planId: PlanId;
  tokenLimit: number;
  imageLimit: number;
  videoAudioLimit: number;
  updatedAt?: string | null;
}

const CLOUDBASE_PLAN_QUOTA_COLLECTION = "plan_quota_settings";
const DEFAULT_TOKEN_LIMITS: Record<PlanId, number> = {
  free: 50000,
  basic: 200000,
  pro: 1000000,
  enterprise: 5000000,
};

const MAX_TOKEN_LIMIT = 10_000_000_000;
const MAX_MEDIA_LIMIT = 1_000_000;

function clampInt(
  value: unknown,
  options: { min?: number; max?: number } = {}
): number {
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = options;
  const raw = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(raw)) return min;
  const floored = Math.floor(raw);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}

function pickRaw(value: unknown): unknown | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
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

function getDefaultPlanQuotaPayload(planId: PlanId, now: string) {
  const item = getDefaultPlanQuotas()[planId];
  return {
    plan_id: item.planId,
    token_limit: item.tokenLimit,
    image_limit: item.imageLimit,
    video_audio_limit: item.videoAudioLimit,
    created_at: now,
    updated_at: now,
  };
}

async function ensureCloudbasePlanQuotaCollection() {
  const db = getDatabase();
  try {
    await db.collection(CLOUDBASE_PLAN_QUOTA_COLLECTION).limit(1).get();
  } catch (error: any) {
    if (!missingCloudbaseCollection(error)) {
      throw error;
    }
    await db.createCollection(CLOUDBASE_PLAN_QUOTA_COLLECTION);
  }
}

async function ensureCloudbasePlanQuotaDefaults(
  rows: any[]
): Promise<PlanQuotaSettings[]> {
  const db = getDatabase();
  const defaults = getDefaultPlanQuotas();
  const byPlanId = new Map<PlanId, any>();

  for (const row of rows) {
    const planId = normalizePlanId(row?.plan_id ?? row?.planId);
    if (!planId || byPlanId.has(planId)) continue;
    byPlanId.set(planId, row);
  }

  const now = new Date().toISOString();

  for (const planId of PLAN_IDS) {
    if (byPlanId.has(planId)) continue;

    const payload = getDefaultPlanQuotaPayload(planId, now);
    try {
      await db.collection(CLOUDBASE_PLAN_QUOTA_COLLECTION).add(payload);
    } catch (error) {
      console.error(
        `[plan-quota] Failed to seed CloudBase default for ${planId}:`,
        error
      );
    }
    byPlanId.set(planId, payload);
  }

  return PLAN_IDS.map((planId) =>
    buildPlanQuotaFromRow(byPlanId.get(planId), defaults[planId])
  );
}

export function normalizePlanId(raw: unknown): PlanId | null {
  if (typeof raw !== "string") return null;
  const value = raw.toLowerCase().trim();
  if (!value) return null;
  if (value.includes("enterprise") || value.includes("企业")) return "enterprise";
  if (value.includes("pro") || value.includes("专业")) return "pro";
  if (value.includes("basic") || value.includes("base") || value.includes("基础")) {
    return "basic";
  }
  if (value.includes("free") || value.includes("免费")) return "free";
  if ((PLAN_IDS as readonly string[]).includes(value)) return value as PlanId;
  return null;
}

export function coercePlanId(raw: unknown): PlanId {
  return normalizePlanId(raw) || "free";
}

export function getDefaultPlanQuotas(): Record<PlanId, PlanQuotaSettings> {
  return {
    free: {
      planId: "free",
      tokenLimit: DEFAULT_TOKEN_LIMITS.free,
      imageLimit: getFreeMonthlyPhotoLimit(),
      videoAudioLimit: getFreeMonthlyVideoAudioLimit(),
    },
    basic: {
      planId: "basic",
      tokenLimit: DEFAULT_TOKEN_LIMITS.basic,
      imageLimit: getBasicMonthlyPhotoLimit(),
      videoAudioLimit: getBasicMonthlyVideoAudioLimit(),
    },
    pro: {
      planId: "pro",
      tokenLimit: DEFAULT_TOKEN_LIMITS.pro,
      imageLimit: getProMonthlyPhotoLimit(),
      videoAudioLimit: getProMonthlyVideoAudioLimit(),
    },
    enterprise: {
      planId: "enterprise",
      tokenLimit: DEFAULT_TOKEN_LIMITS.enterprise,
      imageLimit: getEnterpriseMonthlyPhotoLimit(),
      videoAudioLimit: getEnterpriseMonthlyVideoAudioLimit(),
    },
  };
}

function buildPlanQuotaFromRow(
  row: any,
  fallback: PlanQuotaSettings
): PlanQuotaSettings {
  const tokenRaw = pickRaw(row?.token_limit ?? row?.tokenLimit ?? row?.token);
  const imageRaw = pickRaw(row?.image_limit ?? row?.imageLimit ?? row?.image);
  const videoRaw = pickRaw(
    row?.video_audio_limit ??
      row?.videoAudioLimit ??
      row?.video_limit ??
      row?.videoLimit ??
      row?.video
  );
  const updatedAtRaw = row?.updated_at ?? row?.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string" ? updatedAtRaw : fallback.updatedAt || null;

  return {
    planId: fallback.planId,
    tokenLimit:
      tokenRaw === undefined
        ? fallback.tokenLimit
        : clampInt(tokenRaw, { min: 0, max: MAX_TOKEN_LIMIT }),
    imageLimit:
      imageRaw === undefined
        ? fallback.imageLimit
        : clampInt(imageRaw, { min: 0, max: MAX_MEDIA_LIMIT }),
    videoAudioLimit:
      videoRaw === undefined
        ? fallback.videoAudioLimit
        : clampInt(videoRaw, { min: 0, max: MAX_MEDIA_LIMIT }),
    updatedAt,
  };
}

async function fetchSupabasePlanQuotas(): Promise<PlanQuotaSettings[] | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("plan_quota_settings")
      .select("plan_id, token_limit, image_limit, video_audio_limit, updated_at");
    if (error) {
      console.error("[plan-quota] Supabase fetch error:", error);
      return null;
    }
    return (data || [])
      .map((row: any) => {
        const planId = normalizePlanId(row?.plan_id ?? row?.planId) || "free";
        const fallback = getDefaultPlanQuotas()[planId];
        return buildPlanQuotaFromRow(row, fallback);
      })
      .filter(Boolean);
  } catch (error) {
    console.error("[plan-quota] Supabase fetch exception:", error);
    return null;
  }
}

async function fetchCloudBasePlanQuotas(): Promise<PlanQuotaSettings[] | null> {
  try {
    await ensureCloudbasePlanQuotaCollection();
    const db = getDatabase();
    const result = await db
      .collection(CLOUDBASE_PLAN_QUOTA_COLLECTION)
      .limit(50)
      .get();
    const rows = Array.isArray(result?.data) ? result.data : [];
    return ensureCloudbasePlanQuotaDefaults(rows);
  } catch (error) {
    console.error("[plan-quota] CloudBase fetch exception:", error);
    return null;
  }
}

function mergeWithDefaults(rows: PlanQuotaSettings[] | null): PlanQuotaSettings[] {
  const defaults = getDefaultPlanQuotas();
  const merged = new Map<PlanId, PlanQuotaSettings>(
    PLAN_IDS.map((planId) => [planId, defaults[planId]])
  );

  for (const row of rows || []) {
    merged.set(row.planId, {
      ...defaults[row.planId],
      ...row,
    });
  }

  return PLAN_IDS.map((planId) => merged.get(planId) || defaults[planId]);
}

export async function getAllPlanQuotaSettings(): Promise<PlanQuotaSettings[]> {
  const rows = isChinaRegion()
    ? await fetchCloudBasePlanQuotas()
    : await fetchSupabasePlanQuotas();
  return mergeWithDefaults(rows);
}

export async function getPlanQuotaSettings(
  planId: PlanId
): Promise<PlanQuotaSettings> {
  const all = await getAllPlanQuotaSettings();
  return (
    all.find((item) => item.planId === planId) || getDefaultPlanQuotas()[planId]
  );
}

export async function upsertPlanQuotaSettings(
  input: PlanQuotaSettings[]
): Promise<{ success: boolean; error?: string }> {
  const defaults = getDefaultPlanQuotas();
  const normalized = new Map<PlanId, PlanQuotaSettings>();

  for (const item of input || []) {
    const planId = coercePlanId(item?.planId);
    normalized.set(planId, {
      planId,
      tokenLimit: clampInt(item?.tokenLimit, {
        min: 0,
        max: MAX_TOKEN_LIMIT,
      }),
      imageLimit: clampInt(item?.imageLimit, { min: 0, max: MAX_MEDIA_LIMIT }),
      videoAudioLimit: clampInt(item?.videoAudioLimit, {
        min: 0,
        max: MAX_MEDIA_LIMIT,
      }),
      updatedAt: item?.updatedAt ?? null,
    });
  }

  const current = await getAllPlanQuotaSettings();
  const currentMap = new Map<PlanId, PlanQuotaSettings>(
    current.map((item) => [item.planId, item])
  );

  const payload = PLAN_IDS.map(
    (planId) =>
      normalized.get(planId) || currentMap.get(planId) || defaults[planId]
  );

  try {
    if (isChinaRegion()) {
      await ensureCloudbasePlanQuotaCollection();
      const db = getDatabase();
      for (const item of payload) {
        const existing = await db
          .collection(CLOUDBASE_PLAN_QUOTA_COLLECTION)
          .where({ plan_id: item.planId })
          .limit(1)
          .get();

        const baseData = {
          plan_id: item.planId,
          token_limit: item.tokenLimit,
          image_limit: item.imageLimit,
          video_audio_limit: item.videoAudioLimit,
          updated_at: new Date().toISOString(),
        };

        if (existing?.data && existing.data.length > 0) {
          await db
            .collection(CLOUDBASE_PLAN_QUOTA_COLLECTION)
            .doc(existing.data[0]._id)
            .update(baseData);
        } else {
          await db.collection(CLOUDBASE_PLAN_QUOTA_COLLECTION).add({
            ...baseData,
            created_at: new Date().toISOString(),
          });
        }
      }
      return { success: true };
    }

    if (!supabaseAdmin) {
      return { success: false, error: "supabaseAdmin not available" };
    }

    const { error } = await supabaseAdmin.from("plan_quota_settings").upsert(
      payload.map((item) => ({
        plan_id: item.planId,
        token_limit: item.tokenLimit,
        image_limit: item.imageLimit,
        video_audio_limit: item.videoAudioLimit,
      })),
      { onConflict: "plan_id" }
    );

    if (error) {
      console.error("[plan-quota] Supabase upsert error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("[plan-quota] Upsert exception:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save quotas",
    };
  }
}
