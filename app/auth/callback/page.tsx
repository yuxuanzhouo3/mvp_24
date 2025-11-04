"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 保留debug等参数
  const buildUrl = (path: string) => {
    const debug = searchParams.get("debug");
    if (debug) {
      return `${path}?debug=${debug}`;
    }
    return path;
  };

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // 处理OAuth回调
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("认证回调错误:", sessionError);
          setError(sessionError.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          console.log("认证成功，跳转到首页");
          // 等待user-context更新后跳转
          router.replace(buildUrl("/"));
        } else {
          console.log("没有找到有效的session");
          setError("认证失败，请重试");
          setLoading(false);
        }
      } catch (err) {
        console.error("处理认证回调时出错:", err);
        setError("处理认证回调时出错");
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-center text-gray-600">正在处理认证...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">认证结果</CardTitle>
          <CardDescription className="text-center">
            {error ? "认证过程中出现问题" : "认证完成"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertDescription>认证成功！正在跳转...</AlertDescription>
            </Alert>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => router.push(buildUrl("/auth"))}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              返回登录页面
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-center text-gray-600">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
