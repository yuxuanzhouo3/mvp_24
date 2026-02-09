'use client'

import { useState } from "react"
import { Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deleteAd, setAdActive } from "@/app/admin/actions"
import { toast } from "sonner"
import { EditAdDialog, type EditableAd } from "./edit-ad-dialog"

export function AdActions({ ad }: { ad: EditableAd }) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isActive, setIsActive] = useState(ad.isActive)

  async function handleToggle(next: boolean) {
    setIsActive(next)
    const result = await setAdActive(ad.id, next)
    if (result.success) {
      toast.success(next ? "已启用" : "已停用")
    } else {
      toast.error("更新失败: " + result.error)
      setIsActive(!next)
    }
  }

  async function handleDelete() {
    setIsLoading(true)
    const result = await deleteAd(ad.id)
    setIsLoading(false)
    setOpen(false)

    if (result.success) {
      toast.success("广告位已删除")
    } else {
      toast.error("删除失败: " + result.error)
    }
  }

  return (
    <div className="flex justify-end items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{isActive ? "启用" : "停用"}</span>
        <Switch checked={isActive} onCheckedChange={handleToggle} />
      </div>

      <EditAdDialog
        ad={{ ...ad, isActive }}
        onSaved={(next) => {
          setIsActive(next.isActive)
        }}
      />

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash className="h-4 w-4 mr-2" />
            删除
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除此广告位？</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={isLoading}
            >
              {isLoading ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
