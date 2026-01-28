"use client";

import { useState, useEffect } from "react";
import { listStorageFiles, deleteStorageFile, StorageFile } from "@/actions/admin-ads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  ExternalLink,
  Image as ImageIcon,
  File,
  HardDrive,
  Cloud,
} from "lucide-react";

export default function FilesPage() {
  const [supabaseFiles, setSupabaseFiles] = useState<StorageFile[]>([]);
  const [cloudbaseFiles, setCloudbaseFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  async function loadFiles() {
    setLoading(true);
    setError(null);
    const result = await listStorageFiles();
    if (result.success) {
      setSupabaseFiles(result.supabaseFiles || []);
      setCloudbaseFiles(result.cloudbaseFiles || []);
    } else {
      setError(result.error || "加载失败");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFiles();
  }, []);

  async function handleDelete() {
    if (!selectedFile) return;

    setDeleting(true);
    const result = await deleteStorageFile(
      selectedFile.name,
      selectedFile.source,
      selectedFile.fileId
    );

    if (result.success) {
      setDeleteDialogOpen(false);
      setSelectedFile(null);
      loadFiles();
    } else {
      setError(result.error || "删除失败");
    }
    setDeleting(false);
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function isImageFile(name: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
  }

  const filteredSupabaseFiles = supabaseFiles.filter((file) =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCloudbaseFiles = cloudbaseFiles.filter((file) =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSupabaseSize = supabaseFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  const totalCloudbaseSize = cloudbaseFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文件管理</h1>
          <p className="text-gray-500">管理存储桶中的所有文件</p>
        </div>
        <Button variant="outline" onClick={loadFiles}>
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Supabase 存储</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{supabaseFiles.length} 个文件</div>
            <p className="text-xs text-muted-foreground">
              总大小: {formatFileSize(totalSupabaseSize)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CloudBase 存储</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cloudbaseFiles.length} 个文件</div>
            <p className="text-xs text-muted-foreground">
              总大小: {formatFileSize(totalCloudbaseSize)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 搜索 */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索文件名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 文件列表 */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="supabase">
            <div className="border-b px-4">
              <TabsList className="h-12">
                <TabsTrigger value="supabase" className="gap-2">
                  <Cloud className="w-4 h-4" />
                  Supabase ({filteredSupabaseFiles.length})
                </TabsTrigger>
                <TabsTrigger value="cloudbase" className="gap-2">
                  <HardDrive className="w-4 h-4" />
                  CloudBase ({filteredCloudbaseFiles.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="supabase" className="m-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : filteredSupabaseFiles.length === 0 ? (
                <div className="text-center py-12 text-gray-500">暂无文件</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>预览</TableHead>
                      <TableHead>文件名</TableHead>
                      <TableHead>大小</TableHead>
                      <TableHead>修改时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSupabaseFiles.map((file) => (
                      <TableRow key={file.name}>
                        <TableCell>
                          <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                            {isImageFile(file.name) ? (
                              <img
                                src={file.url}
                                alt={file.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <File className="w-6 h-6 text-gray-400" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {file.name}
                        </TableCell>
                        <TableCell>{formatFileSize(file.size)}</TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {file.lastModified
                            ? new Date(file.lastModified).toLocaleString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" asChild>
                              <a href={file.url} target="_blank" rel="noopener">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedFile(file);
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
            </TabsContent>

            <TabsContent value="cloudbase" className="m-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : filteredCloudbaseFiles.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  暂无文件（或 CloudBase 未配置）
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件名</TableHead>
                      <TableHead>大小</TableHead>
                      <TableHead>File ID</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCloudbaseFiles.map((file) => (
                      <TableRow key={file.fileId || file.name}>
                        <TableCell className="font-medium">{file.name}</TableCell>
                        <TableCell>{formatFileSize(file.size)}</TableCell>
                        <TableCell className="text-gray-500 text-sm max-w-[200px] truncate">
                          {file.fileId}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedFile(file);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除文件 "{selectedFile?.name}" 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedFile(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={deleting}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
