import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDatabase } from "@/lib/cloudbase-service";
import {
  applyMembershipDaysDelta,
  type MembershipRegion,
} from "@/lib/market/membership-reward";
import { ensureUserWallet } from "@/services/wallet-supabase";
import { getDaysByBillingCycle, type BillingCycle } from "@/lib/payment-config";

export type MarketRegion = "CN" | "INTL" | "ALL";

export const REFERRAL_ATTRIBUTION_COOKIE = "mk_ref";
export const REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const REFERRAL_LINKS_COLLECTION = "web_referral_links";
const REFERRAL_CLICKS_COLLECTION = "web_referral_clicks";
const REFERRAL_RELATIONS_COLLECTION = "web_referral_relations";
const REFERRAL_REWARDS_COLLECTION = "web_referral_rewards";
const CN_USERS_COLLECTION = "web_users";

const SHARE_CODE_ALPHABET =
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const SHARE_CODE_LENGTH = 8;
const USER_REFERRAL_CODE_LENGTH = 8;

const REFERRAL_INVITER_SIGNUP_BONUS = 0;
const REFERRAL_INVITED_SIGNUP_BONUS = 0;
const REFERRAL_INVITER_FIRST_USE_BONUS = 7;
const REFERRAL_INVITED_FIRST_USE_BONUS = 3;
const REFERRAL_INVITER_FIRST_PAYMENT_BONUS = getDaysByBillingCycle("monthly");
const REFERRAL_INVITED_FIRST_PAYMENT_BONUS = getDaysByBillingCycle("monthly");

const FIRST_PAYMENT_REWARD_TYPES = new Set([
  "first_payment_inviter",
  "first_payment_invited",
]);

function normalizeRewardBillingCycle(raw: unknown): BillingCycle {
  const value = String(raw || "").trim().toLowerCase();
  return value === "yearly" || value === "annual" || value === "year"
    ? "yearly"
    : "monthly";
}

function inferBillingCycleFromDays(days: number): BillingCycle {
  return days >= getDaysByBillingCycle("yearly") ? "yearly" : "monthly";
}

function getBasicMembershipRewardDays(billingCycle: BillingCycle): number {
  return getDaysByBillingCycle(billingCycle);
}

