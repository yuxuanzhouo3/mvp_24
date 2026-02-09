'use client'

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createAd } from "@/app/admin/actions"
import { toast } from "sonner"

export function CreateAdDialog({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    slotKey: "",
    title: "",
    imageUrl: "",
    linkUrl: "",
    isActive: true,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)

    const result = await createAd({
      slotKey: formData.slotKey.trim(),
      title: formData.title.trim(),
      imageUrl: formData.imageUrl.trim() || undefined,
      linkUrl: formData.linkUrl.trim() || undefined,
      isActive: formData.isActive,
    })

    setIsLoading(false)

    if (result.success) {
      toast.success("广告位创建成功")
      setOpen(false)
      setFormData({ slotKey: "", title: "", imageUrl: "", linkUrl: "", isActive: true })
    } else {
      toast.error("创建失败: " + result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          新建广告位
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>新建广告位</DialogTitle>
          <DialogDescription>用于在指定位置展示图片广告（可选链接）。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slotKey" className="text-right">
                广告位标识
              </Label>
              <Input
                id="slotKey"
                value={formData.slotKey}
                onChange={(e) => setFormData({ ...formData, slotKey: e.target.value })}
                placeholder="例如: home_top"
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">
                标题
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如: 新年活动"
                className="col-span-3"
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="imageUrl" className="text-right">
                图片URL
              </Label>
              <Input
                id="imageUrl"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="https://..."
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="linkUrl" className="text-right">
                跳转URL
              </Label>
              <Input
                id="linkUrl"
                value={formData.linkUrl}
                onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                placeholder="https://..."
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <div className="text-right text-sm font-medium">启用</div>
              <div className="col-span-3 flex items-center gap-3">
                <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
                <span className="text-sm text-muted-foreground">{formData.isActive ? "已启用" : "已停用"}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "创建中..." : "创建广告位"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

