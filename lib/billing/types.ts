import type { PlanId } from "@/lib/plan-quota-settings";

export type BillingRegion = "CN" | "INTL";

export type BillingMetricKey =
  | "input_tokens"
  | "output_tokens"
  | "image_count"
  | "audio_input_seconds"
  | "audio_output_seconds"
  | "video_input_seconds"
  | "video_output_seconds"
  | "request_count";

export type BillingRounding = "ceil" | "none";

export interface BillingRule {
  metricKey: BillingMetricKey | string;
  unitSize: number;
  price: number;
  rounding?: BillingRounding;
  label?: string;
}

export interface BillingSettings {
  region: BillingRegion;
  profitMultiplier: number;
  creditExchangeRate: number;
  rechargeCreditRate: number;
  minimumChargeCredits: number;
  defaultCurrency: string;
  metadata?: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface ModelCatalogEntry {
  modelKey: string;
  provider: string;
  providerModel: string;
  displayName: string;
  region: BillingRegion;
  modality: string;
  billingMode: string;
  currency: string;
  inputPrice: number;
  outputPrice: number;
  pricingUnit: string;
  pricingRules: BillingRule[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface CreditWalletSnapshot {
  userId: string;
  planId: PlanId;
  monthKey: string;
  monthlyGrantTotal: number;
  monthlyGrantBalance: number;
  rechargeBalance: number;
  bonusBalance: number;
  frozenCredits: number;
  lifetimeCredited: number;
  lifetimeDebited: number;
  updatedAt?: string | null;
}

export interface CreditBucketBreakdown {
  monthlyGrant: number;
  bonus: number;
  recharge: number;
}

export interface BillingComponentCharge {
  metricKey: string;
  quantity: number;
  unitSize: number;
  units: number;
  price: number;
  cost: number;
}

export interface BillingComputation {
  model: ModelCatalogEntry;
  settings: BillingSettings;
  metrics: Record<string, number>;
  components: BillingComponentCharge[];
  costAmount: number;
  credits: number;
}

export type CreditReservationFailureCode =
  | "daily_credit_cap_exceeded"
  | "insufficient_credits"
  | "reservation_failed";

export interface CreditQuotaSnapshot {
  monthlyGrant: number;
  dailyCreditCap: number;
  spentThisMonth: number;
  spentToday: number;
  remainingThisMonth: number;
  remainingToday: number;
}

export interface CreditReservationResult {
  success: boolean;
  error?: string;
  requestId: string;
  reservedCredits: number;
  computation?: BillingComputation;
  wallet?: CreditWalletSnapshot;
  failureCode?: CreditReservationFailureCode;
  quotaSnapshot?: CreditQuotaSnapshot;
}

export interface CreditSettlementResult {
  success: boolean;
  error?: string;
  requestId: string;
  chargedCredits: number;
  releasedCredits: number;
  computation?: BillingComputation;
  wallet?: CreditWalletSnapshot;
}

export interface CreditChargeContext {
  userId: string;
  sessionId?: string | null;
  requestId: string;
  planId: PlanId;
  modelKey: string;
  provider?: string | null;
  metrics: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface CreditUsageStats {
  spentThisMonth: number;
  spentToday: number;
  chargedRequestsThisMonth: number;
}
