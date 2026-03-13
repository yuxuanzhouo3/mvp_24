"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FileJson, RefreshCw, Upload } from "lucide-react";

type BillingSettings = {
  region: "CN" | "INTL";
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

type OpenRouterImportItem = {
  modelKey: string;
  provider: string;
  providerModel: string;
  displayName: string;
  modality: string;
  currency: string;
  inputPrice: number;
  outputPrice: number;
  enabled: boolean;
  pricingRules?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

type ProviderPreviewResponse = {
  fetchedAt: string;
  order?: string;
  totalAvailable: number;
  returned: number;
  items: OpenRouterImportItem[];
};

const PAGE_SIZE = 15;
const OPENROUTER_ORDER_OPTIONS = [
  { value: "newest", label: "最新上架" },
  { value: "most-popular", label: "最热门" },
];
const OPENROUTER_LIMIT_OPTIONS = [50, 100, 200];
const CN_PREVIEW_PROVIDER_OPTIONS = [
  { value: "bailian", label: "阿里百炼" },
  { value: "volcengine", label: "火山引擎" },
] as const;
const PRICE_FILTER_OPTIONS = [
  { value: "all", label: "全部价格" },
  { value: "free", label: "仅免费" },
  { value: "low", label: "低价" },
  { value: "mid", label: "中价" },
  { value: "high", label: "高价" },
];
const CHARGE_FILTER_OPTIONS = [
  { value: "all", label: "免费+付费" },
  { value: "paid", label: "仅付费" },
  { value: "free", label: "仅免费" },
];

type ChargeFilter = "all" | "paid" | "free";
type PriceFilter = "all" | "free" | "low" | "mid" | "high";

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
    ],
    null,
    2
  );
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

function parseImportItems(raw: string) {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
  if (!items) throw new Error("JSON 必须是数组，或 { items: [...] } 结构");
  return items;
}

function formatRange(page: number, total: number, pageSize: number) {
  if (total === 0) return "0 - 0";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `${start} - ${end}`;
}


function totalUnitPrice(item: { inputPrice?: number; outputPrice?: number }) {
  return Number(item.inputPrice || 0) + Number(item.outputPrice || 0);
}

function matchesChargeFilter(item: { inputPrice?: number; outputPrice?: number }, filter: ChargeFilter) {
  const isFree = totalUnitPrice(item) === 0;
  if (filter === "free") return isFree;
  if (filter === "paid") return !isFree;
  return true;
}

function matchesPriceFilter(item: { inputPrice?: number; outputPrice?: number }, filter: PriceFilter) {
  const total = totalUnitPrice(item);
  if (filter === "all") return true;
  if (filter === "free") return total === 0;
  if (filter === "low") return total > 0 && total <= 0.001;
  if (filter === "mid") return total > 0.001 && total <= 0.02;
  if (filter === "high") return total > 0.02;
  return true;
}

function matchesSearch(item: { modelKey?: string; displayName?: string; provider?: string }, keyword: string) {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;
  return [item.displayName, item.modelKey, item.provider]
    .map((value) => String(value || "").toLowerCase())
    .some((value) => value.includes(query));
}


function isFreeModel(item: OpenRouterImportItem) {
  return Number(item.inputPrice || 0) === 0 && Number(item.outputPrice || 0) === 0;
}

function normalizePreviewItems(items: OpenRouterImportItem[]) {
  const deduped = new Map<string, OpenRouterImportItem>();
  for (const item of items) {
    const key = String(item.modelKey || "").trim();
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, item);
      continue;
    }

    const existing = deduped.get(key)!;
    const existingFree = isFreeModel(existing);
    const currentFree = isFreeModel(item);
    if (existingFree && !currentFree) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const freeDiff = Number(isFreeModel(a)) - Number(isFreeModel(b));
    if (freeDiff !== 0) return freeDiff;
    return String(a.displayName || a.modelKey).localeCompare(String(b.displayName || b.modelKey));
  });
}

