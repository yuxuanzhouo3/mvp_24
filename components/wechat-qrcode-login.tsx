"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * 微信二维码登录组件
 * 显示微信登录二维码，用户扫描后自动跳转
 */
export function WechatQrcodeLogin({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 获取微信二维码 URL
  const fetchQrcodeUrl = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/auth/cloudbase-wechat/qrcode");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to get WeChat QR code"
        );
      }

      const data = await response.json();
      setQrcodeUrl(data.qrcodeUrl);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load QR code";
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // 刷新二维码
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchQrcodeUrl();
    setRefreshing(false);
  };

  // 组件挂载时获取二维码
  useEffect(() => {
    fetchQrcodeUrl();
  }, []);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-center text-gray-600">加载微信二维码...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="w-full"
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                重新加载...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                重新加载
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!qrcodeUrl) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertDescription>无法获取微信登录二维码</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-center">微信扫码登录</CardTitle>
        <CardDescription className="text-center">
          使用微信扫描二维码快速登录
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        {/* 微信二维码 - 通过 iframe 加载 */}
        <div className="w-64 h-64 flex items-center justify-center bg-gray-100 rounded-lg border-2 border-gray-300">
          {/*
            注意：这里我们使用微信官方的二维码扫描页面
            如果需要在页面内显示静态二维码，需要后端生成二维码图片
            当前通过点击按钮跳转到微信 OAuth 页面
          */}
          <div className="text-center">
            <p className="text-gray-600 mb-4">点击下方按钮进行微信扫码登录</p>
            <Button
              onClick={() => {
                // 跳转到微信 OAuth 页面
                if (qrcodeUrl) {
                  window.location.href = qrcodeUrl;
                }
              }}
              className="w-full"
            >
              打开微信扫码登录
            </Button>
          </div>
        </div>

        <p className="text-sm text-gray-500 text-center">
          二维码 5 分钟后过期，请及时扫描
        </p>

        <Button
          onClick={handleRefresh}
          variant="outline"
          className="w-full"
          disabled={refreshing}
        >
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              刷新中...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新二维码
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