async function loadPaymentForReferralReward(
  region: MembershipRegion,
  transactionId: string
): Promise<any | null> {
  if (!transactionId) return null;

  if (region === "INTL") {
    const { data: byTransaction, error: transactionError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transactionError && transactionError.code !== "PGRST116") {
      throw new Error(transactionError.message);
    }
    if (byTransaction) return byTransaction;

    const { data: byOutTradeNo, error: outTradeError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("out_trade_no", transactionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (outTradeError && outTradeError.code !== "PGRST116") {
      throw new Error(outTradeError.message);
    }
    return byOutTradeNo || null;
  }

  const db = getDatabase();
  const byTransaction = await db
    .collection("payments")
    .where({ transaction_id: transactionId })
    .limit(1)
    .get();
  const transactionRow = Array.isArray(byTransaction?.data) ? byTransaction.data[0] : null;
  if (transactionRow) return transactionRow;

  const byOutTradeNo = await db
    .collection("payments")
    .where({ out_trade_no: transactionId })
    .limit(1)
    .get();
  return Array.isArray(byOutTradeNo?.data) ? byOutTradeNo.data[0] || null : null;
}

async function resolveFirstPaymentRewardContext(input: {
  region: MembershipRegion;
  transactionId: string;
  rewardDays?: number | null;
  billingCycle?: BillingCycle | null;
}) {
  const explicitDays = Math.trunc(Number(input.rewardDays || 0));
  if (Number.isFinite(explicitDays) && explicitDays > 0) {
    const cycle = input.billingCycle || inferBillingCycleFromDays(explicitDays);
    return {
      billingCycle: normalizeRewardBillingCycle(cycle),
      rewardDays: explicitDays,
    };
  }

  const payment = await loadPaymentForReferralReward(input.region, input.transactionId).catch(
    () => null
  );
  const metadata = payment?.metadata && typeof payment.metadata === "object" ? payment.metadata : {};
  const paymentDays = Math.trunc(Number(metadata?.days || 0));
  const billingCycle = normalizeRewardBillingCycle(
    input.billingCycle || metadata?.billingCycle || metadata?.billing_cycle || null
  );

  if (Number.isFinite(paymentDays) && paymentDays > 0) {
    return {
      billingCycle: inferBillingCycleFromDays(paymentDays),
      rewardDays: paymentDays,
    };
  }

  return {
    billingCycle,
    rewardDays: getBasicMembershipRewardDays(billingCycle),
  };
}

export interface ReferralLinkRecord {
  id: string;
  creatorUserId: string;
  toolSlug: string;
  shareCode: string;
  sourceDefault?: string | null;
  clickCount: number;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

export interface ReferralAttribution {
  shareCode: string;
  source?: string | null;
  toolSlug?: string | null;
  ts: number;
}

export interface ReferralStats {
  linkCount: number;
  clickCount: number;
  invitedCount: number;
  conversionRate: number;
  rewardCredits: number;
  rewardDays: number;
  totalRewardCredits: number;
  totalRewardDays: number;
  signupRewardCredits: number;
  firstUseRewardCredits: number;
  firstPaymentRewardDays: number;
  inviterSignupBonus: number;
  invitedSignupBonus: number;
  inviterFirstUseBonus: number;
  invitedFirstUseBonus: number;
  inviterFirstPaymentBonus: number;
  invitedFirstPaymentBonus: number;
  basicMonthlyRewardDays: number;
  basicYearlyRewardDays: number;
}

export interface UserInviteCenterData {
  referralCode: string;
  shareUrl: string;
  clickCount: number;
  invitedCount: number;
  conversionRate: number;
  rewardCredits: number;
  rewardDays: number;
  totalRewardCredits: number;
  totalRewardDays: number;
  firstPaymentRewardDays: number;
  inviterSignupBonus: number;
  invitedSignupBonus: number;
  inviterFirstUseBonus: number;
  invitedFirstUseBonus: number;
  inviterFirstPaymentBonus: number;
  invitedFirstPaymentBonus: number;
  basicMonthlyRewardDays: number;
  basicYearlyRewardDays: number;
}

export interface ResolvedReferralOwner {
  creatorUserId: string;
  shareCode: string;
  toolSlug?: string | null;
  sourceDefault?: string | null;
  isActive: boolean;
  codeType: "link" | "referral_code";
  region: MembershipRegion;
}

export interface AdminReferralOverview {
  totalRelations: number;
  totalClicks: number;
  totalRewardCredits: number;
  totalRewardDays: number;
  usersWithReferralCode: number;
}

export interface ReferralFirstUseRewardResult {
  handled: boolean;
  reason?:
    | "missing_user_id"
    | "no_relation"
    | "self_referral"
    | "relation_incomplete";
  relationId?: string;
  inviterUserId?: string;
  invitedUserId?: string;
  inviterRewardGranted?: boolean;
  invitedRewardGranted?: boolean;
  alreadyProcessed?: boolean;
  region?: MembershipRegion;
}

export interface ReferralFirstPaymentRewardResult {
  handled: boolean;
  reason?:
    | "missing_user_id"
    | "missing_transaction"
    | "no_relation"
    | "self_referral"
    | "relation_incomplete";
  relationId?: string;
  inviterUserId?: string;
  invitedUserId?: string;
  transactionId?: string;
  inviterRewardGranted?: boolean;
  invitedRewardGranted?: boolean;
  alreadyProcessed?: boolean;
  region?: MembershipRegion;
}

export interface ReferralRollbackResult {
  handled: boolean;
  transactionId: string;
  processedRewards: number;
  revokedRewards: number;
  pendingRewards: number;
  region: MarketRegion;
}

export interface MarketOverviewData {
  totalClicks: number;
  totalInvites: number;
  totalActivated: number;
  totalRewardCredits: number;
  totalRewardDays: number;
  signupRewardCredits: number;
  firstUseRewardCredits: number;
  firstPaymentRewardDays: number;
  conversionRate: number;
  activationRate: number;
  usersWithReferralCode: number;
}

export interface MarketTrendPoint {
  date: string;
  clicks: number;
  invites: number;
  activated: number;
  rewardCredits: number;
  rewardDays: number;
}

export interface MarketChannelPoint {
  source: string;
  clicks: number;
  invites: number;
  conversionRate: number;
}

export interface MarketTopInviterPoint {
  inviterUserId: string;
  inviterEmail: string | null;
  referralCode: string | null;
  clickCount: number;
  invitedCount: number;
  activatedCount: number;
  rewardCredits: number;
  rewardDays: number;
  region: MembershipRegion;
}

export interface MarketRelationRow {
  relationId: string;
  inviterUserId: string;
  inviterEmail: string | null;
  invitedUserId: string;
  invitedEmail: string | null;
  shareCode: string;
  toolSlug: string | null;
  firstToolId: string | null;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  firstPaidAt: string | null;
  firstPaidTransactionId: string | null;
  region: MembershipRegion;
}

export interface MarketRewardRow {
  rewardId: string;
  relationId: string | null;
  userId: string;
  userEmail: string | null;
  rewardType: string;
  amount: number;
  unit: string;
  status: string;
  referenceId: string;
  relatedTransactionId: string | null;
  createdAt: string;
  grantedAt: string | null;
  revokedAt: string | null;
  region: MembershipRegion;
}

export interface MarketListResult<T> {
  page: number;
  limit: number;
  total: number;
  rows: T[];
}

export interface CreateReferralLinkInput {
  creatorUserId: string;
  toolSlug: string;
  sourceDefault?: string;
  origin?: string;
  region?: MarketRegion;
}

export interface CreateReferralLinkResult {
  link: ReferralLinkRecord;
  shareUrl: string;
  referralCode: string;
}

type RelationInternal = {
  id: string;
  inviterUserId: string;
  invitedUserId: string;
  shareCode: string;
  toolSlug: string | null;
  firstToolId: string | null;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  firstPaidAt: string | null;
  firstPaidTransactionId: string | null;
  region: MembershipRegion;
};

type RewardInternal = {
  id: string;
  relationId: string | null;
  userId: string;
  rewardType: string;
  amount: number;
  unit: string;
  status: string;
  referenceId: string;
  relatedTransactionId: string | null;
  createdAt: string;
  grantedAt: string | null;
  revokedAt: string | null;
  meta: Record<string, any>;
  region: MembershipRegion;
};

type UserSummary = {
  id: string;
  email: string | null;
  referralCode: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeRegion(value?: string | null, fallback: MarketRegion = "ALL"): MarketRegion {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "CN" || raw === "INTL" || raw === "ALL") {
    return raw;
  }
  return fallback;
}

function resolveReadRegions(region: MarketRegion = "ALL"): MembershipRegion[] {
  if (region === "CN") return ["CN"];
  if (region === "INTL") return ["INTL"];
  return ["INTL", "CN"];
}

function toIsoDateKey(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parsePage(value: number | string | undefined, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function parseLimit(value: number | string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function safeNumber(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeShareCode(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
}

function normalizeToolSlug(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
}

function normalizeSource(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function normalizeUserId(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 128);
}

function hashSensitive(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function toShareCode(length = SHARE_CODE_LENGTH) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return out;
}

function withSiteOrigin(origin?: string | null) {
  const base = String(origin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim();
  return base.endsWith("/") ? base.slice(0, -1) : base;
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

async function ensureCloudbaseCollections(db: any, names: string[]) {
  for (const name of names) {
    try {
      await db.collection(name).limit(1).get();
    } catch (error: any) {
      if (!missingCloudbaseCollection(error)) {
        throw error;
      }
      await db.createCollection(name);
    }
  }
}

async function ensureCloudbaseReferralCollections(db: any) {
  await ensureCloudbaseCollections(db, [
    REFERRAL_LINKS_COLLECTION,
    REFERRAL_CLICKS_COLLECTION,
    REFERRAL_RELATIONS_COLLECTION,
    REFERRAL_REWARDS_COLLECTION,
    CN_USERS_COLLECTION,
  ]);
}

function mapIntlLink(row: any): ReferralLinkRecord {
  return {
    id: String(row?.id || ""),
    creatorUserId: String(row?.creator_user_id || ""),
    toolSlug: String(row?.tool_slug || ""),
    shareCode: String(row?.share_code || ""),
    sourceDefault: row?.source_default || null,
    clickCount: Number(row?.click_count || 0),
    isActive: row?.is_active !== false,
    createdAt: String(row?.created_at || nowIso()),
    expiresAt: row?.expires_at || null,
  };
}

function mapCnLink(row: any): ReferralLinkRecord {
  return {
    id: String(row?._id || row?.id || ""),
    creatorUserId: String(row?.creator_user_id || ""),
    toolSlug: String(row?.tool_slug || ""),
    shareCode: String(row?.share_code || ""),
    sourceDefault: row?.source_default || null,
    clickCount: Number(row?.click_count || 0),
    isActive: row?.is_active !== false,
    createdAt: String(row?.created_at || nowIso()),
    expiresAt: row?.expires_at || null,
  };
}

function mapIntlRelation(row: any): RelationInternal {
  return {
    id: String(row?.id || ""),
    inviterUserId: String(row?.inviter_user_id || ""),
    invitedUserId: String(row?.invited_user_id || ""),
    shareCode: String(row?.share_code || ""),
    toolSlug: row?.tool_slug ? String(row.tool_slug) : null,
    firstToolId: row?.first_tool_id ? String(row.first_tool_id) : null,
    status: String(row?.status || "bound"),
    createdAt: String(row?.created_at || nowIso()),
    activatedAt: row?.activated_at ? String(row.activated_at) : null,
    firstPaidAt: row?.first_paid_at ? String(row.first_paid_at) : null,
    firstPaidTransactionId: row?.first_paid_transaction_id
      ? String(row.first_paid_transaction_id)
      : null,
    region: "INTL",
  };
}

function mapCnRelation(row: any): RelationInternal {
  return {
    id: String(row?._id || row?.id || ""),
    inviterUserId: String(row?.inviter_user_id || ""),
    invitedUserId: String(row?.invited_user_id || ""),
    shareCode: String(row?.share_code || ""),
    toolSlug: row?.tool_slug ? String(row.tool_slug) : null,
    firstToolId: row?.first_tool_id ? String(row.first_tool_id) : null,
    status: String(row?.status || "bound"),
    createdAt: String(row?.created_at || nowIso()),
    activatedAt: row?.activated_at ? String(row.activated_at) : null,
    firstPaidAt: row?.first_paid_at ? String(row.first_paid_at) : null,
    firstPaidTransactionId: row?.first_paid_transaction_id
      ? String(row.first_paid_transaction_id)
      : null,
    region: "CN",
  };
}

function mapIntlReward(row: any): RewardInternal {
  return {
    id: String(row?.id || ""),
    relationId: row?.relation_id ? String(row.relation_id) : null,
    userId: String(row?.user_id || ""),
    rewardType: String(row?.reward_type || ""),
    amount: safeNumber(row?.amount),
    unit: String(row?.unit || "membership_days"),
    status: String(row?.status || "granted"),
    referenceId: String(row?.reference_id || ""),
    relatedTransactionId: row?.related_transaction_id
      ? String(row.related_transaction_id)
      : null,
    createdAt: String(row?.created_at || nowIso()),
    grantedAt: row?.granted_at ? String(row.granted_at) : null,
    revokedAt: row?.revoked_at ? String(row.revoked_at) : null,
    meta:
      row?.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, any>)
        : {},
    region: "INTL",
  };
}

function mapCnReward(row: any): RewardInternal {
  return {
    id: String(row?._id || row?.id || ""),
    relationId: row?.relation_id ? String(row.relation_id) : null,
    userId: String(row?.user_id || ""),
    rewardType: String(row?.reward_type || ""),
    amount: safeNumber(row?.amount),
    unit: String(row?.unit || "membership_days"),
    status: String(row?.status || "granted"),
    referenceId: String(row?.reference_id || ""),
    relatedTransactionId: row?.related_transaction_id
      ? String(row.related_transaction_id)
      : null,
    createdAt: String(row?.created_at || nowIso()),
    grantedAt: row?.granted_at ? String(row.granted_at) : null,
    revokedAt: row?.revoked_at ? String(row.revoked_at) : null,
    meta:
      row?.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, any>)
        : {},
    region: "CN",
  };
}

async function loadIntlWallet(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_wallets")
    .select("user_id,referral_code,referred_by,referred_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function loadIntlWalletByReferralCode(referralCode: string) {
  const code = normalizeShareCode(referralCode);
  if (!code) return null;

  const { data, error } = await supabaseAdmin
    .from("user_wallets")
    .select("user_id,referral_code,referred_by,referred_at")
    .eq("referral_code", code)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function loadCnUserById(userId: string) {
  const db = getDatabase();
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION]);

  const direct = await db
    .collection(CN_USERS_COLLECTION)
    .where({ _id: userId })
    .limit(1)
    .get();
  if (direct?.data?.[0]) {
    return { db, user: direct.data[0] };
  }

  const byUserId = await db
    .collection(CN_USERS_COLLECTION)
    .where({ user_id: userId })
    .limit(1)
    .get();
  return { db, user: byUserId?.data?.[0] || null };
}

async function loadCnUserByReferralCode(referralCode: string) {
  const code = normalizeShareCode(referralCode);
  if (!code) {
    const db = getDatabase();
    return { db, user: null };
  }

  const db = getDatabase();
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION]);
  const result = await db
    .collection(CN_USERS_COLLECTION)
    .where({ referral_code: code })
    .limit(1)
    .get();
  return { db, user: result?.data?.[0] || null };
}

async function loadIntlUserSummaryById(userId: string): Promise<UserSummary> {
  let email: string | null = null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (data?.user?.email) {
      email = String(data.user.email);
    }
  } catch {
    email = null;
  }

  let referralCode: string | null = null;
  try {
    const wallet = await loadIntlWallet(userId);
    referralCode = wallet?.referral_code ? String(wallet.referral_code) : null;
  } catch {
    referralCode = null;
  }

  return { id: userId, email, referralCode };
}

async function loadIntlUsersByIds(userIds: string[]) {
  const unique = Array.from(
    new Set(userIds.map((item) => normalizeUserId(item)).filter(Boolean))
  ) as string[];

  const map = new Map<string, UserSummary>();
  await Promise.all(
    unique.map(async (userId) => {
      map.set(userId, await loadIntlUserSummaryById(userId));
    })
  );
  return map;
}

async function loadCnUsersByIds(userIds: string[]) {
  const unique = new Set(
    userIds.map((item) => normalizeUserId(item)).filter(Boolean)
  );
  const map = new Map<string, UserSummary>();

  if (unique.size === 0) return map;

  const db = getDatabase();
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION]);
  const result = await db.collection(CN_USERS_COLLECTION).get();
  const rows = Array.isArray(result?.data) ? result.data : [];

  for (const row of rows) {
    const id = normalizeUserId(row?._id || row?.id || row?.user_id);
    if (!id || !unique.has(id)) continue;
    map.set(id, {
      id,
      email: row?.email ? String(row.email) : null,
      referralCode: row?.referral_code ? String(row.referral_code) : null,
    });
  }

  return map;
}

async function detectUserRegion(
  userId: string,
  preferred?: MarketRegion
): Promise<MembershipRegion | null> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  const scope = normalizeRegion(preferred, "ALL");
  const targets = resolveReadRegions(scope);

  for (const region of targets) {
    if (region === "INTL") {
      try {
        const wallet = await loadIntlWallet(normalizedUserId);
        if (wallet?.user_id) return "INTL";
      } catch {
        // noop
      }
    }

    if (region === "CN") {
      try {
        const { user } = await loadCnUserById(normalizedUserId);
        if (user?._id || user?.id) return "CN";
      } catch {
        // noop
      }
    }
  }

  return null;
}

async function findUniqueUserReferralCode(region: MembershipRegion) {
  for (let i = 0; i < 24; i += 1) {
    const code = toShareCode(USER_REFERRAL_CODE_LENGTH);

    if (region === "INTL") {
      const { data, error } = await supabaseAdmin
        .from("user_wallets")
        .select("user_id")
        .eq("referral_code", code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return code;
      continue;
    }

    const db = getDatabase();
    await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION]);
    const result = await db
      .collection(CN_USERS_COLLECTION)
      .where({ referral_code: code })
      .limit(1)
      .get();
    if (!result?.data?.[0]) {
      return code;
    }
  }

  throw new Error("Failed to generate unique referral code");
}

async function findUniqueShareCode(region: MembershipRegion) {
  for (let i = 0; i < 24; i += 1) {
    const code = toShareCode(SHARE_CODE_LENGTH);

    if (region === "INTL") {
      const { data, error } = await supabaseAdmin
        .from("referral_links")
        .select("id")
        .eq("share_code", code)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return code;
      continue;
    }

    const db = getDatabase();
    await ensureCloudbaseReferralCollections(db);
    const result = await db
      .collection(REFERRAL_LINKS_COLLECTION)
      .where({ share_code: code })
      .limit(1)
      .get();
    if (!result?.data?.[0]) {
      return code;
    }
  }

  throw new Error("Failed to generate unique share code");
}

export async function ensureUserReferralCode(input: {
  userId: string;
  userEmail?: string | null;
  region?: MarketRegion;
}) {
  const userId = normalizeUserId(input.userId);
  if (!userId) {
    throw new Error("userId is required");
  }

  const resolvedRegion =
    normalizeRegion(input.region || null, "ALL") === "ALL"
      ? await detectUserRegion(userId, "ALL")
      : (normalizeRegion(input.region || null, "ALL") as MembershipRegion);

  if (!resolvedRegion) {
    throw new Error("User not found in CN/INTL data sources");
  }

  if (resolvedRegion === "INTL") {
    await ensureUserWallet(userId);
    const wallet = await loadIntlWallet(userId);
    const existingCode = normalizeShareCode(wallet?.referral_code);
    if (existingCode) {
      return existingCode;
    }

    const code = await findUniqueUserReferralCode("INTL");
    const { error } = await supabaseAdmin
      .from("user_wallets")
      .update({ referral_code: code, updated_at: nowIso() })
      .eq("user_id", userId);
    if (error) {
      throw new Error(error.message);
    }
    return code;
  }

  const { db, user } = await loadCnUserById(userId);
  const fallbackEmail = String(input.userEmail || "").trim().toLowerCase();

  let targetUser = user;
  if (!targetUser && fallbackEmail) {
    const result = await db
      .collection(CN_USERS_COLLECTION)
      .where({ email: fallbackEmail })
      .limit(1)
      .get();
    targetUser = result?.data?.[0] || null;
  }

  if (!targetUser?._id) {
    throw new Error("User not found in CloudBase");
  }

  const existingCode = normalizeShareCode(targetUser.referral_code);
  if (existingCode) {
    return existingCode;
  }

  const code = await findUniqueUserReferralCode("CN");
  await db.collection(CN_USERS_COLLECTION).doc(targetUser._id).update({
    referral_code: code,
    updated_at: nowIso(),
  });
  return code;
}

