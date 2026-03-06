"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Home, LogIn, UserPlus } from "lucide-react";
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
  const id = params.get("id") || "";
  const raw = params.get("d") || "";
  const ref = params.get("ref") || "";

  const [fetchedContent, setFetchedContent] = useState("");
  const [fetchedShareCode, setFetchedShareCode] = useState("");
  const [isLoadingById, setIsLoadingById] = useState(false);

  useEffect(() => {
    if (!id) {
      setFetchedContent("");
      setFetchedShareCode("");
      setIsLoadingById(false);
      return;
    }

    let cancelled = false;
    setIsLoadingById(true);

    fetch(`/api/share/text?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return { content: "", shareCode: "" };
        }
        const json = (await response.json()) as {
          content?: unknown;
          shareCode?: unknown;
        };
        return {
          content: typeof json?.content === "string" ? json.content : "",
          shareCode: typeof json?.shareCode === "string" ? json.shareCode : "",
        };
      })
      .catch(() => ({ content: "", shareCode: "" }))
      .then((payload) => {
        if (cancelled) return;
        setFetchedContent(payload.content || "");
        setFetchedShareCode(payload.shareCode || "");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingById(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const legacyContent = useMemo(() => decodeBase64Url(raw), [raw]);
  const content = id ? fetchedContent : legacyContent;
  const shareCode = id ? fetchedShareCode || ref : ref;
  const hasContent = content.trim().length > 0;
  const signInTarget = "/auth";
  const signUpTarget = "/auth?mode=signup";
  const signInHref =
    shareCode && id
      ? `/r/${encodeURIComponent(shareCode)}?source=share_text&to=${encodeURIComponent(
          signInTarget
        )}`
      : signInTarget;
  const signUpHref =
    shareCode && id
      ? `/r/${encodeURIComponent(shareCode)}?source=share_text&to=${encodeURIComponent(
          signUpTarget
        )}`
      : signUpTarget;

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

          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <Link href={signInHref}>
                  <LogIn className="mr-1 h-4 w-4" />
                  直接登录
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={signUpHref}>
                  <UserPlus className="mr-1 h-4 w-4" />
                  注册领取体验
                </Link>
              </Button>
            </div>
            <p className="mt-2 text-xs text-blue-700">
              通过本页入口注册将自动关联邀请关系。
            </p>
          </div>

          {isLoadingById ? (
            <p className="text-sm text-gray-500">加载分享内容中...</p>
          ) : hasContent ? (
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
