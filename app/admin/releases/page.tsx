"use client";

import { useState, useEffect, useRef } from "react";
import {
  listReleases,
  createReleaseWithUrl,
  createRelease,
  updateRelease,
  deleteRelease,
  toggleReleaseStatus,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  Download,
  Apple,
  Smartphone,
  Monitor,
  Upload,
} from "lucide-react";

const PLATFORMS: { value: Platform; label: string; icon: React.ReactNode }[] = [
  { value: "ios", label: "iOS", icon: <Apple className="w-4 h-4" /> },
  { value: "android", label: "Android", icon: <Smartphone className="w-4 h-4" /> },
  { value: "windows", label: "Windows", icon: <Monitor className="w-4 h-4" /> },
  { value: "macos", label: "macOS", icon: <Apple className="w-4 h-4" /> },
  { value: "linux", label: "Linux", icon: <Monitor className="w-4 h-4" /> },
];

const UPLOAD_TARGETS = [
  { value: "supabase", label: "国际版 (Supabase)" },
  { value: "cloudbase", label: "国内版 (CloudBase)" },
  { value: "both", label: "双端同步" },
];

export default function ReleasesPage() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<AppRelease | null>(null);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
        uploadTarget: uploadTarget as "supabase" | "both",
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
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedRelease) return;

    setFormLoading(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const result = await updateRelease(selectedRelease.id, formData);

    if (result.success) {
      setEditDialogOpen(false);
      setSelectedRelease(null);
      loadReleases();
    } else {
      setFormError(result.error || "更新失败");
    }
    setFormLoading(false);
  }

  async function handleDelete() {
    if (!selectedRelease) return;

    setFormLoading(true);
    const result = await deleteRelease(selectedRelease.id);

    if (result.success) {
      setDeleteDialogOpen(false);
      setSelectedRelease(null);
      loadReleases();
    } else {
      setFormError(result.error || "删除失败");
    }
    setFormLoading(false);
  }

  async function handleToggleStatus(release: AppRelease) {
    const result = await toggleReleaseStatus(release.id, !release.is_active);
    if (result.success) {
      loadReleases();
    }
  }

  const filteredReleases = releases.filter((release) => {
    if (searchTerm && !release.version.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterPlatform !== "all" && release.platform !== filterPlatform) {
      return false;
    }
    if (filterStatus === "active" && !release.is_active) {
      return false;
    }
    if (filterStatus === "inactive" && release.is_active) {
      return false;
    }
    return true;
  });

  function formatFileSize(bytes?: number | null): string {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function getPlatformIcon(platform: Platform) {
    const p = PLATFORMS.find((p) => p.value === platform);
    return p?.icon || <Monitor className="w-4 h-4" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">发布版本</h1>
          <p className="text-gray-500">管理应用各平台的发布版本</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新建版本
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索版本号..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="平台筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">已启用</SelectItem>
                <SelectItem value="inactive">已禁用</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadReleases}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
          </div>
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
          ) : filteredReleases.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              暂无版本，点击上方按钮创建
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台</TableHead>
                  <TableHead>版本号</TableHead>
                  <TableHead>文件大小</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>强制更新</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReleases.map((release) => (
                  <TableRow key={release.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(release.platform)}
                        <span>
                          {PLATFORMS.find((p) => p.value === release.platform)?.label}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      v{release.version}
                    </TableCell>
                    <TableCell>{formatFileSize(release.file_size)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          release.source === "both"
                            ? "default"
                            : release.source === "supabase"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {release.source === "both"
                          ? "双端"
                          : release.source === "supabase"
                          ? "国际版"
                          : "国内版"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={release.is_mandatory ? "destructive" : "secondary"}>
                        {release.is_mandatory ? "是" : "否"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={release.is_active}
                        onCheckedChange={() => handleToggleStatus(release)}
                      />
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(release.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a href={release.file_url} target="_blank" rel="noopener">
                            <Download className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedRelease(release);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedRelease(release);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
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

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑版本</DialogTitle>
            <DialogDescription>修改版本信息</DialogDescription>
          </DialogHeader>
          {selectedRelease && (
            <form onSubmit={handleUpdate}>
              <div className="grid gap-4 py-4">
                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-releaseNotes">更新说明</Label>
                  <Textarea
                    id="edit-releaseNotes"
                    name="releaseNotes"
                    defaultValue={selectedRelease.release_notes || ""}
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <input
                      type="hidden"
                      name="isActive"
                      id="edit-isActive-hidden"
                      defaultValue={selectedRelease.is_active ? "true" : "false"}
                    />
                    <Switch
                      id="edit-isActive"
                      defaultChecked={selectedRelease.is_active}
                      onCheckedChange={(checked) => {
                        const input = document.getElementById("edit-isActive-hidden") as HTMLInputElement;
                        if (input) input.value = checked ? "true" : "false";
                      }}
                    />
                    <Label htmlFor="edit-isActive">启用状态</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="hidden"
                      name="isMandatory"
                      id="edit-isMandatory-hidden"
                      defaultValue={selectedRelease.is_mandatory ? "true" : "false"}
                    />
                    <Switch
                      id="edit-isMandatory"
                      defaultChecked={selectedRelease.is_mandatory}
                      onCheckedChange={(checked) => {
                        const input = document.getElementById("edit-isMandatory-hidden") as HTMLInputElement;
                        if (input) input.value = checked ? "true" : "false";
                      }}
                    />
                    <Label htmlFor="edit-isMandatory">强制更新</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setSelectedRelease(null);
                    setFormError(null);
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={formLoading}>
                  {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  保存
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除版本 v{selectedRelease?.version} ({selectedRelease?.platform}) 吗？
              此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSelectedRelease(null);
                setFormError(null);
              }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={formLoading}
            >
              {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
