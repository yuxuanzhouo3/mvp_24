"use client";

import { useState, useEffect, useRef } from "react";
import {
  listAdvertisements,
  createAdvertisementWithUrl,
  updateAdvertisement,
  deleteAdvertisement,
  toggleAdvertisementStatus,
  Advertisement,
  AdPosition,
} from "@/actions/admin-ads";
import {
  uploadToStorage,
  UploadProgress,
} from "@/lib/admin/client-upload";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Video,
  Search,
  RefreshCw,
} from "lucide-react";

const POSITIONS: { value: AdPosition; label: string }[] = [
  { value: "top", label: "顶部横幅" },
  { value: "bottom", label: "底部横幅" },
  { value: "left", label: "输入框左侧" },
  { value: "right", label: "输入框右侧" },
  { value: "bottom-left", label: "底部左侧" },
  { value: "bottom-right", label: "底部右侧" },
  { value: "sidebar", label: "侧边栏" },
];

export default function AdsPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 对话框状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Advertisement | null>(null);

  // 表单状态
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // 搜索和筛选
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // 文件预览
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载广告列表
  async function loadAds() {
    setLoading(true);
    setError(null);
    const result = await listAdvertisements();
    if (result.success) {
      const normalized = (result.data || []).map((ad) => ({
        ...ad,
        id: ad.id || (ad as any)._id || (ad as any)._ID || (ad as any).docId,
      }));
      console.log("[loadAds] Loaded ads:", normalized.map(a => ({ id: a.id, title: a.title, is_active: a.is_active })));
      setAds(normalized);
    } else {
      setError(result.error || "加载失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAds();
  }, []);

  // 创建广告
  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    setUploadProgress(null);
    setUploadStatus("");

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const position = formData.get("position") as AdPosition;
    const mediaType = formData.get("mediaType") as "image" | "video";
    const targetUrl = formData.get("targetUrl") as string;
    const priority = parseInt(formData.get("priority") as string) || 0;
    const isActive = formData.get("isActive") === "true";
    const file = formData.get("file") as File;

    if (!title || !position || !mediaType) {
      setFormError("请填写必要字段");
      setFormLoading(false);
      return;
    }

    if (!file || file.size === 0) {
      setFormError("请上传媒体文件");
      setFormLoading(false);
      return;
    }

    try {
      // 生成唯一文件名
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      // 客户端直传文件
      setUploadStatus("正在上传文件...");
      const uploadResult = await uploadToStorage(
        file,
        "ads",
        fileName,
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

      // 创建广告记录
      setUploadStatus("正在创建广告...");
      const result = await createAdvertisementWithUrl({
        title,
        position,
        mediaType,
        mediaUrl: uploadResult.url!,
        targetUrl: targetUrl || undefined,
        priority,
        isActive,
        fileSize: uploadResult.fileSize!,
      });

      if (result.success) {
        setCreateDialogOpen(false);
        setPreviewUrl(null);
        setUploadProgress(null);
        setUploadStatus("");
        loadAds();
      } else {
        setFormError(result.error || "创建失败");
      }
    } catch (err) {
      console.error("Create advertisement error:", err);
      setFormError("创建失败，请重试");
    }

    setFormLoading(false);
  }

  // 更新广告
  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedAd) return;

    setFormLoading(true);
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const result = await updateAdvertisement(selectedAd.id, formData);

    if (result.success) {
      setEditDialogOpen(false);
      setSelectedAd(null);
      loadAds();
    } else {
      setFormError(result.error || "更新失败");
    }
    setFormLoading(false);
  }

  // 删除广告
  async function handleDelete() {
    if (!selectedAd) return;

    setFormLoading(true);
    const result = await deleteAdvertisement(selectedAd.id);

    if (result.success) {
      setDeleteDialogOpen(false);
      setSelectedAd(null);
      loadAds();
    } else {
      setFormError(result.error || "删除失败");
    }
    setFormLoading(false);
  }

  // 切换状态
  async function handleToggleStatus(ad: Advertisement) {
    const adId = ad.id || (ad as any)._id || (ad as any)._ID || (ad as any).docId;
    if (!adId) {
      setError("广告ID缺失，无法切换状态");
      return;
    }
    setTogglingId(adId);
    setError(null);
    try {
      const result = await toggleAdvertisementStatus(adId, !ad.is_active);
      if (result.success) {
        await loadAds();
      } else {
        setError(result.error || "切换状态失败");
      }
    } catch (err) {
      console.error("Toggle status error:", err);
      setError("切换状态失败，请重试");
    } finally {
      setTogglingId(null);
    }
  }

  // 文件选择预览
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }

  // 筛选广告
  const filteredAds = ads.filter((ad) => {
    if (searchTerm && !ad.title.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterPosition !== "all" && ad.position !== filterPosition) {
      return false;
    }
    if (filterStatus === "active" && !ad.is_active) {
      return false;
    }
    if (filterStatus === "inactive" && ad.is_active) {
      return false;
    }
    return true;
  });

  // 格式化文件大小
  function formatFileSize(bytes?: number): string {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">广告管理</h1>
          <p className="text-gray-500">管理首页展示的广告内容</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新建广告
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索广告标题..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterPosition} onValueChange={setFilterPosition}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="位置筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部位置</SelectItem>
                {POSITIONS.map((pos) => (
                  <SelectItem key={pos.value} value={pos.value}>
                    {pos.label}
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
                <SelectItem value="active">已上架</SelectItem>
                <SelectItem value="inactive">已下架</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadAds}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 广告列表 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredAds.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchTerm || filterPosition !== "all" || filterStatus !== "all"
                ? "没有找到匹配的广告"
                : "暂无广告，点击上方按钮创建"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>预览</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>位置</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAds.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell>
                      <div className="w-16 h-12 bg-gray-100 rounded overflow-hidden">
                        {ad.media_type === "image" ? (
                          <img
                            src={ad.media_url}
                            alt={ad.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{ad.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {POSITIONS.find((p) => p.value === ad.position)?.label || ad.position}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ad.media_type === "image" ? "图片" : "视频"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(ad.file_size)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ad.source === "both"
                            ? "default"
                            : ad.source === "supabase"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {ad.source === "both"
                          ? "双端"
                          : ad.source === "supabase"
                          ? "国际版"
                          : "国内版"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={ad.is_active}
                        disabled={togglingId === ad.id}
                        onCheckedChange={() => handleToggleStatus(ad)}
                      />
                    </TableCell>
                    <TableCell>{ad.priority}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedAd(ad);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedAd(ad);
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
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建广告</DialogTitle>
            <DialogDescription>创建一个新的广告内容</DialogDescription>
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
                  <Label htmlFor="title">广告标题 *</Label>
                  <Input id="title" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">展示位置 *</Label>
                  <Select name="position" defaultValue="top">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((pos) => (
                        <SelectItem key={pos.value} value={pos.value}>
                          {pos.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mediaType">媒体类型 *</Label>
                  <Select name="mediaType" defaultValue="image">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">图片</SelectItem>
                      <SelectItem value="video">视频</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">媒体文件 *</Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  name="file"
                  type="file"
                  accept="image/*,video/*"
                  required
                  onChange={handleFileChange}
                />
                {previewUrl && (
                  <div className="mt-2 w-full h-40 bg-gray-100 rounded overflow-hidden">
                    <img
                      src={previewUrl}
                      alt="预览"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
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
                <Label htmlFor="targetUrl">跳转链接</Label>
                <Input
                  id="targetUrl"
                  name="targetUrl"
                  type="url"
                  placeholder="https://example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">优先级</Label>
                  <Input
                    id="priority"
                    name="priority"
                    type="number"
                    defaultValue="0"
                    min="0"
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2">
                    <Switch id="isActive" name="isActive" defaultChecked />
                    <Label htmlFor="isActive">立即上架</Label>
                  </div>
                  <input type="hidden" name="isActive" value="true" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setPreviewUrl(null);
                  setFormError(null);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑广告</DialogTitle>
            <DialogDescription>修改广告信息（不可更换媒体文件）</DialogDescription>
          </DialogHeader>
          {selectedAd && (
            <form onSubmit={handleUpdate}>
              <div className="grid gap-4 py-4">
                {formError && (
                  <Alert variant="destructive">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-title">广告标题</Label>
                  <Input
                    id="edit-title"
                    name="title"
                    defaultValue={selectedAd.title}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-targetUrl">跳转链接</Label>
                  <Input
                    id="edit-targetUrl"
                    name="targetUrl"
                    type="url"
                    defaultValue={selectedAd.target_url || ""}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-priority">优先级</Label>
                    <Input
                      id="edit-priority"
                      name="priority"
                      type="number"
                      defaultValue={selectedAd.priority}
                      min="0"
                    />
                  </div>
                  <div className="space-y-2 flex items-end">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="edit-isActive"
                        name="isActive"
                        defaultChecked={selectedAd.is_active}
                      />
                      <Label htmlFor="edit-isActive">上架状态</Label>
                    </div>
                    <input
                      type="hidden"
                      name="isActive"
                      value={selectedAd.is_active ? "true" : "false"}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setSelectedAd(null);
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
              确定要删除广告 "{selectedAd?.title}" 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSelectedAd(null);
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
