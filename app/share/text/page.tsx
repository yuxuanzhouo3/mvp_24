"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Home } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/markdown-renderer";

function decodeBase64Url(input: string): string {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function ShareTextContent() {
  const params = useSearchParams();
  const raw = params.get("d") || "";

  const content = useMemo(() => decodeBase64Url(raw), [raw]);
  const hasContent = content.trim().length > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">分享的 AI 对话</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!hasContent) return;
                  navigator.clipboard.writeText(content);
                  toast.success("已复制内容");
                }}
              >
                <Copy className="w-4 h-4 mr-1" />复制
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/">
                  <Home className="w-4 h-4 mr-1" />返回首页
                </Link>
              </Button>
            </div>
          </div>

          {hasContent ? (
            <div className="prose prose-sm sm:prose max-w-none">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">分享内容无效或已损坏。</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ShareTextPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
          <div className="max-w-3xl mx-auto">
            <Card className="p-4 sm:p-6 text-sm text-gray-500">加载分享内容中...</Card>
          </div>
        </div>
      }
    >
      <ShareTextContent />
    </Suspense>
  );
}