export function buildReferralShareUrl(input: {
  shareCode: string;
  source?: string | null;
  origin?: string | null;
}) {
  const origin = withSiteOrigin(input.origin);
  const code = normalizeShareCode(input.shareCode);
  const source = normalizeSource(input.source);

  if (!code) return `${origin}/`;
  if (!source) return `${origin}/r/${code}`;
  return `${origin}/r/${code}?source=${encodeURIComponent(source)}`;
}

export async function createReferralLink(
  input: CreateReferralLinkInput
): Promise<CreateReferralLinkResult> {
  const creatorUserId = normalizeUserId(input.creatorUserId);
  const toolSlug = normalizeToolSlug(input.toolSlug);
  const sourceDefault = normalizeSource(input.sourceDefault);

  if (!creatorUserId || !toolSlug) {
    throw new Error("creatorUserId and toolSlug are required");
  }

  const region =
    normalizeRegion(input.region || null, "ALL") === "ALL"
      ? await detectUserRegion(creatorUserId, "ALL")
      : (normalizeRegion(input.region || null, "ALL") as MembershipRegion);

  if (!region) {
    throw new Error("Unable to resolve user region");
  }

  const referralCode = await ensureUserReferralCode({
    userId: creatorUserId,
    region,
  });
  const shareCode = await findUniqueShareCode(region);
  const createdAt = nowIso();

  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_links")
      .insert({
        creator_user_id: creatorUserId,
        tool_slug: toolSlug,
        share_code: shareCode,
        source_default: sourceDefault || null,
        is_active: true,
        click_count: 0,
        created_at: createdAt,
      })
      .select("*")
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Failed to create referral link");
    }

    const link = mapIntlLink(data);
    return {
      link,
      shareUrl: buildReferralShareUrl({
        shareCode: link.shareCode,
        source: link.sourceDefault,
        origin: input.origin,
      }),
      referralCode,
    };
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const createResult = await db.collection(REFERRAL_LINKS_COLLECTION).add({
    creator_user_id: creatorUserId,
    tool_slug: toolSlug,
    share_code: shareCode,
    source_default: sourceDefault || null,
    is_active: true,
    click_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
  });
  const created = await db
    .collection(REFERRAL_LINKS_COLLECTION)
    .where({ _id: createResult.id })
    .limit(1)
    .get();
  const link = mapCnLink(created?.data?.[0] || {});

  return {
    link,
    shareUrl: buildReferralShareUrl({
      shareCode: link.shareCode,
      source: link.sourceDefault,
      origin: input.origin,
    }),
    referralCode,
  };
}

async function listReferralLinksByUserByRegion(
  region: MembershipRegion,
  userId: string,
  limit: number
): Promise<ReferralLinkRecord[]> {
  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_links")
      .select("*")
      .eq("creator_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map(mapIntlLink);
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db
    .collection(REFERRAL_LINKS_COLLECTION)
    .where({ creator_user_id: userId })
    .get();
  const rows = (Array.isArray(result?.data) ? result.data : []).map(mapCnLink);
  return rows
    .sort((a: ReferralLinkRecord, b: ReferralLinkRecord) =>
      a.createdAt > b.createdAt ? -1 : 1
    )
    .slice(0, limit);
}

export async function listReferralLinksByUser(
  userId: string,
  limit = 50,
  region: MarketRegion = "ALL"
): Promise<ReferralLinkRecord[]> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Error("userId is required");
  }

  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)));
  const targets = resolveReadRegions(normalizeRegion(region, "ALL"));

  const rows: ReferralLinkRecord[] = [];
  for (const target of targets) {
    try {
      rows.push(
        ...(await listReferralLinksByUserByRegion(target, normalizedUserId, safeLimit))
      );
    } catch {
      // ignore per-region failures to keep ALL mode resilient
    }
  }

  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, safeLimit);
}

async function resolveReferralLinkByShareCodeByRegion(
  region: MembershipRegion,
  shareCode: string
): Promise<ReferralLinkRecord | null> {
  const code = normalizeShareCode(shareCode);
  if (!code) return null;

  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_links")
      .select("*")
      .eq("share_code", code)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapIntlLink(data) : null;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db
    .collection(REFERRAL_LINKS_COLLECTION)
    .where({ share_code: code })
    .limit(1)
    .get();
  const row = result?.data?.[0];
  return row ? mapCnLink(row) : null;
}

export async function resolveReferralLinkByShareCode(
  shareCode: string,
  region: MarketRegion = "ALL"
): Promise<ReferralLinkRecord | null> {
  const code = normalizeShareCode(shareCode);
  if (!code) return null;

  const targets = resolveReadRegions(normalizeRegion(region, "ALL"));
  for (const target of targets) {
    try {
      const link = await resolveReferralLinkByShareCodeByRegion(target, code);
      if (link) return link;
    } catch {
      // noop
    }
  }

  return null;
}

export async function resolveReferralOwnerByShareCode(
  shareCode: string,
  region: MarketRegion = "ALL"
): Promise<ResolvedReferralOwner | null> {
  const code = normalizeShareCode(shareCode);
  if (!code) return null;

  const targets = resolveReadRegions(normalizeRegion(region, "ALL"));

  for (const target of targets) {
    try {
      const link = await resolveReferralLinkByShareCodeByRegion(target, code);
      if (link?.creatorUserId) {
        return {
          creatorUserId: link.creatorUserId,
          shareCode: link.shareCode,
          toolSlug: link.toolSlug || null,
          sourceDefault: link.sourceDefault || null,
          isActive: link.isActive,
          codeType: "link",
          region: target,
        };
      }

      if (target === "INTL") {
        const wallet = await loadIntlWalletByReferralCode(code);
        if (wallet?.user_id) {
          return {
            creatorUserId: String(wallet.user_id),
            shareCode: code,
            toolSlug: null,
            sourceDefault: null,
            isActive: true,
            codeType: "referral_code",
            region: "INTL",
          };
        }
      } else {
        const { user } = await loadCnUserByReferralCode(code);
        if (user?._id) {
          return {
            creatorUserId: String(user._id),
            shareCode: code,
            toolSlug: null,
            sourceDefault: null,
            isActive: true,
            codeType: "referral_code",
            region: "CN",
          };
        }
      }
    } catch {
      // noop
    }
  }

  return null;
}

export function getClientIpFromRequest(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip") || null;
}

export async function recordReferralClick(input: {
  shareCode: string;
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  landingPath?: string | null;
  region?: MarketRegion;
}) {
  const code = normalizeShareCode(input.shareCode);
  if (!code) return;

  const owner = await resolveReferralOwnerByShareCode(code, input.region || "ALL");
  if (!owner) return;

  const source = normalizeSource(input.source) || owner.sourceDefault || null;
  const payload = {
    share_code: code,
    source: source || null,
    ip_hash: hashSensitive(input.ip),
    user_agent_hash: hashSensitive(input.userAgent),
    landing_path: String(input.landingPath || "").slice(0, 255) || null,
    created_at: nowIso(),
  };

  if (owner.region === "INTL") {
    const { error } = await supabaseAdmin.from("referral_clicks").insert(payload);
    if (error) throw new Error(error.message);

    const { data: linkRow } = await supabaseAdmin
      .from("referral_links")
      .select("id,click_count")
      .eq("share_code", code)
      .maybeSingle();

    if (linkRow?.id) {
      await supabaseAdmin
        .from("referral_links")
        .update({ click_count: safeNumber(linkRow.click_count) + 1 })
        .eq("id", linkRow.id);
    }
    return;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  await db.collection(REFERRAL_CLICKS_COLLECTION).add(payload);

  const existing = await db
    .collection(REFERRAL_LINKS_COLLECTION)
    .where({ share_code: code })
    .limit(1)
    .get();

  const link = existing?.data?.[0];
  if (link?._id) {
    await db.collection(REFERRAL_LINKS_COLLECTION).doc(link._id).update({
      click_count: safeNumber(link.click_count) + 1,
      updated_at: nowIso(),
    });
  }
}

export function encodeReferralAttributionCookie(value: ReferralAttribution) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeReferralAttributionCookie(
  value?: string | null
): ReferralAttribution | null {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const shareCode = normalizeShareCode(decoded?.shareCode);
    if (!shareCode) return null;

    const ts = Number(decoded?.ts || 0);
    const now = Date.now();
    if (
      !Number.isFinite(ts) ||
      ts <= 0 ||
      now - ts > REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS * 1000
    ) {
      return null;
    }

    return {
      shareCode,
      source: normalizeSource(decoded?.source) || null,
      toolSlug: normalizeToolSlug(decoded?.toolSlug) || null,
      ts,
    };
  } catch {
    return null;
  }
}

export function extractReferralAttribution(
  request: NextRequest
): ReferralAttribution | null {
  const queryRef = normalizeShareCode(request.nextUrl.searchParams.get("ref"));
  if (queryRef) {
    return {
      shareCode: queryRef,
      source: normalizeSource(request.nextUrl.searchParams.get("source")) || null,
      toolSlug:
        normalizeToolSlug(request.nextUrl.pathname.split("/")[2] || "") || null,
      ts: Date.now(),
    };
  }

  return decodeReferralAttributionCookie(
    request.cookies.get(REFERRAL_ATTRIBUTION_COOKIE)?.value || null
  );
}