export default function ModelCatalogAdminPage() {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [modelImportText, setModelImportText] = useState("");
  const [modelImportFileName, setModelImportFileName] = useState<string | null>(null);
  const [openRouterPreview, setOpenRouterPreview] = useState<OpenRouterImportItem[]>([]);
  const [openRouterFetchedAt, setOpenRouterFetchedAt] = useState<string | null>(null);
  const [openRouterOrder, setOpenRouterOrder] = useState("newest");
  const [openRouterLimit, setOpenRouterLimit] = useState(100);
  const [cnPreviewProvider, setCnPreviewProvider] = useState<"bailian" | "volcengine">("bailian");
  const [selectedPreviewKeys, setSelectedPreviewKeys] = useState<string[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [previewSearch, setPreviewSearch] = useState("");
  const [catalogChargeFilter, setCatalogChargeFilter] = useState<ChargeFilter>("all");
  const [previewChargeFilter, setPreviewChargeFilter] = useState<ChargeFilter>("all");
  const [catalogPriceFilter, setCatalogPriceFilter] = useState<PriceFilter>("all");
  const [previewPriceFilter, setPreviewPriceFilter] = useState<PriceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"models" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewPage, setPreviewPage] = useState(1);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [settingsRes, modelsRes] = await Promise.all([
        fetch("/api/admin/billing/settings", { cache: "no-store" }),
        fetch("/api/admin/billing/models", { cache: "no-store" }),
      ]);
      const [settingsJson, modelsJson] = await Promise.all([settingsRes.json(), modelsRes.json()]);
      if (!settingsRes.ok || !settingsJson?.success) throw new Error(settingsJson?.error || "加载计费配置失败");
      if (!modelsRes.ok || !modelsJson?.success) throw new Error(modelsJson?.error || "加载模型目录失败");
      setSettings(settingsJson.data);
      setModels(mapModelRows(modelsJson.data));
    } catch (err: any) {
      setError(err?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const defaultCurrency = useMemo(
    () => normalizeCurrency(settings?.defaultCurrency, settings?.region === "CN" ? "CNY" : "USD"),
    [settings?.defaultCurrency, settings?.region]
  );
  const isIntlRegion = settings?.region === "INTL";
  const isCnRegion = settings?.region === "CN";
  const previewProviderSlug = isCnRegion ? cnPreviewProvider : "openrouter";
  const previewProviderName =
    previewProviderSlug === "bailian" ? "阿里百炼" : previewProviderSlug === "volcengine" ? "火山引擎" : "OpenRouter";
  const previewProviderEndpoint = isCnRegion
    ? `/api/admin/billing/models/${previewProviderSlug}`
    : "/api/admin/billing/models/openrouter";
  const previewProviderDescription = isCnRegion
    ? previewProviderSlug === "volcengine"
      ? "基于火山引擎官方模型与价格页面抓取，先预览，再勾选导入；也支持直接一键导入当前抓取结果。"
      : "基于阿里云百炼官方模型与价格页面抓取，先预览，再勾选导入；也支持直接一键导入当前抓取结果。"
    : "先预览，再勾选导入；也支持直接一键导入当前抓取结果。";
  const previewSourceHint = isCnRegion
    ? previewProviderSlug === "volcengine"
      ? "来源：火山引擎官方模型与价格文档；如已配置 VOLCENGINE_ARK_ACCESS_KEY_ID / VOLCENGINE_ARK_SECRET_ACCESS_KEY，会自动合并方舟模型列表"
      : "来源：阿里云百炼官方模型与价格文档"
    : "来源：OpenRouter 最新模型与价格数据";

  const currentModelsExportJson = useMemo(
    () => JSON.stringify(exportableModelRows(models), null, 2),
    [models]
  );

  const filteredModels = useMemo(
    () =>
      models.filter(
        (item) =>
          matchesSearch(item, catalogSearch) &&
          matchesChargeFilter(item, catalogChargeFilter) &&
          matchesPriceFilter(item, catalogPriceFilter)
      ),
    [catalogChargeFilter, catalogPriceFilter, catalogSearch, models]
  );

  const filteredOpenRouterPreview = useMemo(
    () =>
      openRouterPreview.filter(
        (item) =>
          matchesSearch(item, previewSearch) &&
          matchesChargeFilter(item, previewChargeFilter) &&
          matchesPriceFilter(item, previewPriceFilter)
      ),
    [openRouterPreview, previewChargeFilter, previewPriceFilter, previewSearch]
  );

  const currentPageCount = Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE));
  const previewPageCount = Math.max(1, Math.ceil(filteredOpenRouterPreview.length / PAGE_SIZE));

  const currentModelsPageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredModels.slice(start, start + PAGE_SIZE);
  }, [filteredModels, currentPage]);

  const previewPageRows = useMemo(() => {
    const start = (previewPage - 1) * PAGE_SIZE;
    return filteredOpenRouterPreview.slice(start, start + PAGE_SIZE);
  }, [filteredOpenRouterPreview, previewPage]);

  const currentModelKeySet = useMemo(
    () => new Set(models.map((item) => item.modelKey).filter(Boolean)),
    [models]
  );
  useEffect(() => {
    setCurrentPage(1);
  }, [catalogSearch, catalogChargeFilter, catalogPriceFilter]);

  useEffect(() => {
    setPreviewPage(1);
  }, [previewSearch, previewChargeFilter, previewPriceFilter]);

  const selectedPreviewSet = useMemo(() => new Set(selectedPreviewKeys), [selectedPreviewKeys]);
  const selectedPreviewItems = useMemo(
    () => openRouterPreview.filter((item) => selectedPreviewSet.has(item.modelKey)),
    [openRouterPreview, selectedPreviewSet]
  );
  const currentPageAllSelected =
    previewPageRows.length > 0 && previewPageRows.every((item) => selectedPreviewSet.has(item.modelKey));

  const refreshModels = async () => {
    const res = await fetch("/api/admin/billing/models", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "刷新模型目录失败");
    setModels(mapModelRows(json.data));
  };

  const importItems = async (items: OpenRouterImportItem[] | any[], successMessage: string) => {
    setSaving("models");
    setError(null);
    setSuccess(null);
    try {
      if (!items.length) throw new Error("请先选择要导入的模型");
      const res = await fetch("/api/admin/billing/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "导入失败");
      setModels(mapModelRows(json.data));
      setSuccess(successMessage);
    } catch (err: any) {
      setError(err?.message || "导入失败");
    } finally {
      setSaving(null);
    }
  };

  const importModels = async () => {
    try {
      if (!modelImportText.trim()) throw new Error("请先粘贴或选择模型目录 JSON");
      const items = parseImportItems(modelImportText.trim());
      await importItems(items, `模型目录 JSON 导入成功，共处理 ${items.length} 条`);
    } catch (err: any) {
      setError(err?.message || "导入失败，请检查 JSON 格式");
    }
  };

  const fetchProviderPreview = useCallback(async () => {
    setSaving("preview");
    setError(null);
    setSuccess(null);
    try {
      const endpoint = isCnRegion
        ? `${previewProviderEndpoint}?limit=${openRouterLimit}`
        : `${previewProviderEndpoint}?order=${encodeURIComponent(openRouterOrder)}&limit=${openRouterLimit}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "抓取失败");
      const data = (json?.data || {}) as ProviderPreviewResponse;
      const items = normalizePreviewItems(Array.isArray(data.items) ? data.items : []);
      setOpenRouterPreview(items);
      setOpenRouterFetchedAt(data.fetchedAt || null);
      setSelectedPreviewKeys([]);
      setPreviewPage(1);
      setModelImportText(JSON.stringify(items, null, 2));
      setModelImportFileName(`${previewProviderSlug}-${isCnRegion ? "official" : openRouterOrder}-${data.fetchedAt || "preview"}.json`);
      setSuccess(`已抓取 ${previewProviderName} 预览，共 ${items.length} 条`);
    } catch (err: any) {
      setError(err?.message || "抓取失败");
    } finally {
      setSaving(null);
    }
  }, [isCnRegion, openRouterLimit, openRouterOrder, previewProviderEndpoint, previewProviderName, previewProviderSlug]);

  useEffect(() => {
    if (settings?.region === "INTL" || settings?.region === "CN") {
      fetchProviderPreview().catch(() => {});
    }
  }, [fetchProviderPreview, settings?.region]);

  const importLatestProviderModels = async () => {
    setSaving("models");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(previewProviderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: openRouterOrder, limit: openRouterLimit }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "导入失败");
      setModels(mapModelRows(json.data));
      setSuccess(`已一键导入 ${previewProviderName} 模型，共 ${json?.meta?.imported || 0} 条`);
    } catch (err: any) {
      setError(err?.message || "导入失败");
    } finally {
      setSaving(null);
    }
  };

  const importSelectedPreview = async () => {
    await importItems(selectedPreviewItems, `已导入选中的${previewProviderName}模型，共 ${selectedPreviewItems.length} 条`);
  };

  const importSinglePreview = async (item: OpenRouterImportItem) => {
    await importItems([item], `已导入模型：${item.displayName || item.modelKey}`);
  };

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

  const togglePreviewKey = (modelKey: string) => {
    setSelectedPreviewKeys((prev) =>
      prev.includes(modelKey) ? prev.filter((item) => item !== modelKey) : [...prev, modelKey]
    );
  };

  const toggleSelectCurrentPreviewPage = () => {
    const pageKeys = previewPageRows.map((item) => item.modelKey);
    setSelectedPreviewKeys((prev) => {
      const next = new Set(prev);
      const allSelected = pageKeys.every((key) => next.has(key));
      if (allSelected) {
        pageKeys.forEach((key) => next.delete(key));
      } else {
        pageKeys.forEach((key) => next.add(key));
      }
      return Array.from(next);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">模型目录</h1>
          <p className="text-gray-500 mt-1">支持预览当前目录、分页查看 OpenRouter 最新模型，并直接勾选后一键导入。</p>
        </div>
        <div className="flex gap-2 text-sm text-muted-foreground">
          <div className="rounded-lg border px-3 py-2">当前目录：{filteredModels.length} / {models.length} 个</div>
          {settings?.region === "INTL" || settings?.region === "CN" ? (
            <div className="rounded-lg border px-3 py-2">OpenRouter 预览：{filteredOpenRouterPreview.length} / {openRouterPreview.length} 个</div>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle>当前模型目录</CardTitle>
            <CardDescription>后台当前已生效的模型目录，支持分页预览与导出为 JSON。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  显示 {formatRange(currentPage, filteredModels.length, PAGE_SIZE)} / 共 {filteredModels.length} 条
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={refreshModels} disabled={loading || saving !== null}>
                    <RefreshCw className="mr-2 h-4 w-4" />刷新目录
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setModelImportText(currentModelsExportJson);
                      setModelImportFileName("current-model-catalog.json");
                    }}
                    disabled={models.length === 0}
                  >
                    <FileJson className="mr-2 h-4 w-4" />导出当前 JSON
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="搜索模型名 / modelKey / provider"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={catalogChargeFilter}
                  onChange={(e) => setCatalogChargeFilter(e.target.value as ChargeFilter)}
                >
                  {CHARGE_FILTER_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={catalogPriceFilter}
                  onChange={(e) => setCatalogPriceFilter(e.target.value as PriceFilter)}
                >
                  {PRICE_FILTER_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="max-h-[620px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>模态</TableHead>
                    <TableHead>{`输入价格（${defaultCurrency} / 1K Tokens）`}</TableHead>
                    <TableHead>{`输出价格（${defaultCurrency} / 1K Tokens）`}</TableHead>
                    <TableHead>启用</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentModelsPageRows.map((row, idx) => (
                    <TableRow key={`${row.modelKey}-${idx}`}>
                      <TableCell>
                        <div className="font-medium">{row.displayName || row.modelKey}</div>
                        <div className="font-mono text-xs text-muted-foreground">{row.modelKey}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.provider || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.modality || "text"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.inputPrice ?? 0}</TableCell>
                      <TableCell className="font-mono text-xs">{row.outputPrice ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.enabled ? "启用" : "停用"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">第 {currentPage} / {currentPageCount} 页</div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}>上一页</Button>
                <Button variant="outline" disabled={currentPage >= currentPageCount} onClick={() => setCurrentPage((value) => Math.min(currentPageCount, value + 1))}>下一页</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{previewProviderName} 预览与导入</CardTitle>
            <CardDescription>{previewProviderDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIntlRegion || isCnRegion ? (
              <>
                <div className={`grid grid-cols-1 gap-3 ${isCnRegion ? "md:grid-cols-[160px_160px_auto_auto_auto]" : "md:grid-cols-[1fr_160px_auto_auto_auto]"}`}>
                  {isCnRegion && (
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">国内数据源</span>
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={cnPreviewProvider}
                        onChange={(e) => setCnPreviewProvider(e.target.value as "bailian" | "volcengine")}
                      >
                        {CN_PREVIEW_PROVIDER_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {isIntlRegion && (
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">OpenRouter 排序</span>
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={openRouterOrder}
                        onChange={(e) => setOpenRouterOrder(e.target.value)}
                      >
                        {OPENROUTER_ORDER_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">抓取数量</span>
                    <select
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={openRouterLimit}
                      onChange={(e) => setOpenRouterLimit(Number(e.target.value))}
                    >
                      {OPENROUTER_LIMIT_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <Button variant="outline" onClick={fetchProviderPreview} disabled={saving !== null}>
                    <RefreshCw className="mr-2 h-4 w-4" />刷新预览
                  </Button>
                  <Button variant="outline" onClick={importSelectedPreview} disabled={saving !== null || selectedPreviewItems.length === 0}>
                    <Upload className="mr-2 h-4 w-4" />导入所选
                  </Button>
                  <Button onClick={importLatestProviderModels} disabled={saving !== null || openRouterPreview.length === 0}>
                    <Upload className="mr-2 h-4 w-4" />一键导入当前预览
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="搜索模型名 / modelKey / provider"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                  />
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={previewChargeFilter}
                    onChange={(e) => setPreviewChargeFilter(e.target.value as ChargeFilter)}
                  >
                    {CHARGE_FILTER_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={previewPriceFilter}
                    onChange={(e) => setPreviewPriceFilter(e.target.value as PriceFilter)}
                  >
                    {PRICE_FILTER_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg border p-3 text-sm">
                  <div>已抓取：{filteredOpenRouterPreview.length} / {openRouterPreview.length} 条</div>
                  <div>已勾选：{selectedPreviewItems.length} 条</div>
                  <div>已在模型库：{filteredOpenRouterPreview.filter((item) => currentModelKeySet.has(item.modelKey)).length} 条</div>
                  <div>抓取时间：{openRouterFetchedAt || "尚未抓取"}</div>
                  <div>{previewSourceHint}</div>
                </div>

                <div className="max-h-[620px] overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <input type="checkbox" checked={currentPageAllSelected} onChange={toggleSelectCurrentPreviewPage} />
                        </TableHead>
                        <TableHead>模型</TableHead>
                        <TableHead>模态</TableHead>
                        <TableHead>{`输入价格（${defaultCurrency}）`}</TableHead>
                        <TableHead>{`输出价格（${defaultCurrency}）`}</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="w-28">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewPageRows.map((row) => (
                        <TableRow key={row.modelKey}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedPreviewSet.has(row.modelKey)}
                              onChange={() => togglePreviewKey(row.modelKey)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{row.displayName || row.modelKey}</div>
                            <div className="font-mono text-xs text-muted-foreground">{row.modelKey}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.modality || "text"}</TableCell>
                          <TableCell className="font-mono text-xs">{row.inputPrice ?? 0}</TableCell>
                          <TableCell className="font-mono text-xs">{row.outputPrice ?? 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{isFreeModel(row) ? "免费" : "付费"}</TableCell>
                          <TableCell className="text-xs">
                            {currentModelKeySet.has(row.modelKey) ? (
                              <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">已在模型库</span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">待导入</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => importSinglePreview(row)}
                              disabled={saving !== null}
                            >
                              {currentModelKeySet.has(row.modelKey) ? "重新导入" : "导入这条"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    显示 {formatRange(previewPage, filteredOpenRouterPreview.length, PAGE_SIZE)} / 共 {filteredOpenRouterPreview.length} 条
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={previewPage <= 1} onClick={() => setPreviewPage((value) => Math.max(1, value - 1))}>上一页</Button>
                    <Button variant="outline" disabled={previewPage >= previewPageCount} onClick={() => setPreviewPage((value) => Math.min(previewPageCount, value + 1))}>下一页</Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">当前后台暂不支持该区域的自动模型抓取导入。</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>JSON 导入器</CardTitle>
          <CardDescription>需要批量粘贴、导出再导入，仍然可以使用这个通道。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleChooseImportFile}>
              <Upload className="mr-2 h-4 w-4" />选择 JSON 文件
            </Button>
            <Button variant="outline" onClick={() => { setModelImportText(buildImportExample(defaultCurrency)); setModelImportFileName("model-import-example.json"); }}>
              <FileJson className="mr-2 h-4 w-4" />示例模板
            </Button>
          </div>

          <input ref={importFileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFileChange} />

          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {modelImportFileName ? `当前载入：${modelImportFileName}` : "当前未选择文件，可直接粘贴 JSON"}
          </div>

          <Textarea className="min-h-[280px] font-mono text-xs" value={modelImportText} onChange={(e) => setModelImportText(e.target.value)} placeholder={buildImportExample(defaultCurrency)} />

          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            导入规则：按 `modelKey + region` 批量 upsert；如需下线模型，也可以在 JSON 中将 `enabled` 设为 `false`。
          </div>

          <Button onClick={importModels} disabled={saving !== null || loading}>
            <Upload className="mr-2 h-4 w-4" />
            {saving === "models" ? "导入中..." : "导入模型目录 JSON"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
