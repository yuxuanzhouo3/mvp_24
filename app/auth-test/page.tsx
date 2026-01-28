"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthTestPage() {
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        setAuthStatus({ error: error.message });
      } else {
        setAuthStatus({
          hasSession: !!session,
          userId: session?.user?.id || null,
          email: session?.user?.email || null,
          expiresAt: session?.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : null,
          accessToken: session?.access_token ? "present" : "missing",
          refreshToken: session?.refresh_token ? "present" : "missing",
        });
      }
    } catch (err) {
      setAuthStatus({
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const testSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: "test@example.com",
        password: "testpassword",
      });
      if (error) {
        alert("Login failed: " + error.message);
      } else {
        alert("Login successful!");
        checkAuthStatus();
      }
    } catch (err) {
      alert(
        "Login error: " + (err instanceof Error ? err.message : "Unknown error")
      );
    }
  };

  const testSignOut = async () => {
    try {
      await supabase.auth.signOut();
      alert("Signed out successfully!");
      checkAuthStatus();
    } catch (err) {
      alert(
        "Sign out error: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    }
  };

  useEffect(() => {
    checkAuthStatus();

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, session?.user?.id);
      checkAuthStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">认证状态测试</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>认证状态</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p>加载中...</p>
              ) : (
                <pre className="text-sm bg-gray-100 p-4 rounded overflow-auto">
                  {JSON.stringify(authStatus, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>测试操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={checkAuthStatus} className="w-full">
                刷新状态
              </Button>
              <Button onClick={testSignIn} variant="outline" className="w-full">
                测试登录 (test@example.com)
              </Button>
              <Button
                onClick={testSignOut}
                variant="destructive"
                className="w-full"
              >
                登出
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>localStorage 检查</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p>
                <strong>Supabase auth token:</strong>
              </p>
              <pre className="text-sm bg-gray-100 p-2 rounded">
                {typeof window !== "undefined"
                  ? localStorage.getItem("supabase.auth.token") || "null"
                  : "N/A"}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