async function markReferralClickRegistered(input: {
  region: MembershipRegion;
  shareCode: string;
  invitedUserId: string;
}) {
  const shareCode = normalizeShareCode(input.shareCode);
  const invitedUserId = normalizeUserId(input.invitedUserId);
  if (!shareCode || !invitedUserId) return;

  if (input.region === "INTL") {
    const { data: click } = await supabaseAdmin
      .from("referral_clicks")
      .select("id")
      .eq("share_code", shareCode)
      .is("registered_user_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!click?.id) return;

    await supabaseAdmin
      .from("referral_clicks")
      .update({ registered_user_id: invitedUserId })
      .eq("id", click.id)
      .is("registered_user_id", null);
    return;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const clicks = await db
    .collection(REFERRAL_CLICKS_COLLECTION)
    .where({ share_code: shareCode })
    .get();

  const target = (Array.isArray(clicks?.data) ? clicks.data : [])
    .filter((row: any) => !row?.registered_user_id)
    .sort((a: any, b: any) =>
      String(a?.created_at || "") < String(b?.created_at || "") ? 1 : -1
    )[0];

  if (!target?._id) return;

  await db.collection(REFERRAL_CLICKS_COLLECTION).doc(target._id).update({
    registered_user_id: invitedUserId,
    updated_at: nowIso(),
  });
}

async function findRelationByInvitedUser(
  invitedUserId: string,
  region: MembershipRegion
): Promise<RelationInternal | null> {
  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_relations")
      .select(
        "id,inviter_user_id,invited_user_id,share_code,tool_slug,first_tool_id,status,created_at,activated_at,first_paid_at,first_paid_transaction_id"
      )
      .eq("invited_user_id", invitedUserId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapIntlRelation(data) : null;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db
    .collection(REFERRAL_RELATIONS_COLLECTION)
    .where({ invited_user_id: invitedUserId })
    .limit(1)
    .get();

  const row = result?.data?.[0];
  return row ? mapCnRelation(row) : null;
}

async function updateRelationPartial(
  region: MembershipRegion,
  relationId: string,
  patch: Record<string, any>
) {
  if (!relationId || Object.keys(patch).length === 0) return;

  if (region === "INTL") {
    const { error } = await supabaseAdmin
      .from("referral_relations")
      .update(patch)
      .eq("id", relationId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  await db
    .collection(REFERRAL_RELATIONS_COLLECTION)
    .doc(relationId)
    .update({ ...patch, updated_at: nowIso() });
}

async function findRewardByReference(
  region: MembershipRegion,
  referenceId: string
): Promise<RewardInternal | null> {
  if (!referenceId) return null;

  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_rewards")
      .select("*")
      .eq("reference_id", referenceId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    return data ? mapIntlReward(data) : null;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ reference_id: referenceId })
    .limit(1)
    .get();
  const row = result?.data?.[0] || null;
  return row ? mapCnReward(row) : null;
}

async function insertRewardPending(input: {
  region: MembershipRegion;
  relationId: string | null;
  userId: string;
  rewardType: string;
  amount: number;
  referenceId: string;
  relatedTransactionId?: string | null;
  meta?: Record<string, any>;
}): Promise<RewardInternal> {
  const payload = {
    relation_id: input.relationId,
    user_id: input.userId,
    reward_type: input.rewardType,
    amount: input.amount,
    unit: "membership_days",
    status: "rollback_pending",
    reference_id: input.referenceId,
    related_transaction_id: input.relatedTransactionId || null,
    created_at: nowIso(),
    meta: input.meta || {},
  };

  if (input.region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_rewards")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        const existing = await findRewardByReference(input.region, input.referenceId);
        if (!existing) {
          throw new Error(error.message);
        }
        return existing;
      }
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Failed to create referral reward");
    }

    return mapIntlReward(data);
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const existing = await findRewardByReference(input.region, input.referenceId);
  if (existing) {
    return existing;
  }

  const create = await db.collection(REFERRAL_REWARDS_COLLECTION).add(payload);
  const created = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ _id: create.id })
    .limit(1)
    .get();

  return mapCnReward(created?.data?.[0] || { ...payload, _id: create.id });
}

async function updateRewardStatus(input: {
  region: MembershipRegion;
  rewardId: string;
  status: "granted" | "revoked" | "rollback_pending";
  grantedAt?: string | null;
  revokedAt?: string | null;
  metaPatch?: Record<string, any>;
}) {
  const patch: Record<string, any> = {
    status: input.status,
  };

  if (typeof input.grantedAt !== "undefined") {
    patch.granted_at = input.grantedAt;
  }
  if (typeof input.revokedAt !== "undefined") {
    patch.revoked_at = input.revokedAt;
  }

  if (input.region === "INTL") {
    const { data: rewardRow } = await supabaseAdmin
      .from("referral_rewards")
      .select("meta")
      .eq("id", input.rewardId)
      .maybeSingle();

    const nextMeta = {
      ...((rewardRow?.meta as Record<string, any> | undefined) || {}),
      ...(input.metaPatch || {}),
    };

    patch.meta = nextMeta;

    const { error } = await supabaseAdmin
      .from("referral_rewards")
      .update(patch)
      .eq("id", input.rewardId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const row = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ _id: input.rewardId })
    .limit(1)
    .get();
  const currentMeta =
    row?.data?.[0]?.meta && typeof row.data[0].meta === "object"
      ? row.data[0].meta
      : {};

  await db.collection(REFERRAL_REWARDS_COLLECTION).doc(input.rewardId).update({
    ...patch,
    meta: {
      ...currentMeta,
      ...(input.metaPatch || {}),
    },
    updated_at: nowIso(),
  });
}

async function grantMembershipReward(input: {
  region: MembershipRegion;
  relationId: string;
  userId: string;
  rewardType: string;
  amount: number;
  referenceId: string;
  relatedTransactionId?: string | null;
  meta?: Record<string, any>;
  planId?: string | null;
}) {
  const existing = await findRewardByReference(input.region, input.referenceId);

  if (existing?.status === "granted") {
    return { granted: false, alreadyProcessed: true };
  }

  if (existing?.status === "revoked") {
    return { granted: false, alreadyProcessed: true };
  }

  const rewardRow =
    existing ||
    (await insertRewardPending({
      region: input.region,
      relationId: input.relationId,
      userId: input.userId,
      rewardType: input.rewardType,
      amount: input.amount,
      referenceId: input.referenceId,
      relatedTransactionId: input.relatedTransactionId,
      meta: input.meta,
    }));

  const grantResult = await applyMembershipDaysDelta({
    region: input.region,
    userId: input.userId,
    daysDelta: input.amount,
    referenceId: input.referenceId,
    reason: input.rewardType,
    relatedTransactionId: input.relatedTransactionId || null,
    planId: input.planId || null,
  });

  if (!grantResult.success) {
    await updateRewardStatus({
      region: input.region,
      rewardId: rewardRow.id,
      status: "rollback_pending",
      metaPatch: {
        lastGrantError: grantResult.error || "unknown",
        lastGrantAttemptAt: nowIso(),
      },
    });

    return { granted: false, alreadyProcessed: false, error: grantResult.error };
  }

  await updateRewardStatus({
    region: input.region,
    rewardId: rewardRow.id,
    status: "granted",
    grantedAt: nowIso(),
    metaPatch: {
      grantedBy: "market-referral",
      lastGrantAttemptAt: nowIso(),
      ...(input.meta || {}),
    },
  });

  return { granted: true, alreadyProcessed: false };
}

async function loadRelationAcrossRegions(
  invitedUserId: string,
  preferredRegion?: MarketRegion
): Promise<RelationInternal | null> {
  const targetRegion = normalizeRegion(preferredRegion, "ALL");
  const targets = resolveReadRegions(targetRegion);

  for (const region of targets) {
    try {
      const relation = await findRelationByInvitedUser(invitedUserId, region);
      if (relation?.id) {
        return relation;
      }
    } catch {
      // noop
    }
  }

  return null;
}

export async function bindReferralFromRequest(input: {
  request: NextRequest;
  invitedUserId?: string | null;
  invitedEmail?: string | null;
  region?: MarketRegion;
}) {
  const invitedUserId = normalizeUserId(input.invitedUserId);
  if (!invitedUserId) {
    return { bound: false, reason: "missing_user_id" as const };
  }

  const attribution = extractReferralAttribution(input.request);
  if (!attribution?.shareCode) {
    return { bound: false, reason: "no_attribution" as const };
  }

  const owner = await resolveReferralOwnerByShareCode(
    attribution.shareCode,
    input.region || "ALL"
  );
  if (!owner || !owner.isActive) {
    return { bound: false, reason: "invalid_share_code" as const };
  }

  if (owner.creatorUserId === invitedUserId) {
    return { bound: false, reason: "self_referral" as const };
  }

  const region = owner.region;
  const relationToolSlug =
    normalizeToolSlug(attribution.toolSlug || owner.toolSlug || "") || null;
  const createdAt = nowIso();

  if (region === "INTL") {
    await ensureUserWallet(invitedUserId);
    const wallet = await loadIntlWallet(invitedUserId);

    if (wallet?.referred_by) {
      return { bound: false, reason: "already_bound" as const };
    }

    const existingRelation = await findRelationByInvitedUser(invitedUserId, "INTL");
    if (existingRelation?.id) {
      return {
        bound: false,
        reason: "already_bound" as const,
        relationId: existingRelation.id,
      };
    }

    const { data: created, error } = await supabaseAdmin
      .from("referral_relations")
      .insert({
        inviter_user_id: owner.creatorUserId,
        invited_user_id: invitedUserId,
        share_code: owner.shareCode,
        tool_slug: relationToolSlug,
        status: "bound",
        created_at: createdAt,
      })
      .select("id")
      .maybeSingle();

    if (error || !created?.id) {
      if (error?.code === "23505") {
        const relation = await findRelationByInvitedUser(invitedUserId, "INTL");
        return {
          bound: false,
          reason: "already_bound" as const,
          relationId: relation?.id,
        };
      }
      throw new Error(error?.message || "Failed to create relation");
    }

    const relationId = String(created.id);

    await supabaseAdmin
      .from("user_wallets")
      .update({ referred_by: owner.creatorUserId, referred_at: createdAt })
      .eq("user_id", invitedUserId)
      .is("referred_by", null);

    await markReferralClickRegistered({
      region,
      shareCode: owner.shareCode,
      invitedUserId,
    }).catch(() => null);

    return {
      bound: true,
      relationId,
      shareCode: owner.shareCode,
      inviterUserId: owner.creatorUserId,
      invitedUserId,
      inviterReward: 0,
      invitedReward: 0,
      region,
    };
  }

  const { db, user } = await loadCnUserById(invitedUserId);
  let targetUser = user;
  const fallbackEmail = String(input.invitedEmail || "").trim().toLowerCase();

  if (!targetUser && fallbackEmail) {
    const byEmail = await db
      .collection(CN_USERS_COLLECTION)
      .where({ email: fallbackEmail })
      .limit(1)
      .get();
    targetUser = byEmail?.data?.[0] || null;
  }

  if (!targetUser?._id) {
    return { bound: false, reason: "missing_user_id" as const };
  }

  if (targetUser.referred_by) {
    return { bound: false, reason: "already_bound" as const };
  }

  const existingCnRelation = await findRelationByInvitedUser(invitedUserId, "CN");
  if (existingCnRelation?.id) {
    return {
      bound: false,
      reason: "already_bound" as const,
      relationId: existingCnRelation.id,
    };
  }

  await ensureCloudbaseReferralCollections(db);
  const createResult = await db.collection(REFERRAL_RELATIONS_COLLECTION).add({
    inviter_user_id: owner.creatorUserId,
    invited_user_id: invitedUserId,
    share_code: owner.shareCode,
    tool_slug: relationToolSlug,
    status: "bound",
    created_at: createdAt,
    updated_at: createdAt,
  });

  const relationId = String(createResult.id);

  await db.collection(CN_USERS_COLLECTION).doc(targetUser._id).update({
    referred_by: owner.creatorUserId,
    referred_at: createdAt,
    updated_at: createdAt,
  });

  await markReferralClickRegistered({
    region,
    shareCode: owner.shareCode,
    invitedUserId,
  }).catch(() => null);

  return {
    bound: true,
    relationId,
    shareCode: owner.shareCode,
    inviterUserId: owner.creatorUserId,
    invitedUserId,
    inviterReward: 0,
    invitedReward: 0,
    region,
  };
}

export async function grantReferralFirstUseReward(input: {
  invitedUserId?: string | null;
  toolId?: string | null;
  region?: MarketRegion;
}): Promise<ReferralFirstUseRewardResult> {
  const invitedUserId = normalizeUserId(input.invitedUserId);
  if (!invitedUserId) {
    return { handled: false, reason: "missing_user_id" };
  }

  const relation = await loadRelationAcrossRegions(invitedUserId, input.region);
  if (!relation?.id) {
    return { handled: false, reason: "no_relation" };
  }

  const inviterUserId = normalizeUserId(relation.inviterUserId);
  if (!inviterUserId) {
    return {
      handled: false,
      reason: "relation_incomplete",
      relationId: relation.id,
    };
  }

  if (inviterUserId === invitedUserId) {
    return {
      handled: false,
      reason: "self_referral",
      relationId: relation.id,
    };
  }

  const firstToolId = normalizeToolSlug(input.toolId || "") || null;
  const relationPatch: Record<string, any> = {};
  if (!relation.activatedAt) {
    relationPatch.activated_at = nowIso();
  }
  if (!relation.firstToolId && firstToolId) {
    relationPatch.first_tool_id = firstToolId;
  }
  if (Object.keys(relationPatch).length > 0) {
    await updateRelationPartial(relation.region, relation.id, relationPatch);
  }

  const inviterReferenceId = `ref_first_use_inviter_${relation.id}`;
  const invitedReferenceId = `ref_first_use_invited_${relation.id}`;

  const inviterReward = await grantMembershipReward({
    region: relation.region,
    relationId: relation.id,
    userId: inviterUserId,
    rewardType: "first_use_inviter",
    amount: REFERRAL_INVITER_FIRST_USE_BONUS,
    referenceId: inviterReferenceId,
    planId: "basic",
    meta: {
      invitedUserId,
      firstToolId,
    },
  });

  const invitedReward = await grantMembershipReward({
    region: relation.region,
    relationId: relation.id,
    userId: invitedUserId,
    rewardType: "first_use_invited",
    amount: REFERRAL_INVITED_FIRST_USE_BONUS,
    referenceId: invitedReferenceId,
    planId: "basic",
    meta: {
      inviterUserId,
      firstToolId,
    },
  });

  return {
    handled: true,
    relationId: relation.id,
    inviterUserId,
    invitedUserId,
    inviterRewardGranted: inviterReward.granted,
    invitedRewardGranted: invitedReward.granted,
    alreadyProcessed:
      inviterReward.alreadyProcessed && invitedReward.alreadyProcessed,
    region: relation.region,
  };
}

async function trySetFirstPaidForRelation(
  relation: RelationInternal,
  transactionId: string
): Promise<{ claimed: boolean; relation: RelationInternal }> {
  if (relation.firstPaidTransactionId) {
    return { claimed: false, relation };
  }

  const paidAt = nowIso();

  if (relation.region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_relations")
      .update({
        first_paid_at: paidAt,
        first_paid_transaction_id: transactionId,
        status: relation.status === "bound" ? "paid" : relation.status,
      })
      .eq("id", relation.id)
      .is("first_paid_transaction_id", null)
      .select(
        "id,inviter_user_id,invited_user_id,share_code,tool_slug,first_tool_id,status,created_at,activated_at,first_paid_at,first_paid_transaction_id"
      )
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    if (data) {
      return { claimed: true, relation: mapIntlRelation(data) };
    }

    const latest = await findRelationByInvitedUser(relation.invitedUserId, "INTL");
    return {
      claimed: false,
      relation: latest || relation,
    };
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const latestResult = await db
    .collection(REFERRAL_RELATIONS_COLLECTION)
    .where({ _id: relation.id })
    .limit(1)
    .get();
  const latestRaw = latestResult?.data?.[0] || null;
  const latest = latestRaw ? mapCnRelation(latestRaw) : relation;

  if (latest.firstPaidTransactionId) {
    return { claimed: false, relation: latest };
  }

  await db.collection(REFERRAL_RELATIONS_COLLECTION).doc(relation.id).update({
    first_paid_at: paidAt,
    first_paid_transaction_id: transactionId,
    status: relation.status === "bound" ? "paid" : relation.status,
    updated_at: paidAt,
  });

  const updatedResult = await db
    .collection(REFERRAL_RELATIONS_COLLECTION)
    .where({ _id: relation.id })
    .limit(1)
    .get();

  return {
    claimed: true,
    relation: mapCnRelation(updatedResult?.data?.[0] || latestRaw || relation),
  };
}

export async function grantReferralFirstPaymentReward(input: {
  invitedUserId?: string | null;
  transactionId?: string | null;
  provider?: string | null;
  region?: MarketRegion;
  rewardDays?: number | null;
  billingCycle?: BillingCycle | null;
}): Promise<ReferralFirstPaymentRewardResult> {
  const invitedUserId = normalizeUserId(input.invitedUserId);
  if (!invitedUserId) {
    return { handled: false, reason: "missing_user_id" };
  }

  const transactionId = String(input.transactionId || "").trim();
  if (!transactionId) {
    return { handled: false, reason: "missing_transaction" };
  }

  const relation = await loadRelationAcrossRegions(invitedUserId, input.region);
  if (!relation?.id) {
    return { handled: false, reason: "no_relation" };
  }

  const inviterUserId = normalizeUserId(relation.inviterUserId);
  if (!inviterUserId) {
    return {
      handled: false,
      reason: "relation_incomplete",
      relationId: relation.id,
    };
  }

  if (inviterUserId === invitedUserId) {
    return {
      handled: false,
      reason: "self_referral",
      relationId: relation.id,
    };
  }

  const firstPaymentReferenceInviter = `ref_first_payment_inviter_${relation.id}`;
  const firstPaymentReferenceInvited = `ref_first_payment_invited_${relation.id}`;

  const relationClaim = await trySetFirstPaidForRelation(relation, transactionId);
  const latestRelation = relationClaim.relation;

  if (
    latestRelation.firstPaidTransactionId &&
    latestRelation.firstPaidTransactionId !== transactionId
  ) {
    return {
      handled: true,
      relationId: latestRelation.id,
      inviterUserId,
      invitedUserId,
      transactionId,
      inviterRewardGranted: false,
      invitedRewardGranted: false,
      alreadyProcessed: true,
      region: latestRelation.region,
    };
  }

  const rewardContext = await resolveFirstPaymentRewardContext({
    region: latestRelation.region,
    transactionId,
    rewardDays: input.rewardDays,
    billingCycle: input.billingCycle || null,
  });

  const inviterReward = await grantMembershipReward({
    region: latestRelation.region,
    relationId: latestRelation.id,
    userId: inviterUserId,
    rewardType: "first_payment_inviter",
    amount: rewardContext.rewardDays,
    referenceId: firstPaymentReferenceInviter,
    relatedTransactionId: transactionId,
    planId: "basic",
    meta: {
      provider: String(input.provider || "").trim() || null,
      invitedUserId,
      rewardPlanId: "basic",
      rewardBillingCycle: rewardContext.billingCycle,
      rewardDays: rewardContext.rewardDays,
    },
  });

  const invitedReward = await grantMembershipReward({
    region: latestRelation.region,
    relationId: latestRelation.id,
    userId: invitedUserId,
    rewardType: "first_payment_invited",
    amount: rewardContext.rewardDays,
    referenceId: firstPaymentReferenceInvited,
    relatedTransactionId: transactionId,
    planId: "basic",
    meta: {
      provider: String(input.provider || "").trim() || null,
      inviterUserId,
      rewardPlanId: "basic",
      rewardBillingCycle: rewardContext.billingCycle,
      rewardDays: rewardContext.rewardDays,
    },
  });

  return {
    handled: true,
    relationId: latestRelation.id,
    inviterUserId,
    invitedUserId,
    transactionId,
    inviterRewardGranted: inviterReward.granted,
    invitedRewardGranted: invitedReward.granted,
    alreadyProcessed:
      inviterReward.alreadyProcessed && invitedReward.alreadyProcessed,
    region: latestRelation.region,
  };
}

async function listRewardsByTransaction(
  region: MembershipRegion,
  transactionId: string
): Promise<RewardInternal[]> {
  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_rewards")
      .select("*")
      .eq("related_transaction_id", transactionId)
      .in("reward_type", Array.from(FIRST_PAYMENT_REWARD_TYPES));

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map(mapIntlReward);
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ related_transaction_id: transactionId })
    .get();

  const rows = Array.isArray(result?.data) ? result.data : [];
  return rows
    .map(mapCnReward)
    .filter((row: RewardInternal) => FIRST_PAYMENT_REWARD_TYPES.has(row.rewardType));
}

