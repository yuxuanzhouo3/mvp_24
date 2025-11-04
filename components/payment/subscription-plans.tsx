"use client";

import { useState, useEffect } from "react";
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
import { Check, Crown, Users, Zap, AlertCircle } from "lucide-react";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    yearly: number;
  };
  currency: string;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
}

interface SubscriptionPlansProps {
  onSelectPlan: (planId: string, billingCycle: "monthly" | "yearly") => void;
  currentPlan?: string;
  currency?: string;
  convertPrice?: (usdPrice: number, targetCurrency: string) => number;
}

// 订阅计划层级定义（从低到高）
const PLAN_HIERARCHY = {
  free: 0,
  pro: 1,
};

export function SubscriptionPlans({
  onSelectPlan,
  currentPlan,
  currency = "USD",
  convertPrice = (price: number) => price,
}: SubscriptionPlansProps) {
  const { user } = useUser();
  const { language } = useLanguage();
  const t = useTranslations(language);

  // 获取用户当前订阅计划
  const userCurrentPlan = user?.subscription_plan || "free";
  const userCurrentLevel =
    PLAN_HIERARCHY[userCurrentPlan as keyof typeof PLAN_HIERARCHY] ?? 0;

  // 检查计划是否可以选择
  const canSelectPlan = (planId: string): boolean => {
    if (planId === "free") return true; // 免费计划总是可以选择

    const planLevel =
      PLAN_HIERARCHY[planId as keyof typeof PLAN_HIERARCHY] ?? 0;

    // 如果用户已有活跃订阅，只能选择相同或更高等级的计划
    if (user?.subscription_status === "active" && userCurrentPlan !== "free") {
      return planLevel >= userCurrentLevel;
    }

    return true;
  };

  // 获取计划状态文本
  const getPlanStatus = (planId: string) => {
    if (planId === userCurrentPlan && user?.subscription_status === "active") {
      return t.payment.currentPlan;
    }

    if (!canSelectPlan(planId)) {
      return t.payment.upgrade;
    }

    return null;
  };

  // 展开所有计划选项（免费、月付、年付）
  const allPlans = [
    {
      id: "free",
      name: t.payment.plans.free.name,
      description: t.payment.plans.free.description,
      price: 0,
      billingCycle: "monthly" as const,
      currency: currency,
      features: t.payment.plans.free.features as unknown as string[],
      icon: <Zap className="h-6 w-6" />,
    },
    {
      id: "pro-monthly",
      planId: "pro",
      name: t.payment.proMonthly,
      description: t.payment.monthlyDesc,
      price: convertPrice(9.99, currency),
      billingCycle: "monthly" as const,
      currency: currency,
      features: t.payment.plans.pro.features as unknown as string[],
      icon: <Crown className="h-6 w-6" />,
    },
    {
      id: "pro-yearly",
      planId: "pro",
      name: t.payment.proYearly,
      description: t.payment.yearlyDesc,
      price: convertPrice(99.99, currency),
      billingCycle: "yearly" as const,
      currency: currency,
      features: t.payment.plans.pro.features as unknown as string[],
      popular: true,
      savings: 20,
      icon: <Crown className="h-6 w-6 text-yellow-500" />,
    },
  ];

  const formatPrice = (price: number, currency: string) => {
    if (price === 0) return t.payment.plans.free.price || "Free";
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: currency,
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
                  {t.payment.membershipExpires}:{" "}
                  {new Date(user.membership_expires_at).toLocaleDateString(
                    language === "zh" ? "zh-CN" : "en-US",
                    { year: "numeric", month: "long", day: "numeric" }
                  )}
                </p>
                <p className="text-sm text-blue-600">
                  {t.payment.renewToExtend}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 订阅计划卡片 - 全部显示在一页 */}
      <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
        {allPlans.map((plan) => {
          const actualPlanId =
            ("planId" in plan ? plan.planId : plan.id) || "free";
          const isCurrentPlan =
            userCurrentPlan === actualPlanId &&
            user?.subscription_status === "active";

          return (
            <Card
              key={plan.id}
              className={`relative ${
                plan.popular ? "border-primary shadow-lg scale-105" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    {t.payment.mostPopular}
                  </Badge>
                </div>
              )}

              {isCurrentPlan && (
                <div className="absolute -top-3 right-4">
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    {t.payment.active}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">{plan.icon}</div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="text-center">
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    {formatPrice(plan.price, plan.currency)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground">
                      /
                      {language === "zh"
                        ? plan.billingCycle === "monthly"
                          ? t.payment.month
                          : t.payment.year
                        : plan.billingCycle === "monthly"
                        ? t.payment.mo
                        : t.payment.yr}
                    </span>
                  )}
                  {"savings" in plan && plan.savings && (
                    <div className="text-sm text-green-600 mt-1 font-semibold">
                      {t.payment.savePercent} {plan.savings}%
                    </div>
                  )}
                </div>

                <ul className="space-y-2 text-sm text-left">
                  {plan.features.map((feature: string, index: number) => (
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
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => onSelectPlan(actualPlanId, plan.billingCycle)}
                  disabled={!canSelectPlan(actualPlanId)}
                >
                  {!canSelectPlan(actualPlanId)
                    ? t.payment.cancelCurrentFirst
                    : plan.price === 0
                    ? t.payment.getStarted
                    : isCurrentPlan
                    ? t.payment.renew
                    : t.payment.choosePlan}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
