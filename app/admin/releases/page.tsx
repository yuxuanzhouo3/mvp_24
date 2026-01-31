"use client";

import { ReactNode, useState, useEffect, useRef } from "react";
import {
  listReleases,
  createReleaseWithUrl,
  createRelease,
  deleteRelease,
  AppRelease,
  Platform,
} from "@/actions/admin-releases";
import {
  uploadToStorage,
  generateReleasePath,
  UploadProgress,
} from "@/lib/admin/client-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Loader2,
  Apple,
  Smartphone,
  Monitor,
  Upload,
} from "lucide-react";

const PLATFORMS: { value: Platform; label: string; icon: ReactNode }[] = [
  { value: "ios", label: "iOS", icon: <Apple className="w-4 h-4" /> },
  { value: "android", label: "Android", icon: <Smartphone className="w-4 h-4" /> },
  { value: "windows", label: "Windows", icon: <Monitor className="w-4 h-4" /> },
  { value: "macos", label: "macOS", icon: <Apple className="w-4 h-4" /> },
  { value: "linux", label: "Linux", icon: <Monitor className="w-4 h-4" /> },
];

const RELEASE_SOURCE_LABELS: Record<AppRelease["source"], string> = {
  supabase: "国际版",
  cloudbase: "国内版",
  both: "国际/国内",
};

const RELEASE_SOURCE_VARIANTS: Record<AppRelease["source"], "default" | "secondary" | "outline"> = {
  supabase: "secondary",
  cloudbase: "outline",
  both: "default",
};

const UPLOAD_TARGETS = [
  { value: "supabase", label: "国际版 (Supabase)" },
  { value: "cloudbase", label: "国内版 (CloudBase)" },
];

