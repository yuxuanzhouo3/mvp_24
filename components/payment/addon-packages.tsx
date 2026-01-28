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
import { Check, Package, Sparkles, Gem } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { ADDON_PACKAGES, getAddonPackageById, type AddonPackage } from "@/constants/addon-packages";

interface AddonPackagesProps {
  onSelectPackage: (packageId: string) => void;
  currency?: string;
}

export function AddonPackages({
  onSelectPackage,
  currency = "USD",
}: AddonPackagesProps) {
  const { language } = useLanguage();

  // 获取包图标
  const getPackageIcon = (packageId: string) => {
    switch (packageId) {
      case "starter":
        return <Package className="h-6 w-6 text-blue-500" />;
      case "standard":
        return <Sparkles className="h-6 w-6 text-purple-500" />;
      case "premium":
        return <Gem className="h-6 w-6 text-yellow-500" />;
      default:
        return <Package className="h-6 w-6" />;
    }
  };

  // 获取包名称翻译
  const getPackageName = (packageId: string) => {
    const names: Record<string, { zh: string; en: string }> = {
      starter: { zh: "入门包", en: "Starter Pack" },
      standard: { zh: "标准包", en: "Standard Pack" },
      premium: { zh: "豪华包", en: "Premium Pack" },
    };
    return names[packageId]?.[language] || packageId;
  };

  // 获取包描述
  const getPackageDescription = (packageId: string) => {
    const descriptions: Record<string, { zh: string; en: string }> = {
      starter: {
        zh: "适合尝鲜用户",
        en: "Perfect for trying out"
      },
      standard: {
        zh: "最佳性价比",
        en: "Best value"
      },
      premium: {
        zh: "专业创作者首选",
        en: "For power users"
      },
    };
    return descriptions[packageId]?.[language] || "";
  };

  const formatPrice = (price: number, curr: string) => {
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: curr,
    }).format(price);
  };

  const getPrice = (pkg: AddonPackage) => {
    return currency === "CNY" ? pkg.priceCNY : pkg.priceUSD;
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">
          {language === "zh" ? "加油包" : "Credit Packs"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {language === "zh"
            ? "一次购买，永久使用。额度不会过期。"
            : "Buy once, use forever. Credits never expire."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
        {ADDON_PACKAGES.map((pkg) => {
          const isPopular = pkg.id === "standard";

          return (
            <Card
              key={pkg.id}
              className={`relative ${
                isPopular ? "border-primary shadow-lg scale-105" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    {language === "zh" ? "最划算" : "Best Value"}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">{getPackageIcon(pkg.id)}</div>
                <CardTitle className="text-xl">{getPackageName(pkg.id)}</CardTitle>
                <CardDescription>{getPackageDescription(pkg.id)}</CardDescription>
              </CardHeader>

              <CardContent className="text-center">
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    {formatPrice(getPrice(pkg), currency)}
                  </span>
                </div>

                <ul className="space-y-2 text-sm text-left">
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                    {language === "zh"
                      ? `${pkg.imageCredits} 张图片额度`
                      : `${pkg.imageCredits} image credits`}
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                    {language === "zh"
                      ? `${pkg.videoAudioCredits} 个视频/音频额度`
                      : `${pkg.videoAudioCredits} video/audio credits`}
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                    {language === "zh" ? "永久有效" : "Never expires"}
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                    {language === "zh" ? "与订阅额度叠加" : "Stacks with subscription"}
                  </li>
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isPopular ? "default" : "outline"}
                  onClick={() => onSelectPackage(pkg.id)}
                >
                  {language === "zh" ? "立即购买" : "Buy Now"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        {language === "zh"
          ? "加油包额度在订阅月度额度用完后自动使用"
          : "Addon credits are used after monthly subscription credits are depleted"}
      </div>
    </div>
  );
}
