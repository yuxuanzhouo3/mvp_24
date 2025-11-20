"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 腾讯云 CloudBase 登录组件示例
 * 遵循腾讯云官方推荐的登录流程
 */
export default function CloudBaseLoginExample() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 检查登录状态
  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await auth.getUser();

      if (error) {
        console.error("获取用户信息失败:", error);
        setUser(null);
      } else {
        setUser(data.user);
      }
    } catch (err) {
      console.error("检查认证状态失败:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // 登录处理
  const handleLogin = async () => {
    try {
      // 使用腾讯云官方登录流程
      await auth.toDefaultLoginPage?.();
    } catch (error) {
      console.error("跳转登录页面失败:", error);
      alert("登录失败，请稍后重试");
    }
  };

  // 登出处理
  const handleLogout = async () => {
    try {
      const { error } = await auth.signOut();
      if (error) {
        console.error("登出失败:", error);
        alert("登出失败");
      } else {
        setUser(null);
        alert("已成功登出");
      }
    } catch (err) {
      console.error("登出错误:", err);
      alert("登出失败");
    }
  };

  // 组件挂载时检查登录状态
  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <p className="text-center">加载中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">腾讯云 CloudBase 登录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {user ? (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-medium">欢迎回来！</p>
              <p className="text-sm text-gray-600">用户ID: {user.id}</p>
              {user.name && (
                <p className="text-sm text-gray-600">昵称: {user.name}</p>
              )}
            </div>
            <Button onClick={handleLogout} variant="outline" className="w-full">
              登出
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-gray-600">
              点击下方按钮将跳转到腾讯云官方登录页面
            </p>
            <Button onClick={handleLogin} className="w-full">
              去腾讯云登录
            </Button>
            <p className="text-xs text-gray-500 text-center">
              登录后将自动返回此页面
            </p>
          </div>
        )}

        <div className="pt-4 border-t">
          <Button
            onClick={checkAuthStatus}
            variant="ghost"
            size="sm"
            className="w-full"
          >
            刷新状态
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