async function claimRewardForRollback(reward: RewardInternal) {
  if (reward.status !== "granted") {
    return false;
  }

  if (reward.region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_rewards")
      .update({ status: "rollback_pending" })
      .eq("id", reward.id)
      .eq("status", "granted")
      .select("id")
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    return Boolean(data?.id);
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const latest = await db
    .collection(REFERRAL_REWARDS_COLLECTION)
    .where({ _id: reward.id })
    .limit(1)
    .get();
  const row = latest?.data?.[0];
  if (!row || row.status !== "granted") {
    return false;
  }

  await db.collection(REFERRAL_REWARDS_COLLECTION).doc(reward.id).update({
    status: "rollback_pending",
    updated_at: nowIso(),
  });

  return true;
}

export async function rollbackReferralRewardsByTransaction(input: {
  transactionId: string;
  provider?: string | null;
  region?: MarketRegion;
  reason?: string | null;
}): Promise<ReferralRollbackResult> {
  const transactionId = String(input.transactionId || "").trim();
  const scope = normalizeRegion(input.region || null, "ALL");

  if (!transactionId) {
    return {
      handled: false,
      transactionId: "",
      processedRewards: 0,
      revokedRewards: 0,
      pendingRewards: 0,
      region: scope,
    };
  }

  const regions = resolveReadRegions(scope);
  let processedRewards = 0;
  let revokedRewards = 0;
  let pendingRewards = 0;

  for (const region of regions) {
    let rewards: RewardInternal[] = [];
    try {
      rewards = await listRewardsByTransaction(region, transactionId);
    } catch {
      continue;
    }

    for (const reward of rewards) {
      processedRewards += 1;

      if (reward.status === "revoked") {
        continue;
      }

      const claimed = await claimRewardForRollback(reward).catch(() => false);
      if (!claimed) {
        continue;
      }

      const rollbackReferenceId = `rollback_${reward.referenceId}`;
      const rollbackResult = await applyMembershipDaysDelta({
        region: reward.region,
        userId: reward.userId,
        daysDelta: -Math.abs(safeNumber(reward.amount)),
        referenceId: rollbackReferenceId,
        reason: "refund_rollback",
        relatedTransactionId: transactionId,
      });

      if (!rollbackResult.success) {
        pendingRewards += 1;
        await updateRewardStatus({
          region: reward.region,
          rewardId: reward.id,
          status: "rollback_pending",
          metaPatch: {
            rollbackProvider: String(input.provider || "").trim() || null,
            rollbackReason: String(input.reason || "").trim() || "refund",
            rollbackTransactionId: transactionId,
            rollbackError: rollbackResult.error || "unknown",
            rollbackAttemptAt: nowIso(),
          },
        }).catch(() => null);
        continue;
      }

      revokedRewards += 1;
      await updateRewardStatus({
        region: reward.region,
        rewardId: reward.id,
        status: "revoked",
        revokedAt: nowIso(),
        metaPatch: {
          rollbackProvider: String(input.provider || "").trim() || null,
          rollbackReason: String(input.reason || "").trim() || "refund",
          rollbackTransactionId: transactionId,
          rollbackReferenceId,
          rollbackAttemptAt: nowIso(),
        },
      }).catch(() => null);
    }
  }

  return {
    handled: processedRewards > 0,
    transactionId,
    processedRewards,
    revokedRewards,
    pendingRewards,
    region: scope,
  };
}

function createDateBuckets(days: number) {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const buckets: MarketTrendPoint[] = [];
  const map = new Map<string, MarketTrendPoint>();
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  for (let i = safeDays - 1; i >= 0; i -= 1) {
    const cursor = new Date(end);
    cursor.setUTCDate(end.getUTCDate() - i);
    const key = cursor.toISOString().slice(0, 10);
    const point: MarketTrendPoint = {
      date: key,
      clicks: 0,
      invites: 0,
      activated: 0,
      rewardCredits: 0,
      rewardDays: 0,
    };
    buckets.push(point);
    map.set(key, point);
  }

  return { buckets, map };
}

async function getReferralStatsByUserByRegion(
  userId: string,
  region: MembershipRegion
) {
  if (region === "INTL") {
    const { data: links, error: linkError } = await supabaseAdmin
      .from("referral_links")
      .select("share_code,click_count")
      .eq("creator_user_id", userId);
    if (linkError) throw new Error(linkError.message);

    const linkCount = safeNumber(links?.length || 0);
    const clickCount = (links || []).reduce(
      (sum: number, row: any) => sum + safeNumber(row?.click_count),
      0
    );

    const { count: invitedCount, error: invitedError } = await supabaseAdmin
      .from("referral_relations")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", userId);
    if (invitedError) throw new Error(invitedError.message);

    const { data: rewards, error: rewardError } = await supabaseAdmin
      .from("referral_rewards")
      .select("reward_type,amount,status")
      .eq("user_id", userId)
      .eq("status", "granted");
    if (rewardError) throw new Error(rewardError.message);

    let rewardDays = 0;
    let firstUse = 0;
    let firstPayment = 0;

    for (const reward of rewards || []) {
      const amount = safeNumber((reward as any)?.amount);
      rewardDays += amount;
      const type = String((reward as any)?.reward_type || "");
      if (type.startsWith("first_use_")) {
        firstUse += amount;
      }
      if (type.startsWith("first_payment_")) {
        firstPayment += amount;
      }
    }

    return {
      linkCount,
      clickCount,
      invitedCount: safeNumber(invitedCount),
      rewardDays,
      firstUse,
      firstPayment,
    };
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const [linksResult, relationsResult, rewardsResult] = await Promise.all([
    db.collection(REFERRAL_LINKS_COLLECTION).where({ creator_user_id: userId }).get(),
    db
      .collection(REFERRAL_RELATIONS_COLLECTION)
      .where({ inviter_user_id: userId })
      .get(),
    db
      .collection(REFERRAL_REWARDS_COLLECTION)
      .where({ user_id: userId, status: "granted" })
      .get(),
  ]);

  const links = Array.isArray(linksResult?.data) ? linksResult.data : [];
  const relations = Array.isArray(relationsResult?.data)
    ? relationsResult.data
    : [];
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : [];

  const clickCount = links.reduce(
    (sum: number, row: any) => sum + safeNumber(row?.click_count),
    0
  );

  let rewardDays = 0;
  let firstUse = 0;
  let firstPayment = 0;
  for (const reward of rewards) {
    const amount = safeNumber((reward as any)?.amount);
    rewardDays += amount;
    const type = String((reward as any)?.reward_type || "");
    if (type.startsWith("first_use_")) {
      firstUse += amount;
    }
    if (type.startsWith("first_payment_")) {
      firstPayment += amount;
    }
  }

  return {
    linkCount: links.length,
    clickCount,
    invitedCount: relations.length,
    rewardDays,
    firstUse,
    firstPayment,
  };
}

export async function getReferralStatsByUser(
  userId: string,
  region: MarketRegion = "ALL"
): Promise<ReferralStats> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new Error("userId is required");
  }

  const targets = resolveReadRegions(normalizeRegion(region, "ALL"));

  let linkCount = 0;
  let clickCount = 0;
  let invitedCount = 0;
  let rewardDays = 0;
  let firstUseRewardDays = 0;
  let firstPaymentRewardDays = 0;

  for (const target of targets) {
    try {
      const stats = await getReferralStatsByUserByRegion(normalizedUserId, target);
      linkCount += stats.linkCount;
      clickCount += stats.clickCount;
      invitedCount += stats.invitedCount;
      rewardDays += stats.rewardDays;
      firstUseRewardDays += stats.firstUse;
      firstPaymentRewardDays += stats.firstPayment;
    } catch {
      // noop
    }
  }

  return {
    linkCount,
    clickCount,
    invitedCount,
    conversionRate:
      clickCount > 0
        ? Number(((invitedCount / clickCount) * 100).toFixed(2))
        : 0,
    rewardCredits: rewardDays,
    rewardDays,
    totalRewardCredits: rewardDays,
    totalRewardDays: rewardDays,
    signupRewardCredits: 0,
    firstUseRewardCredits: firstUseRewardDays,
    firstPaymentRewardDays,
    inviterSignupBonus: REFERRAL_INVITER_SIGNUP_BONUS,
    invitedSignupBonus: REFERRAL_INVITED_SIGNUP_BONUS,
    inviterFirstUseBonus: REFERRAL_INVITER_FIRST_USE_BONUS,
    invitedFirstUseBonus: REFERRAL_INVITED_FIRST_USE_BONUS,
    inviterFirstPaymentBonus: REFERRAL_INVITER_FIRST_PAYMENT_BONUS,
    invitedFirstPaymentBonus: REFERRAL_INVITED_FIRST_PAYMENT_BONUS,
    basicMonthlyRewardDays: getBasicMembershipRewardDays("monthly"),
    basicYearlyRewardDays: getBasicMembershipRewardDays("yearly"),
  };
}

