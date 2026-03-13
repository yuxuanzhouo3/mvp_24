"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Save, Upload, FileJson } from "lucide-react";
import { pricingPlans, getPlanPrice } from "@/constants/pricing";
import { ADDON_PACKAGES } from "@/constants/addon-packages";

type SettingsMode = "simple" | "advanced";

type BillingSettings = {
  region: "CN" | "INTL";
  profitMultiplier: number;
  creditExchangeRate: number;
  rechargeCreditRate: number;
  minimumChargeCredits: number;
  defaultCurrency: string;
};

type ModelRow = {
  modelKey: string;
  provider: string;
  providerModel: string;
  displayName: string;
  modality: string;
  currency: string;
  inputPrice: number;
  outputPrice: number;
  pricingRulesText: string;
  enabled: boolean;
};


type SubscriptionProductRow = {
  planId: string;
  monthly: number;
  yearly: number;
};

type AddonProductRow = {
  addonPackageId: string;
  amount: number;
  imageCredits: number;
  videoAudioCredits: number;
};

type MetricUnitHint = {
  metricKey: string;
  unit: string;
  note: string;
};

const METRIC_UNIT_HINTS: MetricUnitHint[] = [
  { metricKey: "input_tokens", unit: "每 1K 输入 Token", note: "文本输入成本；通常 unitSize = 1000。" },
  { metricKey: "output_tokens", unit: "每 1K 输出 Token", note: "文本输出成本；通常 unitSize = 1000。" },
  { metricKey: "image_count", unit: "每张图片", note: "图片生成或图片理解按张计费。" },
  { metricKey: "audio_input_seconds", unit: "每秒音频", note: "音频输入按秒计费；60 秒可写 unitSize = 60。" },
  { metricKey: "video_input_seconds", unit: "每秒视频", note: "视频输入按秒计费；60 秒可写 unitSize = 60。" },
  { metricKey: "request_count", unit: "每次请求", note: "适合固定调用费或保底费。" },
];

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCurrency(currency: string | undefined | null, fallback = "USD") {
  const value = String(currency || fallback || "USD").trim().toUpperCase();
  return value || "USD";
}

