"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAuthClient } from "@/lib/auth/client";
import { isChinaRegion } from "@/lib/config/region";
import { saveAuthState } from "@/lib/auth-state-manager";
import {
  extractWechatAuthResponse,
  getSavedWechatState,
  validateWechatState,
  clearWechatState,
} from "@/lib/wechat/oauth";
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
        // 检查是否是微信回调
        const wechatResponse = extractWechatAuthResponse(
          new URLSearchParams(searchParams)
        );

        if (wechatResponse.code || wechatResponse.error) {
          // 微信登录回调
          await handleWechatCallback(wechatResponse);
        } else {
          // Supabase OAuth 回调
          await handleSupabaseCallback();
        }
      } catch (err) {
        console.error("处理认证回调时出错:", err);
        setError(err instanceof Error ? err.message : "处理认证回调时出错");
        setLoading(false);
      }
    };

    const handleWechatCallback = async (response: any) => {
      // 验证状态值防止 CSRF 攻击
      const savedState = getSavedWechatState();
      if (!validateWechatState(response.state, savedState)) {
        console.error("微信授权状态验证失败");
        setError("安全验证失败，请重试");
        setLoading(false);
        return;
      }

      // 清除保存的状态
      clearWechatState();

      if (response.error) {
        console.error("微信授权错误:", response.error_description);
        setError(`微信授权失败: ${response.error_description}`);
        setLoading(false);
        return;
      }

      if (!response.code) {
        console.error("未获取到授权码");
        setError("未获取到授权码，请重试");
        setLoading(false);
        return;
      }

      // 将授权码发送到后端进行登录
      try {
        const loginResponse = await fetch("/api/auth/wechat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: response.code,
          }),
        });

        if (!loginResponse.ok) {
          const errorData = await loginResponse.json();
          setError(errorData.details || errorData.error || "微信登录失败");
          setLoading(false);
          return;
        }

        const loginData = await loginResponse.json();
        console.log("微信登录成功:", loginData);

        // ✅ 核心修复：保存认证状态到 localStorage
        if (loginData.success && loginData.accessToken && loginData.refreshToken) {
          // 保存 token 和用户信息到 localStorage
          saveAuthState(
            loginData.accessToken,
            loginData.refreshToken,
            {
              id: loginData.user.id,
              email: loginData.user.email,
              name: loginData.user.name,
              avatar: loginData.user.avatar,
            },
            {
              accessTokenExpiresIn: loginData.tokenMeta?.accessTokenExpiresIn || 3600,
              refreshTokenExpiresIn: loginData.tokenMeta?.refreshTokenExpiresIn || 604800,
            }
          );
          console.log("✅ 认证状态已保存到 localStorage");
        }

        // 等待 user-context 更新后跳转
        setTimeout(() => {
          router.replace(buildUrl("/"));
        }, 500);
      } catch (err) {
        console.error("微信登录请求失败:", err);
        setError(err instanceof Error ? err.message : "微信登录请求失败");
        setLoading(false);
      }
    };

    const handleSupabaseCallback = async () => {
      // 处理OAuth回调
      const sessionResult = await getAuthClient().getSession();

      if (sessionResult.error) {
        console.error("认证回调错误:", sessionResult.error);
        setError(sessionResult.error.message);
        setLoading(false);
        return;
      }

      if (sessionResult.data.session) {
        console.log("认证成功，跳转到首页");
        // 等待user-context更新后跳转
        router.replace(buildUrl("/"));
      } else {
        console.log("没有找到有效的session");
        setError("认证失败，请重试");
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