async function getInviteSummaryByRegion(input: {
  userId: string;
  origin?: string | null;
  region: MembershipRegion;
}) {
  const referralCode = await ensureUserReferralCode({
    userId: input.userId,
    region: input.region,
  });
  const shareUrl = buildReferralShareUrl({
    shareCode: referralCode,
    origin: input.origin,
  });

  let clickCount = 0;
  let invitedCount = 0;

  if (input.region === "INTL") {
    const clickResult = await supabaseAdmin
      .from("referral_clicks")
      .select("id", { count: "exact", head: true })
      .eq("share_code", referralCode);
    if (clickResult.error) {
      throw new Error(clickResult.error.message);
    }
    clickCount = safeNumber(clickResult.count);

    const relationResult = await supabaseAdmin
      .from("referral_relations")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", input.userId);
    if (relationResult.error) {
      throw new Error(relationResult.error.message);
    }
    invitedCount = safeNumber(relationResult.count);
  } else {
    const db = getDatabase();
    await ensureCloudbaseReferralCollections(db);

    const clicks = await db
      .collection(REFERRAL_CLICKS_COLLECTION)
      .where({ share_code: referralCode })
      .get();
    clickCount = Array.isArray(clicks?.data) ? clicks.data.length : 0;

    const relations = await db
      .collection(REFERRAL_RELATIONS_COLLECTION)
      .where({ inviter_user_id: input.userId })
      .get();
    invitedCount = Array.isArray(relations?.data) ? relations.data.length : 0;
  }

  const stats = await getReferralStatsByUser(input.userId, input.region);

  return {
    referralCode,
    shareUrl,
    clickCount,
    invitedCount,
    conversionRate:
      clickCount > 0
        ? Number(((invitedCount / clickCount) * 100).toFixed(2))
        : 0,
    rewardCredits: stats.rewardCredits,
    rewardDays: stats.rewardDays,
    totalRewardCredits: stats.totalRewardCredits,
    totalRewardDays: stats.totalRewardDays,
    firstPaymentRewardDays: stats.firstPaymentRewardDays,
    inviterSignupBonus: REFERRAL_INVITER_SIGNUP_BONUS,
    invitedSignupBonus: REFERRAL_INVITED_SIGNUP_BONUS,
    inviterFirstUseBonus: REFERRAL_INVITER_FIRST_USE_BONUS,
    invitedFirstUseBonus: REFERRAL_INVITED_FIRST_USE_BONUS,
    inviterFirstPaymentBonus: REFERRAL_INVITER_FIRST_PAYMENT_BONUS,
    invitedFirstPaymentBonus: REFERRAL_INVITED_FIRST_PAYMENT_BONUS,
    basicMonthlyRewardDays: getBasicMembershipRewardDays("monthly"),
    basicYearlyRewardDays: getBasicMembershipRewardDays("yearly"),
  };
}

export async function getUserInviteCenterData(input: {
  userId: string;
  origin?: string | null;
  region?: MarketRegion;
}): Promise<UserInviteCenterData> {
  const userId = normalizeUserId(input.userId);
  if (!userId) {
    throw new Error("userId is required");
  }

  const region = normalizeRegion(input.region || null, "ALL");
  if (region !== "ALL") {
    return getInviteSummaryByRegion({
      userId,
      origin: input.origin,
      region: region as MembershipRegion,
    });
  }

  const detected = await detectUserRegion(userId, "ALL");
  if (!detected) {
    throw new Error("User not found in CN/INTL");
  }

  return getInviteSummaryByRegion({
    userId,
    origin: input.origin,
    region: detected,
  });
}

async function getUsersWithReferralCodeCount(region: MembershipRegion) {
  if (region === "INTL") {
    const { count, error } = await supabaseAdmin
      .from("user_wallets")
      .select("user_id", { count: "exact", head: true })
      .not("referral_code", "is", null);
    if (error) throw new Error(error.message);
    return safeNumber(count);
  }

  const db = getDatabase();
  await ensureCloudbaseCollections(db, [CN_USERS_COLLECTION]);
  const result = await db.collection(CN_USERS_COLLECTION).get();
  return (Array.isArray(result?.data) ? result.data : []).filter((row: any) =>
    normalizeShareCode(row?.referral_code)
  ).length;
}