function safeParseRules(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildImportExample(currency: string) {
  return JSON.stringify(
    [
      {
        modelKey: "gpt-4.1-mini",
        provider: "openai",
        providerModel: "gpt-4.1-mini",
        displayName: "GPT-4.1 Mini",
        modality: "text",
        currency,
        inputPrice: 0.0008,
        outputPrice: 0.0032,
        enabled: true,
        pricingRules: [
          { metricKey: "input_tokens", unitSize: 1000, price: 0.0008, label: `${currency}/1K 输入Token` },
          { metricKey: "output_tokens", unitSize: 1000, price: 0.0032, label: `${currency}/1K 输出Token` },
        ],
      },
      {
        modelKey: "qwen-omni-demo",
        provider: "dashscope",
        providerModel: "qwen-omni-demo",
        displayName: "Qwen Omni Demo",
        modality: "multimodal",
        currency,
        inputPrice: 0,
        outputPrice: 0,
        enabled: true,
        pricingRules: [
          { metricKey: "image_count", unitSize: 1, price: 0.04, label: `${currency}/张` },
          { metricKey: "audio_input_seconds", unitSize: 1, price: 0.0003, label: `${currency}/秒音频` },
        ],
      },
    ],
    null,
    2
  );
}

function exportableModelRows(models: ModelRow[]) {
  return models.map((row) => ({
    modelKey: row.modelKey,
    provider: row.provider,
    providerModel: row.providerModel || row.modelKey,
    displayName: row.displayName || row.modelKey,
    modality: row.modality || "text",
    currency: normalizeCurrency(row.currency),
    inputPrice: row.inputPrice,
    outputPrice: row.outputPrice,
    enabled: row.enabled,
    pricingRules: safeParseRules(row.pricingRulesText),
  }));
}

function mapModelRows(rows: any): ModelRow[] {
  return (Array.isArray(rows) ? rows : []).map((row: any) => ({
    modelKey: row.modelKey,
    provider: row.provider,
    providerModel: row.providerModel,
    displayName: row.displayName,
    modality: row.modality,
    currency: row.currency,
    inputPrice: row.inputPrice,
    outputPrice: row.outputPrice,
    pricingRulesText: JSON.stringify(row.pricingRules || [], null, 2),
    enabled: row.enabled !== false,
  }));
}

function parseImportItems(raw: string) {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
  if (!items) {
    throw new Error("JSON 必须是数组，或 { items: [...] } 结构");
  }
  return items;
}

function formatDisplayNumber(value: number, maximumFractionDigits = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(safe);
}

const MANAGED_SUBSCRIPTION_PLAN_IDS = ["basic", "pro", "enterprise"] as const;

function buildSubscriptionProductRows(entries: any, currency: string): SubscriptionProductRow[] {
  const defaultRows = pricingPlans
    .filter((plan) =>
      MANAGED_SUBSCRIPTION_PLAN_IDS.includes(
        plan.id.toLowerCase() as (typeof MANAGED_SUBSCRIPTION_PLAN_IDS)[number]
      )
    )
    .map((plan) => ({
      planId: plan.id.toLowerCase(),
      monthly: getPlanPrice(plan.id, "monthly", currency === "CNY"),
      yearly: getPlanPrice(plan.id, "annual", currency === "CNY"),
    }));

  const rowMap = new Map(defaultRows.map((row) => [row.planId, row]));

  for (const entry of Array.isArray(entries) ? entries : []) {
    const productType = String((entry?.productType ?? entry?.product_type) || "").toUpperCase();
    if (productType !== "SUBSCRIPTION") continue;

    const planId = String(entry?.planId ?? entry?.plan_id ?? "").toLowerCase();
    const billingCycle = entry?.billingCycle ?? entry?.billing_cycle;
    if (!planId || (billingCycle !== "monthly" && billingCycle !== "yearly")) continue;

    const fallback = rowMap.get(planId);
    if (!fallback) continue;

    rowMap.set(planId, {
      ...fallback,
      [billingCycle]: toNumber(entry?.amount),
    });
  }

  return defaultRows.map((row) => rowMap.get(row.planId) || row);
}

function buildAddonProductRows(entries: any, currency: string): AddonProductRow[] {
  const defaultRows = ADDON_PACKAGES.map((pkg) => ({
    addonPackageId: pkg.id,
    amount: currency === "CNY" ? pkg.priceZh : pkg.price,
    imageCredits: pkg.imageCredits,
    videoAudioCredits: pkg.videoAudioCredits,
  }));

  const rowMap = new Map(defaultRows.map((row) => [row.addonPackageId, row]));

  for (const entry of Array.isArray(entries) ? entries : []) {
    const productType = String((entry?.productType ?? entry?.product_type) || "").toUpperCase();
    if (productType !== "ADDON") continue;

    const addonPackageId = String(entry?.addonPackageId ?? entry?.addon_package_id ?? "");
    if (!addonPackageId) continue;

    const fallback = rowMap.get(addonPackageId);
    if (!fallback) continue;

    rowMap.set(addonPackageId, {
      ...fallback,
      amount: toNumber(entry?.amount),
      imageCredits: Math.max(
        0,
        Math.floor(toNumber(entry?.metadata?.imageCredits, fallback.imageCredits))
      ),
      videoAudioCredits: Math.max(
        0,
        Math.floor(toNumber(entry?.metadata?.videoAudioCredits, fallback.videoAudioCredits))
      ),
    });
  }

  return defaultRows.map((row) => rowMap.get(row.addonPackageId) || row);
}

export default function BillingAdminPage() {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [subscriptionProducts, setSubscriptionProducts] = useState<SubscriptionProductRow[]>([]);
  const [addonProducts, setAddonProducts] = useState<AddonProductRow[]>([]);
  const [modelImportText, setModelImportText] = useState("");
  const [modelImportFileName, setModelImportFileName] = useState<string | null>(null);
  const [settingsMode, setSettingsMode] = useState<SettingsMode>("simple");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"settings" | "products" | "models" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [settingsRes, productsRes] = await Promise.all([
        fetch("/api/admin/billing/settings", { cache: "no-store" }),
        fetch("/api/admin/billing/products", { cache: "no-store" }),
      ]);
      const [settingsJson, productsJson] = await Promise.all([
        settingsRes.json(),
        productsRes.json(),
      ]);

      if (!settingsRes.ok || !settingsJson?.success) throw new Error(settingsJson?.error || "加载计费配置失败");
      if (!productsRes.ok || !productsJson?.success) throw new Error(productsJson?.error || "加载商品价格失败");

      const resolvedDefaultCurrency = normalizeCurrency(
        settingsJson.data?.defaultCurrency,
        settingsJson.data?.region === "CN" ? "CNY" : "USD"
      );

      setSettings(settingsJson.data);
      setSubscriptionProducts(
        buildSubscriptionProductRows(productsJson.data, resolvedDefaultCurrency)
      );
      setAddonProducts(
        buildAddonProductRows(productsJson.data, resolvedDefaultCurrency)
      );
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving("settings");
    setError(null);
    setSuccess(null);
    try {
      const payload =
        settingsMode === "simple"
          ? { ...settings, creditExchangeRate: settings.rechargeCreditRate }
          : settings;
      const res = await fetch("/api/admin/billing/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "保存失败");
      setSettings(json.data);
      setSuccess("计费全局参数已保存");
    } catch (err: any) {
      setError(err?.message || "保存失败");
    } finally {
      setSaving(null);
    }
  };

  const saveProducts = async () => {
    setSaving("products");
    setError(null);
    setSuccess(null);
    try {
      const productCurrency = normalizeCurrency(
        settings?.defaultCurrency,
        settings?.region === "CN" ? "CNY" : "USD"
      );
      const items = [
        ...subscriptionProducts.flatMap((row) => [
          {
            productType: "SUBSCRIPTION",
            planId: row.planId,
            billingCycle: "monthly",
            currency: productCurrency,
            amount: row.monthly,
          },
          {
            productType: "SUBSCRIPTION",
            planId: row.planId,
            billingCycle: "yearly",
            currency: productCurrency,
            amount: row.yearly,
          },
        ]),
        ...addonProducts.map((row) => ({
          productType: "ADDON",
          addonPackageId: row.addonPackageId,
          currency: productCurrency,
          amount: row.amount,
          metadata: {
            imageCredits: Math.max(0, Math.floor(row.imageCredits)),
            videoAudioCredits: Math.max(0, Math.floor(row.videoAudioCredits)),
          },
        })),
      ];

      const res = await fetch("/api/admin/billing/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "保存失败");

      setSubscriptionProducts(buildSubscriptionProductRows(json.data, productCurrency));
      setAddonProducts(buildAddonProductRows(json.data, productCurrency));
      setSuccess("商品价格已保存");
    } catch (err: any) {
      setError(err?.message || "保存失败");
    } finally {
      setSaving(null);
    }
  };

  const importModels = async () => {
    setSaving("models");
    setError(null);
    setSuccess(null);
    try {
      if (!modelImportText.trim()) throw new Error("请先粘贴或选择模型目录 JSON");
      const items = parseImportItems(modelImportText.trim());
      const res = await fetch("/api/admin/billing/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "导入失败");
      setModels(mapModelRows(json.data));
      setSuccess(`模型目录 JSON 导入成功，共处理 ${items.length} 条`);
    } catch (err: any) {
      setError(err?.message || "导入失败，请检查 JSON 格式");
    } finally {
      setSaving(null);
    }
  };


  const loadLatestOpenRouterModels = async () => {
    setSaving("models");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/billing/models/openrouter?order=newest", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "抓取失败");
      const items = Array.isArray(json?.data?.items) ? json.data.items : [];
      setModelImportText(JSON.stringify(items, null, 2));
      setModelImportFileName(`openrouter-latest-${json?.data?.fetchedAt || 'preview'}.json`);
      setSuccess(`已抓取 OpenRouter 最新模型，共 ${items.length} 条，可直接点击下方导入`);
    } catch (err: any) {
      setError(err?.message || "抓取失败");
    } finally {
      setSaving(null);
    }
  };

  const importLatestOpenRouterModels = async () => {
    setSaving("models");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/billing/models/openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: "newest" }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "导入失败");
      setModels(mapModelRows(json.data));
      setSuccess(`OpenRouter 最新模型已导入，共 ${json?.meta?.imported || 0} 条`);
    } catch (err: any) {
      setError(err?.message || "导入失败");
    } finally {
      setSaving(null);
    }
  };

  const defaultCurrency = useMemo(
    () => normalizeCurrency(settings?.defaultCurrency, settings?.region === "CN" ? "CNY" : "USD"),
    [settings?.defaultCurrency, settings?.region]
  );
  const oneCurrencyRechargeCredits = settings
    ? Math.max(0, Math.floor(settings.rechargeCreditRate || 0))
    : 0;
  const tenCurrencyRechargeCredits = oneCurrencyRechargeCredits * 10;
  const effectiveCreditExchangeRate = settings
    ? settingsMode === "simple"
      ? settings.rechargeCreditRate || 0
      : settings.creditExchangeRate || 0
    : 0;
  const oneCurrencyChargeCredits = settings
    ? Math.max(0, Math.ceil((settings.profitMultiplier || 0) * effectiveCreditExchangeRate))
    : 0;
  const oneCentChargeCredits = settings
    ? Math.max(
        settings.minimumChargeCredits || 0,
        Math.ceil(0.01 * (settings.profitMultiplier || 0) * effectiveCreditExchangeRate)
      )
    : 0;
  const costCoveragePerOneCurrency = settings
    ? (settings.rechargeCreditRate || 0) /
      Math.max(1, (settings.profitMultiplier || 0) * effectiveCreditExchangeRate)
    : 0;

  const currentModelsExportJson = useMemo(
    () => JSON.stringify(exportableModelRows(models), null, 2),
    [models]
  );

  const handleChooseImportFile = () => {
    importFileRef.current?.click();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setModelImportText(text);
      setModelImportFileName(file.name);
      setSuccess(`已载入文件：${file.name}`);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "读取 JSON 文件失败");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">AI 计费</h1>
          <p className="text-gray-500">统一 Credits、模型真实价格、平台资金池</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>单位约定</CardTitle>
          <CardDescription>页面里所有价格都填写模型真实成本，不填 Credits；Credits 只由系统自动换算。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {METRIC_UNIT_HINTS.map((item) => (
            <div key={item.metricKey} className="rounded-lg border p-3">
              <div className="text-sm font-medium">{item.metricKey}</div>
              <div className="mt-1 text-xs text-foreground">单位：{item.unit}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.note}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>全局参数</CardTitle>
              <CardDescription>
                这里只保留 3 个核心数字：用户充值到账多少 Credits、平台加价倍率、最低扣费。其他参数默认由系统自动处理。
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSettingsMode((prev) => (prev === "advanced" ? "simple" : "advanced"))}
            >
              {settingsMode === "advanced" ? "收起高级参数" : "展开高级参数"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">用户充值 1 {defaultCurrency}</div>
                  <div className="mt-1 text-2xl font-semibold">{formatDisplayNumber(oneCurrencyRechargeCredits, 0)} Credits</div>
                  <div className="mt-1 text-xs text-muted-foreground">用户拿到的额度</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">平台真实成本 0.01 {defaultCurrency}</div>
                  <div className="mt-1 text-2xl font-semibold">≈ {formatDisplayNumber(oneCentChargeCredits, 0)} Credits</div>
                  <div className="mt-1 text-xs text-muted-foreground">便宜请求大概扣多少</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">平台真实成本 1 {defaultCurrency}</div>
                  <div className="mt-1 text-2xl font-semibold">≈ {formatDisplayNumber(oneCurrencyChargeCredits, 0)} Credits</div>
                  <div className="mt-1 text-xs text-muted-foreground">系统实际扣费强度</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">充值 1 {defaultCurrency} 到账多少 Credits</div>
                  <Input
                    type="number"
                    value={settings.rechargeCreditRate}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, rechargeCreditRate: toNumber(e.target.value) } : prev
                      )
                    }
                    placeholder="例如 10000"
                  />
                  <p className="text-xs text-muted-foreground">最核心的数字，建议优先调整它。</p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">平台加价倍率</div>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.profitMultiplier}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, profitMultiplier: toNumber(e.target.value) } : prev
                      )
                    }
                    placeholder="例如 2.5"
                  />
                  <p className="text-xs text-muted-foreground">越高代表平台毛利越高。</p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">最低一次扣多少 Credits</div>
                  <Input
                    type="number"
                    value={settings.minimumChargeCredits}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, minimumChargeCredits: toNumber(e.target.value) } : prev
                      )
                    }
                    placeholder="例如 1"
                  />
                  <p className="text-xs text-muted-foreground">防止超低价请求几乎不扣费。</p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-medium">当前效果</div>
                <div className="mt-2 text-muted-foreground">
                  用户充值 10 {defaultCurrency} ≈ {formatDisplayNumber(tenCurrencyRechargeCredits, 0)} Credits；
                  成本 0.01 {defaultCurrency} ≈ 扣 {formatDisplayNumber(oneCentChargeCredits, 0)} Credits；
                  成本 1 {defaultCurrency} ≈ 扣 {formatDisplayNumber(oneCurrencyChargeCredits, 0)} Credits。
                </div>
              </div>

              {settingsMode === "advanced" && (
                <div className="rounded-lg border p-4 space-y-4">
                  <div>
                    <div className="text-sm font-medium">高级参数</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      只有当你想把“充值到账比例”和“模型成本扣费比例”拆开配置时，才需要改这里。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">1 {defaultCurrency} 成本基础值</div>
                      <Input
                        type="number"
                        value={settings.creditExchangeRate}
                        onChange={(e) =>
                          setSettings((prev) =>
                            prev ? { ...prev, creditExchangeRate: toNumber(e.target.value) } : prev
                          )
                        }
                        placeholder="例如 10000"
                      />
                      <p className="text-xs text-muted-foreground">
                        普通情况不用改；简化模式保存时会自动等于“充值到账比例”。
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">结算货币</div>
                      <Input
                        value={settings.defaultCurrency}
                        onChange={(e) =>
                          setSettings((prev) =>
                            prev ? { ...prev, defaultCurrency: e.target.value.toUpperCase() } : prev
                          )
                        }
                        placeholder="例如 CNY 或 USD"
                      />
                      <p className="text-xs text-muted-foreground">国内一般填 CNY，国际一般填 USD。</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <Button onClick={saveSettings} disabled={saving === "settings" || loading || !settings}>
            <Save className="w-4 h-4 mr-2" />
            {saving === "settings" ? "保存中..." : "保存全局参数"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品价格</CardTitle>
          <CardDescription>
            这里只改用户购买订阅套餐和加油包时的售价。价格按当前后台所属区域隔离保存，不影响模型真实成本和 Credits 扣费公式。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="font-medium">当前区域售卖货币：{defaultCurrency}</div>
            <div className="mt-1 text-muted-foreground">
              Web 支付价格改这里即可；如果 iOS 原生内购已启用，App Store 订阅价格仍需在 Apple 后台同步调整。
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">订阅套餐</div>
              <p className="text-xs text-muted-foreground">月付和年付分开设置，支付页会自动读取。</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>套餐</TableHead>
                  <TableHead>月付价格（{defaultCurrency}）</TableHead>
                  <TableHead>年付价格（{defaultCurrency}）</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptionProducts.map((row, idx) => {
                  const plan = pricingPlans.find((item) => item.id === row.planId);
                  return (
                    <TableRow key={`${row.planId}-${idx}`}>
                      <TableCell>
                        <div className="font-medium">{plan?.nameZh || plan?.name || row.planId}</div>
                        <div className="text-xs text-muted-foreground">{plan?.name || row.planId}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.monthly}
                          placeholder="例如 29.9"
                          onChange={(e) =>
                            setSubscriptionProducts((prev) =>
                              prev.map((item, index) =>
                                index === idx ? { ...item, monthly: toNumber(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.yearly}
                          placeholder="例如 239.9"
                          onChange={(e) =>
                            setSubscriptionProducts((prev) =>
                              prev.map((item, index) =>
                                index === idx ? { ...item, yearly: toNumber(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">加油包</div>
              <p className="text-xs text-muted-foreground">可同时修改售价与赠送额度，支付页展示与实际发放都将按后台配置生效。</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>加油包</TableHead>
                  <TableHead>图片额度</TableHead>
                  <TableHead>视频/音频额度</TableHead>
                  <TableHead>售价（{defaultCurrency}）</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addonProducts.map((row, idx) => {
                  const addon = ADDON_PACKAGES.find((item) => item.id === row.addonPackageId);
                  return (
                    <TableRow key={`${row.addonPackageId}-${idx}`}>
                      <TableCell>
                        <div className="font-medium">{addon?.nameZh || addon?.name || row.addonPackageId}</div>
                        <div className="text-xs text-muted-foreground">{addon?.name || row.addonPackageId}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.imageCredits}
                          placeholder="例如 100"
                          onChange={(e) =>
                            setAddonProducts((prev) =>
                              prev.map((item, index) =>
                                index === idx
                                  ? {
                                      ...item,
                                      imageCredits: Math.max(0, Math.floor(toNumber(e.target.value))),
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.videoAudioCredits}
                          placeholder="例如 20"
                          onChange={(e) =>
                            setAddonProducts((prev) =>
                              prev.map((item, index) =>
                                index === idx
                                  ? {
                                      ...item,
                                      videoAudioCredits: Math.max(0, Math.floor(toNumber(e.target.value))),
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          placeholder="例如 29.9"
                          onChange={(e) =>
                            setAddonProducts((prev) =>
                              prev.map((item, index) =>
                                index === idx ? { ...item, amount: toNumber(e.target.value) } : item
                              )
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Button onClick={saveProducts} disabled={saving === "products" || loading}>
            <Save className="w-4 h-4 mr-2" />
            {saving === "products" ? "保存中..." : "保存商品价格"}
          </Button>
        </CardContent>
      </Card>    </div>
  );
}
