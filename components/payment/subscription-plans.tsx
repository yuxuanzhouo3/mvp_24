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
import { Check, Crown, Zap, Building2 } from "lucide-react";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { pricingPlans, getPlanPrice, type PricingPlan } from "@/constants/pricing";

interface SubscriptionPlansProps {
  onSelectPlan: (planId: string, billingCycle: "monthly" | "yearly") => void;
  currentPlan?: string;
  currency?: string;
  onSwitchToPayment?: () => void;
}

// 订阅计划层级定义（从低到高）
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
}: SubscriptionPlansProps) {
  const { user } = useUser();
  const { language } = useLanguage();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const isZh = language === "zh";

  // 获取用户当前订阅计划
  const userCurrentPlan = (user?.subscription_plan || "free").toLowerCase();
  const userCurrentLevel = PLAN_HIERARCHY[userCurrentPlan] ?? 0;

  // 检查计划是否可以选择
  const canSelectPlan = (planId: string): boolean => {
    if (planId === "free") return true;
    const planLevel = PLAN_HIERARCHY[planId.toLowerCase()] ?? 0;
    if (user?.subscription_status === "active" && userCurrentPlan !== "free") {
      return planLevel >= userCurrentLevel;
    }
    return true;
  };

  // 获取计划图标
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

  // 获取计划特性列表（解析双语格式）
  const getPlanFeatures = (plan: PricingPlan): string[] => {
    return plan.features.map(feature => {
      // 格式: "English text|中文文本"
      const parts = feature.split("|");
      return isZh && parts.length > 1 ? parts[1] : parts[0];
    });
  };

  // 获取计划名称
  const getPlanName = (plan: PricingPlan) => {
    return isZh && plan.nameZh ? plan.nameZh : plan.name;
  };

  // 获取计划描述
  const getPlanDescription = (planId: string) => {
    const descriptions: Record<string, { zh: string; en: string }> = {
      basic: {
        zh: "适合个人用户日常使用",
        en: "Perfect for personal daily use"
      },
      pro: {
        zh: "适合专业用户和创作者",
        en: "Ideal for professionals and creators"
      },
      enterprise: {
        zh: "适合团队和企业级需求",
        en: "For teams and enterprise needs"
      },
    };
    return descriptions[planId.toLowerCase()]?.[language] || "";
  };

  const formatPrice = (price: number, curr: string) => {
    if (price === 0) return isZh ? "免费" : "Free";
    return new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", {
      style: "currency",
      currency: curr,
    }).format(price);
  };

  return (
    <div className="space-y-6">
      {/* 当前会员到期时间显示 */}
      {user && user.membership_expires_at && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-800">
                  {isZh ? "会员到期时间" : "Membership expires"}:{" "}
                  {new Date(user.membership_expires_at).toLocaleDateString(
                    isZh ? "zh-CN" : "en-US",
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </p>
                <p className="text-sm text-blue-600">
                  {isZh ? "续费可延长会员时间" : "Renew to extend membership"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 计费周期切换 */}
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

      {/* 订阅计划卡片 */}
      <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
        {pricingPlans.map((plan) => {
          const isCurrentPlan =
            userCurrentPlan === plan.id.toLowerCase() &&
            user?.subscription_status === "active";
          const price = getPlanPrice(plan.id, billingCycle, isZh);
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
                    {formatPrice(price, isZh ? "CNY" : "USD")}
                  </span>
                  <span className="text-muted-foreground">
                    /{isZh
                      ? (billingCycle === "monthly" ? "月" : "年")
                      : (billingCycle === "monthly" ? "mo" : "yr")
                    }
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
                    onSelectPlan(plan.id, billingCycle === "annual" ? "yearly" : "monthly");
                    if (onSwitchToPayment && price > 0) {
                      setTimeout(() => onSwitchToPayment(), 100);
                    }
                  }}
                  disabled={!canSelectPlan(plan.id)}
                >
                  {!canSelectPlan(plan.id)
                    ? (isZh ? "请先取消当前计划" : "Cancel current first")
                    : isCurrentPlan
                    ? (isZh ? "续费" : "Renew")
                    : (isZh ? "选择此计划" : "Choose Plan")}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
