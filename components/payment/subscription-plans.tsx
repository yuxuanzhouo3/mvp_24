"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap, Building2, AlertCircle } from "lucide-react";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { pricingPlans, getPlanPrice, type PricingPlan } from "@/constants/pricing";

interface SubscriptionPlansProps {
  onSelectPlan: (planId: string, billingCycle: "monthly" | "yearly") => void;
  currentPlan?: string;
  currency?: string;
  onSwitchToPayment?: () => void;
  membershipExpiresAt?: string | null;
  priceOverrides?: Record<string, { monthly: number; yearly: number }>;
}

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  enterprise: 3,
};

export function SubscriptionPlans({
  onSelectPlan,
  currentPlan,
  currency = "USD",
  onSwitchToPayment,
  membershipExpiresAt,
  priceOverrides,
}: SubscriptionPlansProps) {
  const { user } = useUser();
  const { language } = useLanguage();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const isZh = language === "zh";

  const userCurrentPlan = String(currentPlan || user?.subscription_plan || "free").toLowerCase();
  const userCurrentLevel = PLAN_HIERARCHY[userCurrentPlan] ?? 0;
  const displayMembershipExpiresAt = membershipExpiresAt || user?.membership_expires_at;
  const membershipExpiryDate = displayMembershipExpiresAt
    ? new Date(displayMembershipExpiresAt)
    : null;
  const hasValidExpiryDate =
    !!membershipExpiryDate &&
    Number.isFinite(membershipExpiryDate.getTime());
  const isMembershipExpired =
    hasValidExpiryDate && membershipExpiryDate <= new Date();
  const hasStatusActive =
    user?.hasActiveSubscription ?? user?.subscription_status === "active";
  const hasActiveSubscription = Boolean(
    hasStatusActive && (!hasValidExpiryDate || !isMembershipExpired)
  );

  const canSelectPlan = (planId: string): boolean => {
    if (planId === "free") return true;
    if (hasActiveSubscription && userCurrentPlan === "pro") {
      return planId.toLowerCase() === "pro";
    }
    const planLevel = PLAN_HIERARCHY[planId.toLowerCase()] ?? 0;
    if (hasActiveSubscription && userCurrentPlan !== "free") {
      return planLevel >= userCurrentLevel;
    }
    return true;
  };

  const getDisabledPlanReason = (planId: string) => {
    if (hasActiveSubscription && userCurrentPlan === "pro" && planId.toLowerCase() !== "pro") {
      return isZh ? "专业版仅支持续费专业版" : "Pro can only renew Pro";
    }
    return isZh ? "请先取消当前计划" : "Cancel current first";
  };

  const getPlanIcon = (planId: string) => {
    switch (planId.toLowerCase()) {
      case "basic":
        return <Zap className="h-6 w-6 text-blue-500" />;
      case "pro":
        return <Crown className="h-6 w-6 text-yellow-500" />;
      case "enterprise":
        return <Building2 className="h-6 w-6 text-purple-500" />;
      default:
        return <Zap className="h-6 w-6" />;
    }
  };

  const getPlanFeatures = (plan: PricingPlan): string[] => {
    return plan.features.map((feature) => {
      const parts = feature.split("|");
      return isZh && parts.length > 1 ? parts[1] : parts[0];
    });
  };

  const getPlanName = (plan: PricingPlan) => {
    return isZh && plan.nameZh ? plan.nameZh : plan.name;
  };

  const getPlanDescription = (planId: string) => {
    const descriptions: Record<string, { zh: string; en: string }> = {
      basic: {
        zh: "适合个人用户日常使用",
        en: "Perfect for personal daily use",
      },
      pro: {
        zh: "适合专业用户和创作者",
        en: "Ideal for professionals and creators",
      },
      enterprise: {
        zh: "适合团队和企业级需求",
        en: "For teams and enterprise needs",
      },
    };
    return isZh
      ? descriptions[planId.toLowerCase()]?.zh || ""
      : descriptions[planId.toLowerCase()]?.en || "";
  };

  const formatPrice = (price: number, curr: string) => {
    if (price === 0) return isZh ? "免费" : "Free";
    return new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", {
      style: "currency",
      currency: curr,
    }).format(price);
  };

  const getResolvedPlanPrice = (planId: string) => {
    const override = priceOverrides?.[planId.toLowerCase()];
    const overrideAmount =
      billingCycle === "monthly" ? override?.monthly : override?.yearly;

    if (typeof overrideAmount === "number" && Number.isFinite(overrideAmount)) {
      return overrideAmount;
    }

    return getPlanPrice(planId, billingCycle, currency === "CNY");
  };

  return (
    <div className="space-y-6">
      {user && displayMembershipExpiresAt && (
        <Card
          className={
            isMembershipExpired
              ? "border-orange-200 bg-orange-50"
              : "border-blue-200 bg-blue-50"
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              {isMembershipExpired ? (
                <AlertCircle className="h-5 w-5 text-orange-600" />
              ) : (
                <Check className="h-5 w-5 text-blue-600" />
              )}
              <div>
                <p
                  className={
                    isMembershipExpired
                      ? "font-medium text-orange-800"
                      : "font-medium text-blue-800"
                  }
                >
                  {isZh ? "会员到期时间" : "Membership expires"}: {" "}
                  {new Date(displayMembershipExpiresAt).toLocaleDateString(
                    isZh ? "zh-CN" : "en-US",
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </p>
                <p
                  className={
                    isMembershipExpired
                      ? "text-sm text-orange-700"
                      : "text-sm text-blue-600"
                  }
                >
                  {isMembershipExpired
                    ? isZh
                      ? "会员已过期，请续费恢复会员权益"
                      : "Membership expired, please renew to restore benefits"
                    : isZh
                      ? "续费可延长会员时间"
                      : "Renew to extend membership"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-4">
        <Button
          variant={billingCycle === "monthly" ? "default" : "outline"}
          onClick={() => setBillingCycle("monthly")}
        >
          {isZh ? "月付" : "Monthly"}
        </Button>
        <Button
          variant={billingCycle === "annual" ? "default" : "outline"}
          onClick={() => setBillingCycle("annual")}
          className="relative"
        >
          {isZh ? "年付" : "Annual"}
          <Badge className="absolute -top-2 -right-2 bg-green-500 text-xs">
            {isZh ? "省30%" : "Save 30%"}
          </Badge>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
        {pricingPlans.map((plan) => {
          const isCurrentPlan =
            userCurrentPlan === plan.id.toLowerCase() && hasActiveSubscription;
          const price = getResolvedPlanPrice(plan.id);
          const isPopular = plan.popular;

          return (
            <Card
              key={plan.id}
              className={`relative ${
                isPopular ? "border-primary shadow-lg scale-105" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    {isZh ? "最受欢迎" : "Most Popular"}
                  </Badge>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 right-4">
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    {isZh ? "当前计划" : "Current"}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">{getPlanIcon(plan.id)}</div>
                <CardTitle className="text-xl">{getPlanName(plan)}</CardTitle>
                <CardDescription>{getPlanDescription(plan.id)}</CardDescription>
              </CardHeader>

              <CardContent className="text-center">
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    {formatPrice(price, currency)}
                  </span>
                  <span className="text-muted-foreground">
                    /{isZh
                      ? billingCycle === "monthly"
                        ? "月"
                        : "年"
                      : billingCycle === "monthly"
                        ? "mo"
                        : "yr"}
                  </span>
                  {billingCycle === "annual" && (
                    <div className="text-sm text-green-600 mt-1 font-semibold">
                      {isZh ? "节省约 30%" : "Save ~30%"}
                    </div>
                  )}
                </div>

                <ul className="space-y-2 text-sm text-left">
                  {getPlanFeatures(plan).map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => {
                    onSelectPlan(
                      plan.id,
                      billingCycle === "annual" ? "yearly" : "monthly"
                    );
                    if (onSwitchToPayment && price > 0) {
                      setTimeout(() => onSwitchToPayment(), 100);
                    }
                  }}
                  disabled={!canSelectPlan(plan.id)}
                >
                  {!canSelectPlan(plan.id)
                    ? getDisabledPlanReason(plan.id)
                    : isCurrentPlan
                      ? isZh
                        ? "续费"
                        : "Renew"
                      : isZh
                        ? "选择此计划"
                        : "Choose Plan"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
