"use client";

import { useEffect, useState } from "react";
import { useAuthConfig } from "@/lib/hooks/useAuthConfig";

/**
 * 腾讯云 CloudBase 官方登录示例页面
 * 支持微信登录和邮箱登录
 */
export default function OfficialCloudBaseLogin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cloudbaseApp, setCloudbaseApp] = useState<any>(null);
  const [loginMethod, setLoginMethod] = useState<"wechat" | "email">("wechat");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // 从API端点读取配置
  const { config } = useAuthConfig();
  const wechatAppId = config.wechatAppId || "";
  const wechatCloudbaseId = config.wechatCloudbaseId || "";

  // 初始化 CloudBase SDK
  useEffect(() => {
    const initCloudBase = async () => {
      try {
        // 动态导入 CloudBase JS SDK
        const cloudbase = await import("@cloudbase/js-sdk");

        // 验证必需的配置
        if (!wechatCloudbaseId) {
          console.error(
            "❌ Missing NEXT_PUBLIC_WECHAT_CLOUDBASE_ID. Please configure it in your deployment platform."
          );
          setLoading(false);
          return;
        }

        // 初始化 SDK
        const app = cloudbase.default.init({
          env: wechatCloudbaseId,
        });

        // 挂载到 window 对象（可选）
        if (typeof window !== "undefined") {
          (window as any).app = app;
        }

        setCloudbaseApp(app);

        // 检查是否有微信登录回调结果
        await checkRedirectResult(app);

        // 检查当前登录状态
        await checkLoginStatus(app);
      } catch (error) {
        console.error("初始化 CloudBase SDK 失败:", error);
      } finally {
        setLoading(false);
      }
    };

    initCloudBase();
  }, [wechatCloudbaseId]);

  // 检查登录状态
  const checkLoginStatus = async (app: any) => {
    try {
      const auth = app.auth();
      const loginState = await auth.getLoginState();

      if (loginState && !loginState.isAnonymousAuth) {
        setIsLoggedIn(true);
        setUserInfo(loginState.user);
      } else {
        setIsLoggedIn(false);
        setUserInfo(null);
      }
    } catch (error) {
      console.error("检查登录状态失败:", error);
      setIsLoggedIn(false);
      setUserInfo(null);
    }
  };

  // 检查微信登录回调结果
  const checkRedirectResult = async (app: any) => {
    try {
      const auth = app.auth();
      const provider = auth.weixinAuthProvider({
        appid: wechatAppId,
        scope: "snsapi_base",
      });

      const loginState = await provider.getRedirectResult();
      if (loginState) {
        setIsLoggedIn(true);
        setUserInfo(loginState.user);
        console.log("从微信回调登录成功");
      }
    } catch (error: any) {
      // 忽略错误，可能是正常情况（没有回调参数）
      console.log("检查回调结果:", error?.message || error);
    }
  };

  // 微信登录处理
  const handleWechatLogin = async () => {
    if (!cloudbaseApp) {
      alert("CloudBase SDK 未初始化");
      return;
    }

    try {
      const auth = cloudbaseApp.auth();

      // 检查是否从微信回调返回
      const provider = auth.weixinAuthProvider({
        appid: wechatAppId,
        scope: "snsapi_base",
      });

      // 先检查是否有重定向结果
      provider
        .getRedirectResult()
        .then((loginState: any) => {
          if (loginState) {
            // 有登录结果，直接设置登录状态
            setIsLoggedIn(true);
            setUserInfo(loginState.user);
            alert("登录成功！");
          } else {
            // 没有登录结果，跳转到微信登录
            provider.signInWithRedirect();
          }
        })
        .catch((error: any) => {
          console.error("获取重定向结果失败:", error);
          // 如果获取失败，尝试跳转登录
          provider.signInWithRedirect();
        });
    } catch (error) {
      console.error("跳转登录页面失败:", error);
      alert("跳转登录页面失败，请查看控制台错误信息");
    }
  };

  // 邮箱登录处理
  const handleEmailLogin = async () => {
    if (!cloudbaseApp) {
      alert("CloudBase SDK 未初始化");
      return;
    }

    if (!email || !password) {
      alert("请输入邮箱和密码");
      return;
    }

    try {
      const auth = cloudbaseApp.auth();
      const result = await auth.signInWithEmailAndPassword(email, password);

      setIsLoggedIn(true);
      setUserInfo(result.user);
      alert("登录成功！");
    } catch (error: any) {
      console.error("邮箱登录失败:", error);
      alert(`登录失败: ${error.message}`);
    }
  };

  // 邮箱注册处理
  const handleEmailRegister = async () => {
    if (!cloudbaseApp) {
      alert("CloudBase SDK 未初始化");
      return;
    }

    if (!email || !password) {
      alert("请输入邮箱和密码");
      return;
    }

    try {
      const auth = cloudbaseApp.auth();
      const result = await auth.signUpWithEmailAndPassword(email, password);

      alert("注册成功！请检查邮箱验证邮件。");
      setIsRegistering(false);
    } catch (error: any) {
      console.error("邮箱注册失败:", error);
      alert(`注册失败: ${error.message}`);
    }
  };

  // 登出
  const handleLogout = async () => {
    if (!cloudbaseApp) {
      alert("CloudBase SDK 未初始化");
      return;
    }

    try {
      const auth = cloudbaseApp.auth();
      await auth.signOut();

      setIsLoggedIn(false);
      setUserInfo(null);
      alert("已成功登出");
    } catch (error) {
      console.error("登出失败:", error);
      alert("登出失败");
    }
  };

  // 刷新状态
  const refreshStatus = async () => {
    if (cloudbaseApp) {
      setLoading(true);
      await checkLoginStatus(cloudbaseApp);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">初始化中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        {/* 头部 */}
        <div className="bg-blue-600 text-white p-6">
          <h1 className="text-2xl font-bold text-center">
            腾讯云 CloudBase 登录
          </h1>
          <p className="text-blue-100 text-center text-sm mt-2">
            支持微信登录和邮箱登录
          </p>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {isLoggedIn && userInfo ? (
            /* 已登录状态 */
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  登录成功！
                </h2>
                <p className="text-gray-600 text-sm">
                  欢迎回来，
                  {userInfo.nickName || userInfo.displayName || "用户"}
                </p>
              </div>

              {/* 用户信息 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">用户ID:</span>
                  <span className="text-sm font-mono text-gray-900">
                    {userInfo.uid}
                  </span>
                </div>
                {userInfo.nickName && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">昵称:</span>
                    <span className="text-sm text-gray-900">
                      {userInfo.nickName}
                    </span>
                  </div>
                )}
                {userInfo.avatarUrl && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">头像:</span>
                    <img
                      src={userInfo.avatarUrl}
                      alt="头像"
                      className="w-8 h-8 rounded-full"
                    />
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="space-y-3">
                <button
                  onClick={handleLogout}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
                >
                  登出
                </button>
                <button
                  onClick={refreshStatus}
                  className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  刷新状态
                </button>
              </div>
            </div>
          ) : (
            /* 未登录状态 */
            <div className="space-y-6">
              {/* 登录方式选择 */}
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setLoginMethod("wechat")}
                  className={`flex-1 py-3 px-4 text-center font-medium ${
                    loginMethod === "wechat"
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  微信登录
                </button>
                <button
                  onClick={() => setLoginMethod("email")}
                  className={`flex-1 py-3 px-4 text-center font-medium ${
                    loginMethod === "email"
                      ? "text-blue-600 border-b-2 border-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  邮箱登录
                </button>
              </div>

              {loginMethod === "wechat" ? (
                /* 微信登录 */
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-green-600"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18 0 .659-.52 1.188-1.162 1.188-.642 0-1.162-.529-1.162-1.188 0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18 0 .659-.52 1.188-1.162 1.188-.642 0-1.162-.529-1.162-1.188 0-.651.52-1.18 1.162-1.18z" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      微信登录
                    </h2>
                    <p className="text-gray-600 text-sm">
                      使用微信扫码或授权登录
                    </p>
                  </div>

                  {/* 登录流程说明 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-blue-900 mb-2">
                      登录流程：
                    </h3>
                    <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                      <li>点击"微信登录"按钮</li>
                      <li>跳转到微信授权页面</li>
                      <li>用户确认授权并登录</li>
                      <li>自动跳转回此页面</li>
                    </ol>
                  </div>

                  {/* 微信登录按钮 */}
                  <button
                    onClick={handleWechatLogin}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    微信登录
                  </button>
                </div>
              ) : (
                /* 邮箱登录 */
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      {isRegistering ? "邮箱注册" : "邮箱登录"}
                    </h2>
                    <p className="text-gray-600 text-sm">
                      {isRegistering ? "创建新账号" : "使用邮箱和密码登录"}
                    </p>
                  </div>

                  {/* 邮箱登录表单 */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        邮箱地址
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="请输入邮箱地址"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        密码
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="请输入密码"
                      />
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="space-y-3">
                    <button
                      onClick={
                        isRegistering ? handleEmailRegister : handleEmailLogin
                      }
                      className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      {isRegistering ? "注册" : "登录"}
                    </button>
                    <button
                      onClick={() => setIsRegistering(!isRegistering)}
                      className="w-full text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      {isRegistering ? "已有账号？去登录" : "没有账号？去注册"}
                    </button>
                  </div>
                </div>
              )}

              {/* 注意事项 */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex">
                  <svg
                    className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">注意事项：</p>
                    <ul className="mt-1 space-y-1 list-disc list-inside">
                      <li>需要配置微信公众平台或开放平台的 APP ID</li>
                      <li>回调域名必须与当前域名一致</li>
                      <li>确保已配置腾讯云 CloudBase 环境</li>
                      <li>登录状态通过 Cookie 维护</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 页脚 */}
        <div className="bg-gray-50 px-6 py-4">
          <p className="text-xs text-gray-500 text-center">
            基于腾讯云 CloudBase 支持微信和邮箱登录
          </p>
        </div>
      </div>
    </div>
  );
}