export default function ReleasesPage() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("windows");
  const [uploadTarget, setUploadTarget] = useState<string>("supabase");
  const [isActive, setIsActive] = useState(true);
  const [isMandatory, setIsMandatory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadReleases() {
    setLoading(true);
    setError(null);
    const result = await listReleases();
    if (result.success) {
      setReleases(result.data || []);
    } else {
      setError(result.error || "加载失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadReleases();
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setUploadProgress(null);
    setUploadStatus("");

    const formData = new FormData(e.currentTarget);
    const version = formData.get("version") as string;
    const releaseNotes = formData.get("releaseNotes") as string;
    const file = fileInputRef.current?.files?.[0];

    if (!version || !selectedPlatform) {
      setFormError("请填写必要字段");
      setFormLoading(false);
      return;
    }

    if (!file) {
      setFormError("请选择安装包文件");
      setFormLoading(false);
      return;
    }

    try {
      // CloudBase 上传使用 Server Action（受 body size 限制）
      if (uploadTarget === "cloudbase") {
        setUploadStatus("正在上传到 CloudBase...");
        const serverFormData = new FormData();
        serverFormData.append("version", version);
        serverFormData.append("platform", selectedPlatform);
        serverFormData.append("variant", "");
        serverFormData.append("releaseNotes", releaseNotes || "");
        serverFormData.append("isActive", isActive ? "true" : "false");
        serverFormData.append("isMandatory", isMandatory ? "true" : "false");
        serverFormData.append("file", file);
        serverFormData.append("uploadTarget", "cloudbase");

        const result = await createRelease(serverFormData);
        if (result.success) {
          setCreateDialogOpen(false);
          setUploadProgress(null);
          setUploadStatus("");
          resetFormState();
          loadReleases();
        } else {
          setFormError(result.error || "创建失败");
        }
        setFormLoading(false);
        return;
      }

      // Supabase 或双端上传：先客户端直传到 Supabase
      setUploadStatus("正在上传文件到 Supabase...");
      const filePath = generateReleasePath(
        selectedPlatform,
        null,
        version,
        file.name
      );

      const uploadResult = await uploadToStorage(
        file,
        "releases",
        filePath,
        (progress) => {
          setUploadProgress(progress);
          setUploadStatus(`上传中... ${progress.percentage}%`);
        }
      );

      if (!uploadResult.success) {
        setFormError(uploadResult.error || "文件上传失败");
        setFormLoading(false);
        return;
      }

      // 创建版本记录
      setUploadStatus("正在创建版本记录...");
      const result = await createReleaseWithUrl({
        version,
        platform: selectedPlatform,
        variant: null,
        releaseNotes: releaseNotes || null,
        isActive,
        isMandatory,
        fileUrl: uploadResult.url!,
        fileSize: uploadResult.fileSize!,
        uploadTarget: uploadTarget as "supabase" | "cloudbase",
      });

      if (result.success) {
        setCreateDialogOpen(false);
        setUploadProgress(null);
        setUploadStatus("");
        resetFormState();
        loadReleases();
      } else {
        setFormError(result.error || "创建失败");
      }
    } catch (err) {
      console.error("Create release error:", err);
      setFormError("创建失败，请重试");
    }

    setFormLoading(false);
  }

  function resetFormState() {
    setUploadTarget("supabase");
    setIsActive(true);
    setIsMandatory(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openCreateDialog(platform?: Platform, source?: AppRelease["source"]) {
    resetFormState();
    if (platform) {
      setSelectedPlatform(platform);
    }
    if (source) {
      setUploadTarget(source === "cloudbase" ? "cloudbase" : "supabase");
    }
    setCreateDialogOpen(true);
  }

  async function handleDelete(release: AppRelease) {
    if (!confirm(`确认删除 ${release.platform} v${release.version}？`)) {
      return;
    }
    setActionLoadingId(release.id);
    const result = await deleteRelease(release.id);
    if (result.success) {
      loadReleases();
    } else {
      setError(result.error || "删除失败");
    }
    setActionLoadingId(null);
  }

  const latestReleases = (() => {
    const sorted = [...releases]
      .filter((release) => release.file_url || release.cloudbase_file_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const seen = new Map<string, AppRelease>();
    for (const release of sorted) {
      const sourceKey = release.source === "both" ? "both" : release.source;
      const key = `${release.platform}-${sourceKey}`;
      if (!seen.has(key)) {
        seen.set(key, release);
      }
    }
    return Array.from(seen.values());
  })();

  function formatFileSize(bytes?: number | null): string {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatReleaseDate(value?: string | null): string {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  function getPlatformIcon(platform: Platform) {
    const p = PLATFORMS.find((p) => p.value === platform);
    return p?.icon || <Monitor className="w-4 h-4" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">发布版本</h1>
          <p className="text-gray-500">
            每个平台仅展示最新的已上传版本，国际版和国内版均支持替换上传。
          </p>
        </div>
        <Button onClick={() => openCreateDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          上传新版本
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 border-b">
          <p className="text-sm text-gray-500">
            如果前端需要读取版本信息，请确保对应平台存在上传记录；点击“替换上传”即可更新当前版本。
          </p>
          <Button variant="outline" size="sm" onClick={loadReleases}>
            <Loader2 className="w-4 h-4 mr-2" />
            刷新列表
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : latestReleases.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              暂无已上传版本，点击“上传新版本”即刻开始
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台</TableHead>
                  <TableHead>当前版本</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestReleases.map((release) => (
                  <TableRow key={release.platform}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(release.platform)}
                          <span className="font-medium">
                            {PLATFORMS.find((p) => p.value === release.platform)?.label}
                          </span>
                        </div>
                        <Badge variant={RELEASE_SOURCE_VARIANTS[release.source]}>
                          {RELEASE_SOURCE_LABELS[release.source]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-lg font-semibold">
                      v{release.version}
                      {release.variant && (
                        <span className="ml-2 text-xs text-gray-500">
                          {release.variant}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatReleaseDate(release.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openCreateDialog(release.platform, release.source)}
                        >
                          替换上传
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500"
                          onClick={() => handleDelete(release)}
                          disabled={actionLoadingId === release.id}
                        >
                          {actionLoadingId === release.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "删除"
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 创建对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) {
          setFormError(null);
          setUploadProgress(null);
          setUploadStatus("");
          resetFormState();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建版本</DialogTitle>
            <DialogDescription>上传新的应用安装包（支持大文件直传）</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="grid gap-4 py-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="version">版本号 *</Label>
                  <Input
                    id="version"
                    name="version"
                    placeholder="1.0.0"
                    required
                    disabled={formLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platform">平台 *</Label>
                  <Select
                    value={selectedPlatform}
                    onValueChange={(v) => {
                      setSelectedPlatform(v as Platform);
                    }}
                    disabled={formLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="uploadTarget">上传目标 *</Label>
                <Select
                  value={uploadTarget}
                  onValueChange={setUploadTarget}
                  disabled={formLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPLOAD_TARGETS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">安装包文件 *</Label>
                <Input
                  id="file"
                  type="file"
                  ref={fileInputRef}
                  required
                  disabled={formLoading}
                  className="cursor-pointer"
                />
                <p className="text-xs text-gray-500">
                  {uploadTarget === "cloudbase"
                    ? "CloudBase 上传受服务器限制（建议小于 50MB）"
                    : "支持任意大小文件，直接上传到云存储"}
                </p>
              </div>

              {/* 上传进度 */}
              {uploadProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{uploadStatus}</span>
                    <span className="font-medium">{uploadProgress.percentage}%</span>
                  </div>
                  <Progress value={uploadProgress.percentage} className="h-2" />
                  <p className="text-xs text-gray-500">
                    {formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="releaseNotes">更新说明</Label>
                <Textarea
                  id="releaseNotes"
                  name="releaseNotes"
                  placeholder="本次更新内容..."
                  rows={3}
                  disabled={formLoading}
                />
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="isActive"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    disabled={formLoading}
                  />
                  <Label htmlFor="isActive">立即启用</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="isMandatory"
                    checked={isMandatory}
                    onCheckedChange={setIsMandatory}
                    disabled={formLoading}
                  />
                  <Label htmlFor="isMandatory">强制更新</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setFormError(null);
                  setUploadProgress(null);
                  setUploadStatus("");
                }}
                disabled={formLoading}
              >
                取消
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? (
                  <>
                    <Upload className="w-4 h-4 mr-2 animate-pulse" />
                    {uploadStatus || "处理中..."}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    创建
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