async function getOverviewByRegion(region: MembershipRegion): Promise<MarketOverviewData> {
  if (region === "INTL") {
    const [
      relationCountResult,
      clickCountResult,
      activatedCountResult,
      usersWithCode,
      rewards,
    ] = await Promise.all([
      supabaseAdmin
        .from("referral_relations")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("referral_clicks")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("referral_relations")
        .select("id", { count: "exact", head: true })
        .not("activated_at", "is", null),
      getUsersWithReferralCodeCount("INTL"),
      supabaseAdmin
        .from("referral_rewards")
        .select("reward_type,amount")
        .eq("status", "granted"),
    ]);

    if (relationCountResult.error) throw new Error(relationCountResult.error.message);
    if (clickCountResult.error) throw new Error(clickCountResult.error.message);
    if (activatedCountResult.error) throw new Error(activatedCountResult.error.message);
    if (rewards.error) throw new Error(rewards.error.message);

    const totalInvites = safeNumber(relationCountResult.count);
    const totalClicks = safeNumber(clickCountResult.count);
    const totalActivated = safeNumber(activatedCountResult.count);

    let totalRewardDays = 0;
    let firstUseRewardDays = 0;
    let firstPaymentRewardDays = 0;

    for (const row of rewards.data || []) {
      const amount = safeNumber((row as any)?.amount);
      const type = String((row as any)?.reward_type || "");
      totalRewardDays += amount;
      if (type.startsWith("first_use_")) firstUseRewardDays += amount;
      if (type.startsWith("first_payment_")) firstPaymentRewardDays += amount;
    }

    return {
      totalClicks,
      totalInvites,
      totalActivated,
      totalRewardCredits: totalRewardDays,
      totalRewardDays,
      signupRewardCredits: 0,
      firstUseRewardCredits: firstUseRewardDays,
      firstPaymentRewardDays,
      conversionRate:
        totalClicks > 0
          ? Number(((totalInvites / totalClicks) * 100).toFixed(2))
          : 0,
      activationRate:
        totalInvites > 0
          ? Number(((totalActivated / totalInvites) * 100).toFixed(2))
          : 0,
      usersWithReferralCode: usersWithCode,
    };
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const [relationsResult, clicksResult, rewardsResult, usersWithCode] = await Promise.all([
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
    db
      .collection(REFERRAL_REWARDS_COLLECTION)
      .where({ status: "granted" })
      .get(),
    getUsersWithReferralCodeCount("CN"),
  ]);

  const relations = Array.isArray(relationsResult?.data) ? relationsResult.data : [];
  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : [];
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : [];

  let totalRewardDays = 0;
  let firstUseRewardDays = 0;
  let firstPaymentRewardDays = 0;

  for (const row of rewards) {
    const amount = safeNumber((row as any)?.amount);
    const type = String((row as any)?.reward_type || "");
    totalRewardDays += amount;
    if (type.startsWith("first_use_")) firstUseRewardDays += amount;
    if (type.startsWith("first_payment_")) firstPaymentRewardDays += amount;
  }

  const totalInvites = relations.length;
  const totalClicks = clicks.length;
  const totalActivated = relations.filter((row: any) => Boolean(row?.activated_at)).length;

  return {
    totalClicks,
    totalInvites,
    totalActivated,
    totalRewardCredits: totalRewardDays,
    totalRewardDays,
    signupRewardCredits: 0,
    firstUseRewardCredits: firstUseRewardDays,
    firstPaymentRewardDays,
    conversionRate:
      totalClicks > 0
        ? Number(((totalInvites / totalClicks) * 100).toFixed(2))
        : 0,
    activationRate:
      totalInvites > 0
        ? Number(((totalActivated / totalInvites) * 100).toFixed(2))
        : 0,
    usersWithReferralCode: usersWithCode,
  };
}

function combineOverviews(items: MarketOverviewData[]): MarketOverviewData {
  const totalClicks = items.reduce((sum, item) => sum + item.totalClicks, 0);
  const totalInvites = items.reduce((sum, item) => sum + item.totalInvites, 0);
  const totalActivated = items.reduce((sum, item) => sum + item.totalActivated, 0);
  const totalRewardDays = items.reduce((sum, item) => sum + item.totalRewardDays, 0);
  const firstUseRewardDays = items.reduce((sum, item) => sum + item.firstUseRewardCredits, 0);
  const firstPaymentRewardDays = items.reduce((sum, item) => sum + item.firstPaymentRewardDays, 0);

  return {
    totalClicks,
    totalInvites,
    totalActivated,
    totalRewardCredits: totalRewardDays,
    totalRewardDays,
    signupRewardCredits: 0,
    firstUseRewardCredits: firstUseRewardDays,
    firstPaymentRewardDays,
    conversionRate:
      totalClicks > 0
        ? Number(((totalInvites / totalClicks) * 100).toFixed(2))
        : 0,
    activationRate:
      totalInvites > 0
        ? Number(((totalActivated / totalInvites) * 100).toFixed(2))
        : 0,
    usersWithReferralCode: items.reduce((sum, item) => sum + item.usersWithReferralCode, 0),
  };
}

export async function getAdminReferralOverview(
  region: MarketRegion = "ALL"
): Promise<AdminReferralOverview> {
  const overview = await getMarketAdminOverview(region);
  return {
    totalRelations: overview.totalInvites,
    totalClicks: overview.totalClicks,
    totalRewardCredits: overview.totalRewardCredits,
    totalRewardDays: overview.totalRewardDays,
    usersWithReferralCode: overview.usersWithReferralCode,
  };
}

export async function getMarketAdminOverview(
  region: MarketRegion = "ALL"
): Promise<MarketOverviewData> {
  const scope = normalizeRegion(region, "ALL");
  const targets = resolveReadRegions(scope);
  const overviews: MarketOverviewData[] = [];

  for (const target of targets) {
    try {
      overviews.push(await getOverviewByRegion(target));
    } catch {
      // noop
    }
  }

  if (overviews.length === 0) {
    return combineOverviews([]);
  }

  if (overviews.length === 1) {
    return overviews[0];
  }

  return combineOverviews(overviews);
}

async function fillTrendBucketsByRegion(
  region: MembershipRegion,
  map: Map<string, MarketTrendPoint>,
  startDateIso: string
) {
  if (region === "INTL") {
    const [clicks, relations, rewards] = await Promise.all([
      supabaseAdmin
        .from("referral_clicks")
        .select("created_at")
        .gte("created_at", startDateIso),
      supabaseAdmin
        .from("referral_relations")
        .select("created_at,activated_at")
        .gte("created_at", startDateIso),
      supabaseAdmin
        .from("referral_rewards")
        .select("created_at,amount,status")
        .eq("status", "granted")
        .gte("created_at", startDateIso),
    ]);

    if (clicks.error) throw new Error(clicks.error.message);
    if (relations.error) throw new Error(relations.error.message);
    if (rewards.error) throw new Error(rewards.error.message);

    for (const row of clicks.data || []) {
      const key = toIsoDateKey((row as any)?.created_at);
      if (!key) continue;
      const bucket = map.get(key);
      if (!bucket) continue;
      bucket.clicks += 1;
    }

    for (const row of relations.data || []) {
      const createdKey = toIsoDateKey((row as any)?.created_at);
      if (createdKey && map.get(createdKey)) {
        map.get(createdKey)!.invites += 1;
      }

      const activatedKey = toIsoDateKey((row as any)?.activated_at);
      if (activatedKey && map.get(activatedKey)) {
        map.get(activatedKey)!.activated += 1;
      }
    }

    for (const row of rewards.data || []) {
      const key = toIsoDateKey((row as any)?.created_at);
      if (!key) continue;
      const bucket = map.get(key);
      if (!bucket) continue;
      const amount = safeNumber((row as any)?.amount);
      bucket.rewardCredits += amount;
      bucket.rewardDays += amount;
    }

    return;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const [clicksResult, relationsResult, rewardsResult] = await Promise.all([
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db
      .collection(REFERRAL_REWARDS_COLLECTION)
      .where({ status: "granted" })
      .get(),
  ]);

  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : [];
  const relations = Array.isArray(relationsResult?.data)
    ? relationsResult.data
    : [];
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : [];

  for (const row of clicks) {
    const key = toIsoDateKey((row as any)?.created_at);
    if (!key) continue;
    const bucket = map.get(key);
    if (!bucket) continue;
    bucket.clicks += 1;
  }

  for (const row of relations) {
    const createdKey = toIsoDateKey((row as any)?.created_at);
    if (createdKey && map.get(createdKey)) {
      map.get(createdKey)!.invites += 1;
    }

    const activatedKey = toIsoDateKey((row as any)?.activated_at);
    if (activatedKey && map.get(activatedKey)) {
      map.get(activatedKey)!.activated += 1;
    }
  }

  for (const row of rewards) {
    const key = toIsoDateKey((row as any)?.created_at);
    if (!key) continue;
    const bucket = map.get(key);
    if (!bucket) continue;
    const amount = safeNumber((row as any)?.amount);
    bucket.rewardCredits += amount;
    bucket.rewardDays += amount;
  }
}

export async function getMarketAdminTrends(input?: {
  days?: number | string;
  region?: MarketRegion;
}): Promise<MarketTrendPoint[]> {
  const days = parseLimit(input?.days, 14, 90);
  const { buckets, map } = createDateBuckets(days);
  const startDateIso = buckets[0]?.date
    ? `${buckets[0].date}T00:00:00.000Z`
    : nowIso();

  const regions = resolveReadRegions(normalizeRegion(input?.region || null, "ALL"));
  for (const region of regions) {
    await fillTrendBucketsByRegion(region, map, startDateIso).catch(() => null);
  }

  return buckets;
}

async function loadChannelsByRegion(region: MembershipRegion) {
  const bySource = new Map<string, { clicks: number; invites: number }>();

  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_clicks")
      .select("source,registered_user_id");
    if (error) throw new Error(error.message);

    for (const row of data || []) {
      const source = normalizeSource((row as any)?.source) || "unknown";
      const current = bySource.get(source) || { clicks: 0, invites: 0 };
      current.clicks += 1;
      if ((row as any)?.registered_user_id) {
        current.invites += 1;
      }
      bySource.set(source, current);
    }

    return bySource;
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db.collection(REFERRAL_CLICKS_COLLECTION).get();
  const rows = Array.isArray(result?.data) ? result.data : [];

  for (const row of rows) {
    const source = normalizeSource((row as any)?.source) || "unknown";
    const current = bySource.get(source) || { clicks: 0, invites: 0 };
    current.clicks += 1;
    if ((row as any)?.registered_user_id) {
      current.invites += 1;
    }
    bySource.set(source, current);
  }

  return bySource;
}

export async function getMarketAdminChannels(input?: {
  limit?: number | string;
  region?: MarketRegion;
}): Promise<MarketChannelPoint[]> {
  const limit = parseLimit(input?.limit, 12, 50);
  const regions = resolveReadRegions(normalizeRegion(input?.region || null, "ALL"));
  const bySource = new Map<string, { clicks: number; invites: number }>();

  for (const region of regions) {
    const chunk = await loadChannelsByRegion(region).catch(() => new Map());
    for (const [source, metrics] of chunk.entries()) {
      const current = bySource.get(source) || { clicks: 0, invites: 0 };
      current.clicks += metrics.clicks;
      current.invites += metrics.invites;
      bySource.set(source, current);
    }
  }

  return Array.from(bySource.entries())
    .map(([source, metrics]) => ({
      source,
      clicks: metrics.clicks,
      invites: metrics.invites,
      conversionRate:
        metrics.clicks > 0
          ? Number(((metrics.invites / metrics.clicks) * 100).toFixed(2))
          : 0,
    }))
    .sort((a, b) => (b.clicks === a.clicks ? b.invites - a.invites : b.clicks - a.clicks))
    .slice(0, limit);
}

async function loadTopInvitersByRegion(
  region: MembershipRegion
): Promise<MarketTopInviterPoint[]> {
  if (region === "INTL") {
    const { data: relationRows, error: relationError } = await supabaseAdmin
      .from("referral_relations")
      .select("inviter_user_id,activated_at");
    if (relationError) throw new Error(relationError.message);

    const metricsByInviter = new Map<
      string,
      { invitedCount: number; activatedCount: number; rewardDays: number; clickCount: number }
    >();

    for (const row of relationRows || []) {
      const inviterUserId = normalizeUserId((row as any)?.inviter_user_id);
      if (!inviterUserId) continue;
      const current = metricsByInviter.get(inviterUserId) || {
        invitedCount: 0,
        activatedCount: 0,
        rewardDays: 0,
        clickCount: 0,
      };
      current.invitedCount += 1;
      if ((row as any)?.activated_at) {
        current.activatedCount += 1;
      }
      metricsByInviter.set(inviterUserId, current);
    }

    const inviterIds = Array.from(metricsByInviter.keys());
    const usersMap = await loadIntlUsersByIds(inviterIds);

    const referralCodes = Array.from(
      new Set(
        inviterIds
          .map((id) => normalizeShareCode(usersMap.get(id)?.referralCode))
          .filter(Boolean)
      )
    );

    if (referralCodes.length > 0) {
      const { data: clickRows, error: clickError } = await supabaseAdmin
        .from("referral_clicks")
        .select("share_code")
        .in("share_code", referralCodes as string[]);
      if (clickError) throw new Error(clickError.message);

      const clickByCode = new Map<string, number>();
      for (const click of clickRows || []) {
        const code = normalizeShareCode((click as any)?.share_code);
        if (!code) continue;
        clickByCode.set(code, safeNumber(clickByCode.get(code)) + 1);
      }

      for (const inviterId of inviterIds) {
        const code = normalizeShareCode(usersMap.get(inviterId)?.referralCode);
        if (!code) continue;
        const metric = metricsByInviter.get(inviterId);
        if (!metric) continue;
        metric.clickCount = safeNumber(clickByCode.get(code));
      }
    }

    const { data: rewards, error: rewardError } = await supabaseAdmin
      .from("referral_rewards")
      .select("user_id,amount,status")
      .in("user_id", inviterIds)
      .eq("status", "granted");
    if (rewardError) throw new Error(rewardError.message);

    for (const reward of rewards || []) {
      const userId = normalizeUserId((reward as any)?.user_id);
      if (!userId) continue;
      const metric = metricsByInviter.get(userId);
      if (!metric) continue;
      metric.rewardDays += safeNumber((reward as any)?.amount);
    }

    return inviterIds.map((inviterUserId) => {
      const user = usersMap.get(inviterUserId);
      const metric = metricsByInviter.get(inviterUserId) || {
        invitedCount: 0,
        activatedCount: 0,
        rewardDays: 0,
        clickCount: 0,
      };
      return {
        inviterUserId,
        inviterEmail: user?.email || null,
        referralCode: user?.referralCode || null,
        clickCount: metric.clickCount,
        invitedCount: metric.invitedCount,
        activatedCount: metric.activatedCount,
        rewardCredits: metric.rewardDays,
        rewardDays: metric.rewardDays,
        region: "INTL",
      };
    });
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);

  const [relationsResult, rewardsResult, clicksResult] = await Promise.all([
    db.collection(REFERRAL_RELATIONS_COLLECTION).get(),
    db
      .collection(REFERRAL_REWARDS_COLLECTION)
      .where({ status: "granted" })
      .get(),
    db.collection(REFERRAL_CLICKS_COLLECTION).get(),
  ]);

  const relations = Array.isArray(relationsResult?.data) ? relationsResult.data : [];
  const rewards = Array.isArray(rewardsResult?.data) ? rewardsResult.data : [];
  const clicks = Array.isArray(clicksResult?.data) ? clicksResult.data : [];

  const metricsByInviter = new Map<
    string,
    { invitedCount: number; activatedCount: number; rewardDays: number; clickCount: number }
  >();

  for (const row of relations) {
    const inviterUserId = normalizeUserId((row as any)?.inviter_user_id);
    if (!inviterUserId) continue;
    const current = metricsByInviter.get(inviterUserId) || {
      invitedCount: 0,
      activatedCount: 0,
      rewardDays: 0,
      clickCount: 0,
    };
    current.invitedCount += 1;
    if ((row as any)?.activated_at) {
      current.activatedCount += 1;
    }
    metricsByInviter.set(inviterUserId, current);
  }

  for (const row of rewards) {
    const userId = normalizeUserId((row as any)?.user_id);
    if (!userId) continue;
    const metric = metricsByInviter.get(userId);
    if (!metric) continue;
    metric.rewardDays += safeNumber((row as any)?.amount);
  }

  const usersMap = await loadCnUsersByIds(Array.from(metricsByInviter.keys()));
  const clickByCode = new Map<string, number>();

  for (const row of clicks) {
    const code = normalizeShareCode((row as any)?.share_code);
    if (!code) continue;
    clickByCode.set(code, safeNumber(clickByCode.get(code)) + 1);
  }

  for (const [inviterId, metric] of metricsByInviter.entries()) {
    const code = normalizeShareCode(usersMap.get(inviterId)?.referralCode);
    if (!code) continue;
    metric.clickCount = safeNumber(clickByCode.get(code));
  }

  return Array.from(metricsByInviter.entries()).map(([inviterUserId, metric]) => {
    const user = usersMap.get(inviterUserId);
    return {
      inviterUserId,
      inviterEmail: user?.email || null,
      referralCode: user?.referralCode || null,
      clickCount: metric.clickCount,
      invitedCount: metric.invitedCount,
      activatedCount: metric.activatedCount,
      rewardCredits: metric.rewardDays,
      rewardDays: metric.rewardDays,
      region: "CN",
    };
  });
}

export async function getMarketAdminTopInviters(input?: {
  limit?: number | string;
  region?: MarketRegion;
}): Promise<MarketTopInviterPoint[]> {
  const limit = parseLimit(input?.limit, 20, 100);
  const regions = resolveReadRegions(normalizeRegion(input?.region || null, "ALL"));

  const rows: MarketTopInviterPoint[] = [];
  for (const region of regions) {
    rows.push(...(await loadTopInvitersByRegion(region).catch(() => [])));
  }

  return rows
    .sort((a, b) =>
      b.invitedCount === a.invitedCount
        ? b.activatedCount - a.activatedCount
        : b.invitedCount - a.invitedCount
    )
    .slice(0, limit);
}

async function listRelationsByRegion(region: MembershipRegion): Promise<RelationInternal[]> {
  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_relations")
      .select(
        "id,inviter_user_id,invited_user_id,share_code,tool_slug,first_tool_id,status,created_at,activated_at,first_paid_at,first_paid_transaction_id"
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map(mapIntlRelation);
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db.collection(REFERRAL_RELATIONS_COLLECTION).get();
  const rows = Array.isArray(result?.data) ? result.data : [];
  return rows.map(mapCnRelation);
}

export async function getMarketAdminRelations(input?: {
  page?: number | string;
  limit?: number | string;
  region?: MarketRegion;
}): Promise<MarketListResult<MarketRelationRow>> {
  const page = parsePage(input?.page, 1);
  const limit = parseLimit(input?.limit, 50, 200);
  const offset = (page - 1) * limit;
  const regions = resolveReadRegions(normalizeRegion(input?.region || null, "ALL"));

  const rows: RelationInternal[] = [];
  for (const region of regions) {
    rows.push(...(await listRelationsByRegion(region).catch(() => [])));
  }

  const sorted = rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const paged = sorted.slice(offset, offset + limit);

  const intlIds = new Set<string>();
  const cnIds = new Set<string>();
  for (const row of paged) {
    if (row.region === "INTL") {
      intlIds.add(row.inviterUserId);
      intlIds.add(row.invitedUserId);
    } else {
      cnIds.add(row.inviterUserId);
      cnIds.add(row.invitedUserId);
    }
  }

  const [intlUsers, cnUsers] = await Promise.all([
    loadIntlUsersByIds(Array.from(intlIds)),
    loadCnUsersByIds(Array.from(cnIds)),
  ]);

  const mapped: MarketRelationRow[] = paged.map((row) => {
    const userMap = row.region === "INTL" ? intlUsers : cnUsers;
    return {
      relationId: row.id,
      inviterUserId: row.inviterUserId,
      inviterEmail: userMap.get(row.inviterUserId)?.email || null,
      invitedUserId: row.invitedUserId,
      invitedEmail: userMap.get(row.invitedUserId)?.email || null,
      shareCode: row.shareCode,
      toolSlug: row.toolSlug,
      firstToolId: row.firstToolId,
      status: row.status,
      createdAt: row.createdAt,
      activatedAt: row.activatedAt,
      firstPaidAt: row.firstPaidAt,
      firstPaidTransactionId: row.firstPaidTransactionId,
      region: row.region,
    };
  });

  return {
    page,
    limit,
    total: sorted.length,
    rows: mapped,
  };
}

async function listRewardsByRegion(region: MembershipRegion): Promise<RewardInternal[]> {
  if (region === "INTL") {
    const { data, error } = await supabaseAdmin
      .from("referral_rewards")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map(mapIntlReward);
  }

  const db = getDatabase();
  await ensureCloudbaseReferralCollections(db);
  const result = await db.collection(REFERRAL_REWARDS_COLLECTION).get();
  const rows = Array.isArray(result?.data) ? result.data : [];
  return rows.map(mapCnReward);
}

export async function getMarketAdminRewards(input?: {
  page?: number | string;
  limit?: number | string;
  region?: MarketRegion;
}): Promise<MarketListResult<MarketRewardRow>> {
  const page = parsePage(input?.page, 1);
  const limit = parseLimit(input?.limit, 50, 200);
  const offset = (page - 1) * limit;
  const regions = resolveReadRegions(normalizeRegion(input?.region || null, "ALL"));

  const allRows: RewardInternal[] = [];
  for (const region of regions) {
    allRows.push(...(await listRewardsByRegion(region).catch(() => [])));
  }

  const sorted = allRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const paged = sorted.slice(offset, offset + limit);

  const intlIds = new Set<string>();
  const cnIds = new Set<string>();
  for (const row of paged) {
    if (row.region === "INTL") {
      intlIds.add(row.userId);
    } else {
      cnIds.add(row.userId);
    }
  }

  const [intlUsers, cnUsers] = await Promise.all([
    loadIntlUsersByIds(Array.from(intlIds)),
    loadCnUsersByIds(Array.from(cnIds)),
  ]);

  const rows: MarketRewardRow[] = paged.map((row) => {
    const userMap = row.region === "INTL" ? intlUsers : cnUsers;
    return {
      rewardId: row.id,
      relationId: row.relationId,
      userId: row.userId,
      userEmail: userMap.get(row.userId)?.email || null,
      rewardType: row.rewardType,
      amount: row.amount,
      unit: row.unit,
      status: row.status,
      referenceId: row.referenceId,
      relatedTransactionId: row.relatedTransactionId,
      createdAt: row.createdAt,
      grantedAt: row.grantedAt,
      revokedAt: row.revokedAt,
      region: row.region,
    };
  });

  return {
    page,
    limit,
    total: sorted.length,
    rows,
  };
}
