"use client";

import { useState, Suspense, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { getAuthClient } from "@/lib/auth/client";
import { Eye, EyeOff, Mail, Lock, MessageSquare, Home } from "lucide-react";
import { RegionType } from "@/lib/architecture-modules/core/types";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";
import { getWechatLoginUrl } from "@/lib/wechat/oauth";
import { isChinaDeployment } from "@/lib/config/deployment.config";
import { useAuthConfig } from "@/lib/hooks/useAuthConfig";
import { detectPlatform } from "@/lib/platform-detection";
import { saveAuthState } from "@/lib/auth-state-manager";

const authClient = getAuthClient();

function AuthPageContent() {
  // 从API端点读取配置
  const { config, loading: configLoading } = useAuthConfig();
  const wechatAppId = config.wechatAppId || "";
  const appUrl = config.appUrl || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">(
    "password"
  );
  const [forgotPassword, setForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<
    "request" | "verify" | "reset"
  >("request");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // 注册验证码相关状态
  const [signupOtp, setSignupOtp] = useState("");
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form");

  // 隐私政策同意状态
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading, refreshUser } = useUser();
  const mode = searchParams.get("mode") || "signin";
  const debugRegion = searchParams.get("debug");
  const { language } = useLanguage();
  const t = useTranslations(language);

  // 辅助函数：构建包含debug参数的URL
  const buildUrl = useCallback(
    (path: string, additionalParams?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (debugRegion) {
        params.set("debug", debugRegion);
      }
      if (additionalParams) {
        Object.entries(additionalParams).forEach(([key, value]) => {
          params.set(key, value);
        });
      }
      const queryString = params.toString();
      return queryString ? `${path}?${queryString}` : path;
    },
    [debugRegion]
  );

  // 检测用户区域 - 从部署配置初始化
  const getInitialRegion = (): RegionType => {
    // 使用新的部署配置系统而不是环境变量
    if (isChinaDeployment()) {
      return RegionType.CHINA;
    }
    return RegionType.USA;
  };

  const [userRegion, setUserRegion] = useState<RegionType>(getInitialRegion());
  const [platformInfo, setPlatformInfo] = useState(() => {
    const info = detectPlatform();
    console.log("🔍 [Auth] 初始平台检测结果:", JSON.stringify(info));
    return info;
  });

  const nativeWechatCallbackRef = useRef<string | null>(null);

  // 持续监控 wx 对象状态 (调试用)
  useEffect(() => {
    if (!platformInfo.isWechatMiniProgram) return;
    
    let count = 0;
    const timer = setInterval(() => {
      count++;
      const wx = (window as any).wx || (window as any).jWeixin;
      console.log(`[Auth] 周期性检查 wx (${count}s):`, {
        wxExists: !!wx,
        mpExists: !!wx?.miniProgram,
        jWeixin: !!(window as any).jWeixin
      });
      if (wx?.miniProgram || count >= 10) clearInterval(timer);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [platformInfo.isWechatMiniProgram]);

  // 微信小程序登录逻辑
  const handleWechatMiniProgramLogin = useCallback(
    async (code: string, profile?: { nickName?: string; avatarUrl?: string }) => {
      if (loading) return;
      setLoading(true);
      setError("");
      try {
        console.log("🚀 [Auth] 正在使用小程序 code 登录:", code);
        // 严格按照 Demo 使用 /api/wxlogin 接口，同时传递昵称和头像
        const response = await fetch("/api/wxlogin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            nickName: profile?.nickName,
            avatarUrl: profile?.avatarUrl,
          }),
        });
        const data = await response.json();

        if (data.ok && data.token) {
          const { token, refreshToken, userInfo } = data;
          // 使用 auth-state-manager 保存状态
          saveAuthState(
            token,
            refreshToken || "",
            {
              id: userInfo?.id || "",
              email:
                userInfo?.email || `miniprogram_${userInfo?.openid}@local.wechat`,
              name: profile?.nickName || userInfo?.nickname || "微信用户",
              avatar: profile?.avatarUrl || userInfo?.avatar || "",
            },
            {
              accessTokenExpiresIn: 3600, // 1小时
              refreshTokenExpiresIn: 7 * 24 * 3600, // 7天
            }
          );

          console.log("✅ [Auth] 小程序登录成功");
          // 刷新用户信息
          await refreshUser();
          // 跳转到首页（通过 window.location 而不是 router.push，确保完整刷新）
          window.location.href = "/";
        } else {
          setError(data.error || "微信登录失败");
        }
      } catch (err) {
        console.error("❌ [Auth] 小程序登录异常:", err);
        setError("微信登录异常，请稍后重试");
      } finally {
        setLoading(false);
      }
    },
    [loading, refreshUser, router]
  );

  // 监听 URL 中的 mpCode (小程序回传)
  useEffect(() => {
    const mpCode = searchParams.get("mpCode");
    const mpNickName = searchParams.get("mpNickName");
    const mpAvatarUrl = searchParams.get("mpAvatarUrl");

    if (mpCode && platformInfo.isWechatMiniProgram) {
      // 避免重复触发
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete("mpCode");
      currentUrl.searchParams.delete("mpNickName");
      currentUrl.searchParams.delete("mpAvatarUrl");
      currentUrl.searchParams.delete("mpProfileTs");
      window.history.replaceState({}, "", currentUrl.toString());

      handleWechatMiniProgramLogin(mpCode, {
        nickName: mpNickName || undefined,
        avatarUrl: mpAvatarUrl || undefined,
      });
    }
  }, [
    searchParams,
    platformInfo.isWechatMiniProgram,
    handleWechatMiniProgramLogin,
  ]);

  // 监听 postMessage (小程序主动推送)
  useEffect(() => {
    if (!platformInfo.isWechatMiniProgram) return;

    const handleMessage = (event: any) => {
      const data = event.data?.data || event.data;
      if (!data) return;

      if (data.type === "WX_LOGIN_CODE" && data.code) {
        console.log("📩 [Auth] 收到小程序 postMessage code:", data.code);
        handleWechatMiniProgramLogin(data.code);
      }

      if (data.type === "PROFILE_RESULT" && data.userInfo) {
        console.log("📩 [Auth] 收到小程序 profile:", data.userInfo);
        // 如果已经登录，可以考虑更新用户信息，这里简单记录
        if (user) {
          // 可以在这里调用更新用户信息的接口
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [platformInfo.isWechatMiniProgram, handleWechatMiniProgramLogin, user]);

  // 触发小程序登录请求 - 严格参照 logindome/web/public/app.js 实现
  const handleWechatMiniProgramLoginRequest = useCallback(() => {
    const returnUrl = window.location.href;
    const loginUrl = `/pages/webshell/login?returnUrl=${encodeURIComponent(returnUrl)}`;

    // 严格参考 Demo 的方式获取 wx 对象
    const getWxMiniProgram = () => {
      const wxObj = (window as any).wx;
      if (!wxObj || (typeof wxObj !== 'object' && typeof wxObj !== 'function')) return null;
      const mp = wxObj.miniProgram;
      if (!mp || (typeof mp !== 'object' && typeof mp !== 'function')) return null;
      return mp;
    };

    const mp = getWxMiniProgram();

    console.log("🚀 [Auth] 尝试触发小程序登录, 环境状态:", {
      wxExists: !!(window as any).wx,
      mpExists: !!mp,
      hasNavigateTo: !!(mp && typeof mp.navigateTo === 'function'),
    });

    // 严格按照 Demo 的方式调用 - 不传 success/fail 回调
    if (mp && typeof mp.navigateTo === 'function') {
      console.log("🚀 [Auth] 使用 wx.miniProgram.navigateTo 跳转登录页:", loginUrl);
      mp.navigateTo({ url: loginUrl });
      return;
    }

    console.error("❌ [Auth] wx.miniProgram.navigateTo 不可用");
    setError("无法连接到小程序环境。请确保在小程序中打开并刷新重试。");
  }, []);

  useEffect(() => {
    // 初始化区域
    setUserRegion(getInitialRegion());
  }, []);

  // 清理原生微信回调
  useEffect(() => {
    return () => {
      const cb = nativeWechatCallbackRef.current;
      if (cb && (window as any)[cb]) {
        delete (window as any)[cb];
      }
      nativeWechatCallbackRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 如果用户已经登录且不是在加载状态，自动跳转到首页
    if (user && !userLoading) {
      console.log("用户已登录，跳转到首页");
      router.replace(buildUrl("/"));
    }
  }, [user, userLoading, router, buildUrl]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    // 验证隐私政策同意（中国版本登录也必须同意）
    if (userRegion === RegionType.CHINA && !agreeToPrivacy) {
      setError("请阅读并同意隐私政策");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await authClient.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // 登录成功，触发auth-state-changed事件通知其他组件
      // 对于INTL模式，Supabase SDK的onAuthStateChange会自动触发
      console.log("邮箱登录成功，准备跳转...");
      setLoading(false);

      // 发送自定义事件，让user-context通过监听器更新（用于兼容CN模式）
      window.dispatchEvent(new Event("auth-state-changed"));

      // 等待user-context更新用户状态后自动跳转
      setTimeout(() => {
        router.replace(buildUrl("/"));
      }, 500);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("登录失败，请稍后重试");
      }
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    // 验证隐私政策同意（中国版本必须同意）
    if (userRegion === RegionType.CHINA && !agreeToPrivacy) {
      setError("请阅读并同意隐私政策");
      setLoading(false);
      return;
    }

    // 验证密码
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("密码长度至少为6位");
      setLoading(false);
      return;
    }

    try {
      // 根据区域采用不同的注册方式
      if (userRegion === RegionType.CHINA) {
        if (!signupOtpSent) {
          setError("请先发送邮箱验证码");
          setLoading(false);
          return;
        }

        if (!signupOtp || signupOtp.length < 4) {
          setError("请输入有效的邮箱验证码");
          setLoading(false);
          return;
        }

        // 中国区域：直接使用 email + password + confirmPassword 注册
        // 无需 OTP 验证，直接调用后端 API

        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            confirmPassword,
            signupOtp,
            fullName: email.split("@")[0], // 使用邮箱前缀作为默认名称
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          // 处理特定的错误信息
          if (data.code === "EMAIL_EXISTS") {
            setError("该邮箱已被注册");
          } else if (data.code === "WEAK_PASSWORD") {
            setError(
              data.passwordStrength?.feedback?.[0] ||
                "密码强度不足，请使用更复杂的密码"
            );
          } else {
            setError(data.error || data.message || "注册失败，请稍后重试");
          }
          setLoading(false);
          return;
        }

        // 注册成功
        setError("注册成功！请使用您的邮箱和密码登录。");
        setSignupStep("form");
        setPassword("");
        setConfirmPassword("");
        setEmail("");
        setSignupOtp("");
        setSignupOtpSent(false);
        setLoginMethod("password");
        setAgreeToPrivacy(false);
        setLoading(false);

        // 重置到登录页面
        setTimeout(() => {
          router.push(buildUrl("/auth", { mode: "signin" }));
        }, 1500);
      } else {
        // 国际区域：使用 signUp() 直接注册，邮件确认流程由 Supabase 内置处理
        try {
          const { data, error: signUpError } = await authClient.signUp({
            email,
            password,
          } as any);

          if (signUpError) {
            // 处理特定的错误信息
            if (signUpError.message?.includes("already registered")) {
              setError("该邮箱已被注册");
            } else {
              setError(signUpError.message || "注册失败，请稍后重试");
            }
            setLoading(false);
            return;
          }

          // 注册成功，显示邮件验证提示
          setError(
            "注册成功！我们已向您的邮箱发送一封确认邮件。请检查您的邮箱并点击确认链接以完成注册。"
          );
          setSignupStep("form");
          setPassword("");
          setConfirmPassword("");
          setEmail("");
          setSignupOtp("");
          setSignupOtpSent(false);
          setLoginMethod("password");
          setAgreeToPrivacy(false);
          setLoading(false);

          // 5秒后返回登录页面
          setTimeout(() => {
            router.push(buildUrl("/auth", { mode: "signin" }));
          }, 5000);
        } catch (err) {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("注册失败，请稍后重试");
          }
          setLoading(false);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("注册失败，请稍后重试");
      }
      setLoading(false);
    }
  };

  const handleOtpSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    // 验证隐私政策同意（中国版本登录也必须同意）
    if (userRegion === RegionType.CHINA && !agreeToPrivacy) {
      setError("请阅读并同意隐私政策");
      setLoading(false);
      return;
    }

    try {
      if (!otpSent) {
        const { error } = await authClient.signInWithOtp({ email });
        if (error) {
          setError(error.message);
        } else {
          setOtpSent(true);
          setError("验证码已发送到您的邮箱，请检查并输入验证码。");
        }
        setLoading(false);
      } else {
        const { error } = await authClient.verifyOtp({
          email,
          token: otp,
          type: "email",
        });
        if (error) {
          setError(error.message);
          setLoading(false);
        } else {
          // 验证成功，等待user-context更新后自动跳转
          // 不手动调用router.replace，避免竞态
          console.log("OTP登录成功，准备跳转...");
          setLoading(false);
          setTimeout(() => {
            router.replace(buildUrl("/"));
          }, 500);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("操作失败，请稍后重试");
      }
      setLoading(false);
    }
  };

  const handleWechatSignIn = async () => {
    console.log("点击了微信登录按钮, 当前平台信息:", JSON.stringify(platformInfo));

    // 套壳 Android：走原生微信登录，再复用小程序登录的 code 交换逻辑
    if (platformInfo.type === "android-app") {
      setError("");
      setLoading(true);

      const callbackName = "__wechatNativeAuthCallback";
      nativeWechatCallbackRef.current = callbackName;

      (window as any)[callbackName] = async (payload: any) => {
        console.log("[login] 收到原生微信登录回调:", payload);
        nativeWechatCallbackRef.current = null;

        if (!payload || typeof payload !== "object") {
          setError("微信登录失败：无效回调");
          setLoading(false);
          return;
        }

        if (payload.errCode !== 0 || !payload.code) {
          setError(payload.errStr || "微信登录已取消或失败");
          setLoading(false);
          return;
        }

        // 确保 handleWechatMiniProgramLogin 不被 loading=true 阻塞
        setLoading(false);
        await handleWechatMiniProgramLogin(payload.code);
      };

      const scheme = `wechat-login://start?callback=${encodeURIComponent(callbackName)}`;
      console.log("[login] 发起原生微信登录, scheme:", scheme);
      window.location.href = scheme;
      return;
    }

    // 直接检查 wx 对象是否存在（不依赖 platformInfo，因为它可能在 wx 注入前就检测了）
    const wxObj = (window as any).wx;
    const mp = wxObj?.miniProgram;

    console.log("[login] 直接检查 wx:", JSON.stringify({
      wxExists: !!wxObj,
      mpExists: !!mp,
      navigateToExists: !!(mp && typeof mp.navigateTo === 'function'),
      platformInfo: platformInfo
    }));

    // 如果 wx.miniProgram.navigateTo 可用，使用小程序登录
    if (mp && typeof mp.navigateTo === 'function') {
      const returnUrl = window.location.href;
      const target = `/pages/webshell/login?returnUrl=${encodeURIComponent(returnUrl)}`;

      console.log("[login] 使用 wx.miniProgram.navigateTo 跳转登录页");
      console.log("[login] target:", target);

      // 完全按照 demo 的方式调用，不传任何回调
      mp.navigateTo({ url: target });
      return;
    }

    // 如果 platformInfo 认为是小程序但 wx 不可用，显示错误
    if (platformInfo.isWechatMiniProgram) {
      console.error("[login] 检测到小程序环境但 wx.miniProgram.navigateTo 不可用");
      setError("无法连接到小程序环境，请刷新页面重试");
      return;
    }

    // 否则使用微信 OAuth 登录
    setLoading(true);
    setError("");

    try {
      // 直接使用环境变量中的配置

      if (!wechatAppId) {
        setError("微信应用 ID 未配置");
        setLoading(false);
        return;
      }

      if (!appUrl) {
        setError("应用 URL 未配置");
        setLoading(false);
        return;
      }

      // 获取微信登录 URL
      // 使用 NEXT_PUBLIC_APP_URL 确保与微信开放平台配置的域名一致
      const redirectUri = `${appUrl}/auth/callback`;
      const wechatLoginUrl = getWechatLoginUrl(wechatAppId, redirectUri);

      // ✅ 直接跳转到微信登录页面（标准 OAuth2 流程）
      // 用户看到二维码，扫码授权后自动回调到 /auth/callback
      window.location.href = wechatLoginUrl;
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("微信登录失败，请稍后重试");
      }
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const { error } = await authClient.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildUrl(`${window.location.origin}/auth/callback`),
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // OAuth会重定向，不需要手动处理
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t.auth.googleLoginFailed || "Google登录失败，请稍后重试");
      }
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const { error } = await authClient.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: buildUrl(`${window.location.origin}/auth/callback`),
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // OAuth会重定向，不需要手动处理
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t.auth.appleLoginFailed || "Apple登录失败，请稍后重试");
      }
      setLoading(false);
    }
  };

  const resetForgotPasswordFlow = () => {
    setForgotPasswordStep("request");
    setResetOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const handleResetOtpRequest = async (
    e?: React.FormEvent | React.MouseEvent<HTMLButtonElement>
  ) => {
    e?.preventDefault();
    if (loading) return; // 防止并发请求

    setLoading(true);
    setError("");

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("发送验证码超时，请检查网络连接后重试"));
        }, 15000);
      });

      if (userRegion === RegionType.CHINA) {
        const requestPromise = fetch("/api/auth/email-otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, purpose: "password_reset" }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) {
            throw new Error(data?.error || "发送验证码失败");
          }
          return data;
        });

        await Promise.race([requestPromise, timeoutPromise]);
        setForgotPasswordStep("verify");
        setError("验证码已发送到您的邮箱，请输入验证码。");
        setLoading(false);
      } else {
        const resetOtpPromise = authClient.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: buildUrl(`${window.location.origin}/auth`),
          },
        });

        const { error } = await Promise.race([resetOtpPromise, timeoutPromise]);

        if (error) {
          setError(error.message);
        } else {
          setForgotPasswordStep("verify");
          setError("验证码已发送到您的邮箱，请输入验证码。");
          setLoading(false);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("发送验证码失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // 防止并发请求

    if (!resetOtp) {
      setError("请输入验证码");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("验证验证码超时，请检查网络连接后重试"));
        }, 15000);
      });

      if (userRegion === RegionType.CHINA) {
        // CN 模式下在最终重置时校验验证码，这里只进入下一步
        await Promise.race([
          Promise.resolve(true),
          timeoutPromise,
        ]);
        setForgotPasswordStep("reset");
        setError("验证码已记录，请设置新密码。");
        setLoading(false);
      } else {
        const verifyPromise = authClient.verifyOtp({
          email,
          token: resetOtp,
          type: "email",
        });

        const { error } = await Promise.race([verifyPromise, timeoutPromise]);

        if (error) {
          setError(error.message);
        } else {
          setForgotPasswordStep("reset");
          setResetOtp("");
          setError("验证码验证成功，请设置新密码。");
          setLoading(false);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("验证码验证失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // 防止并发请求

    if (newPassword.length < 6) {
      setError("密码长度至少为6位");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("设置密码超时，请检查网络连接后重试"));
        }, 15000);
      });

      if (userRegion === RegionType.CHINA) {
        const resetPromise = fetch("/api/auth/password/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            otp: resetOtp,
            newPassword,
            confirmPassword: confirmNewPassword,
          }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.success) {
            throw new Error(data?.error || "重置密码失败");
          }
          return data;
        });

        await Promise.race([resetPromise, timeoutPromise]);
      } else {
        const updatePromise = authClient.updateUser({
          password: newPassword,
        });

        const { error } = await Promise.race([updatePromise, timeoutPromise]);

        if (error) {
          setError(error.message);
          return;
        }

        await authClient.signOut();
      }

      setForgotPassword(false);
      resetForgotPasswordFlow();
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setOtpSent(false);
      setLoginMethod("password");
      setNewPassword("");
      setConfirmNewPassword("");
      setError("密码重置成功，请使用新密码登录。");
      setLoading(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("设置新密码失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const currentMode = mode === "signup" ? "signUp" : "signIn";

  const getButtonText = () => {
    if (loading) {
      if (loginMethod === "password") return t.auth.loggingIn;
      if (otpSent) return t.auth.verifying;
      return t.auth.sending;
    } else {
      if (loginMethod === "password") return t.auth.signInButton;
      if (otpSent) return t.auth.verifyOtp;
      return t.auth.sendOtp;
    }
  };

  const buttonText = getButtonText();

  const handleSendSignupOtp = async () => {
    if (loading) return;
    if (!email) {
      setError("请输入邮箱");
      return;
    }
    if (userRegion !== RegionType.CHINA) {
      setError("当前模式不需要验证码");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/email-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "signup" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || "发送验证码失败");
        setLoading(false);
        return;
      }

      setSignupOtpSent(true);
      setSignupStep("verify");
      setError("验证码已发送，请查收邮箱并输入。");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
      setLoading(false);
    }
  };

  const renderForgotPasswordForm = () => {
    if (forgotPasswordStep === "request") {
      return (
        <form onSubmit={handleResetOtpRequest} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">{t.auth.email}</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder={t.auth.enterEmail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.auth.sending : t.auth.sendOtp}
          </Button>

          <div className="text-center">
            <a
              href="#"
              className="text-sm text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setForgotPassword(false);
                resetForgotPasswordFlow();
                setError("");
              }}
            >
              {t.auth.backToLogin}
            </a>
          </div>
        </form>
      );
    }

    if (forgotPasswordStep === "verify") {
      return (
        <form onSubmit={handleVerifyResetOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email-verify">{t.auth.email}</Label>
            <Input
              id="reset-email-verify"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-otp">{t.auth.resetPassword}</Label>
            <Input
              id="reset-otp"
              type="text"
              placeholder={t.auth.enterOtp}
              value={resetOtp}
              onChange={(e) => setResetOtp(e.target.value)}
              maxLength={6}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.auth.verifying : t.auth.verifyOtp}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                handleResetOtpRequest(e);
              }}
              disabled={loading}
            >
              {t.auth.resendOtp}
            </button>
            <a
              href="#"
              className="text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setForgotPassword(false);
                resetForgotPasswordFlow();
                setError("");
              }}
            >
              {t.auth.backToLogin}
            </a>
          </div>
        </form>
      );
    }

    return (
      <form onSubmit={handleSetNewPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-new-password">{t.auth.password}</Label>
          <Input
            id="reset-new-password"
            type="password"
            placeholder={t.auth.enterNewPassword}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reset-confirm-password">
            {t.auth.confirmPassword}
          </Label>
          <Input
            id="reset-confirm-password"
            type="password"
            placeholder={t.auth.confirmNewPassword}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t.auth.setting : t.auth.setNewPassword}
        </Button>

        <div className="text-center">
          <a
            href="#"
            className="text-sm text-blue-600 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              setForgotPassword(false);
              resetForgotPasswordFlow();
              setError("");
            }}
          >
            {t.auth.backToLogin}
          </a>
        </div>
      </form>
    );
  };

  const signinForm = forgotPassword ? (
    renderForgotPasswordForm()
  ) : (
    <form
      onSubmit={loginMethod === "password" ? handleSignIn : handleOtpSignIn}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t.auth.enterEmail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      {loginMethod === "password" ? (
        <div className="space-y-2">
          <Label htmlFor="password">{t.auth.password}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t.auth.enterPassword}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {/* 忘记密码链接 */}
          <div className="text-right">
            <a
              href="#"
              className="text-sm text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setForgotPassword(true);
                resetForgotPasswordFlow();
                setError("");
              }}
            >
              {t.auth.forgotPassword}
            </a>
          </div>
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            <Label htmlFor="otp">{t.auth.resetPassword}</Label>
            <Input
              id="otp"
              type="text"
              placeholder={t.auth.enterOtp}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required={otpSent}
            />
          </div>
          {/* 切换为密码登录的链接 */}
          <div className="text-right">
            <a
              href="#"
              className="text-sm text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                setLoginMethod("password");
                setOtp("");
                setOtpSent(false);
              }}
            >
              {t.auth.usePasswordLogin}
            </a>
          </div>
        </div>
      )}

      {/* 隐私政策同意 - 中国版本强制同意 */}
      {userRegion === RegionType.CHINA && (
        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
          <Checkbox
            id="privacy-agree-signin"
            checked={agreeToPrivacy}
            onCheckedChange={(checked) => setAgreeToPrivacy(checked as boolean)}
            className="mt-1"
          />
          <label
            htmlFor="privacy-agree-signin"
            className="text-sm text-gray-700 cursor-pointer flex-1"
          >
            我已阅读并同意{" "}
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => router.push(buildUrl("/privacy"))}
            >
              《隐私政策》
            </button>{" "}
            和{" "}
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => router.push(buildUrl("/privacy"))}
            >
              《服务条款》
            </button>
            <span className="text-red-600 ml-1">*</span>
          </label>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {buttonText}
      </Button>
    </form>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* 返回首页按钮 */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-4 left-4"
        onClick={() => router.push(buildUrl("/"))}
      >
        <Home className="h-4 w-4 mr-2" /> {t.auth.backToHome}
      </Button>

      {/* 隐私政策链接 */}
      <Button
        variant="ghost"
        size="sm"
        className={`absolute top-4 ${debugRegion ? "right-48" : "right-4"}`}
        onClick={() => router.push(buildUrl("/privacy"))}
      >
        {language === "zh" ? "隐私政策" : "Privacy Policy"}
      </Button>

      {/* Debug信息显示 */}
      {debugRegion && (
        <div className="absolute top-4 right-4 bg-yellow-100 border border-yellow-300 rounded-lg px-3 py-2 text-sm">
          <div className="font-medium text-yellow-800">{t.auth.debugMode}</div>
          <div className="text-yellow-700">
            {t.auth.region}:{" "}
            {userRegion === RegionType.CHINA
              ? t.auth.china
              : userRegion === RegionType.USA
              ? t.auth.usa
              : t.auth.unknown}
          </div>
        </div>
      )}

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">
            {mode === "signup" ? t.auth.signUpTitle : t.auth.signInTitle}
          </CardTitle>
          <CardDescription className="text-center">
            {mode === "signup"
              ? t.auth.signUpDescription
              : t.auth.signInDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="signin"
                onClick={() =>
                  router.push(buildUrl("/auth", { mode: "signin" }))
                }
              >
                {t.auth.login}
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                onClick={() =>
                  router.push(buildUrl("/auth", { mode: "signup" }))
                }
              >
                {t.auth.register}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="space-y-6">
              {signinForm}

              {/* separator */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500">
                    {t.auth.or}
                  </span>
                </div>
              </div>

              {/* 根据区域和平台显示不同的登录选项 */}
              {(userRegion === RegionType.CHINA ||
                platformInfo.isWechatMiniProgram) &&
              platformInfo.type !== "ios-app" ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleWechatSignIn}
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                      />
                    </svg>
                    {loading
                      ? platformInfo.isWechatMiniProgram
                        ? "正在登录..."
                        : "正在跳转到微信..."
                      : t.auth.wechatLogin}
                  </Button>
                </div>
              ) : userRegion === RegionType.USA &&
                !platformInfo.type.includes("app") ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleGoogleSignIn}
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    {t.auth.googleLogin}
                  </Button>
                  <Button
                    onClick={handleAppleSignIn}
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M17.05 20.28c-.98.95-2.05 1.72-3.11 1.72-1.01 0-1.45-.67-2.61-.67-1.18 0-1.65.67-2.61.67-1.03 0-2.18-.81-3.13-1.72C3.61 18.33 2 15.02 2 12.01c0-4.69 3.05-7.13 6-7.13 1.51 0 2.73.93 3.61.93.89 0 2.28-.93 3.91-.93 1.35 0 4.5.56 6.1 2.83-3.3 1.93-2.76 6.05.48 7.33-1.15 2.89-3.01 5.24-5.05 5.24zm-4.69-15.8c0-2.1 1.73-3.8 3.83-3.8.13 0 .26.01.39.03-.15 2.21-1.93 3.98-4.13 3.98-.03 0-.06 0-.09-.01v-.2z"
                      />
                    </svg>
                    {t.auth.appleLogin}
                  </Button>
                </div>
              ) : null}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </TabsContent>
            <TabsContent value="signup" className="space-y-4">
              {/* 邮箱注册表单 */}
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">{t.auth.email}</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={t.auth.enterEmail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={signupStep === "verify"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">{t.auth.password}</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder={t.auth.passwordMinLength}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={signupStep === "verify"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={signupStep === "verify"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">
                    {t.auth.confirmPassword}
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder={t.auth.enterConfirmPassword}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={signupStep === "verify"}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={signupStep === "verify"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {userRegion === RegionType.CHINA && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-otp">邮箱验证码</Label>
                    <div className="flex gap-2">
                      <Input
                        id="signup-otp"
                        type="text"
                        placeholder={signupOtpSent ? "请输入验证码" : "先发送验证码"}
                        value={signupOtp}
                        onChange={(e) => setSignupOtp(e.target.value)}
                        maxLength={6}
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendSignupOtp}
                        disabled={loading || !email}
                      >
                        {signupOtpSent ? "重发" : "发送"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* 隐私政策同意 - 中国版本强制同意，国际版本可选 */}
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Checkbox
                    id="privacy-agree"
                    checked={agreeToPrivacy}
                    onCheckedChange={(checked) =>
                      setAgreeToPrivacy(checked as boolean)
                    }
                    disabled={signupStep === "verify"}
                    className="mt-1"
                  />
                  <label
                    htmlFor="privacy-agree"
                    className="text-sm text-gray-700 cursor-pointer flex-1"
                  >
                    {userRegion === RegionType.CHINA ? (
                      <>
                        我已阅读并同意{" "}
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => router.push(buildUrl("/privacy"))}
                        >
                          《隐私政策》
                        </button>{" "}
                        和{" "}
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => router.push(buildUrl("/privacy"))}
                        >
                          《服务条款》
                        </button>
                        <span className="text-red-600 ml-1">*</span>
                      </>
                    ) : (
                      <>
                        I agree to the{" "}
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => router.push(buildUrl("/privacy"))}
                        >
                          Privacy Policy
                        </button>
                      </>
                    )}
                  </label>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? userRegion === RegionType.CHINA
                      ? "注册中..."
                      : "Signing up..."
                    : userRegion === RegionType.CHINA
                    ? t.auth.register
                    : "Sign Up"}
                </Button>
              </form>

              {/* separator */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500">
                    {t.auth.or}
                  </span>
                </div>
              </div>

              {/* 根据区域和平台显示不同的登录选项 */}
              {(userRegion === RegionType.CHINA ||
                platformInfo.isWechatMiniProgram) &&
              platformInfo.type !== "ios-app" ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleWechatSignIn}
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                      />
                    </svg>
                    {loading
                      ? platformInfo.isWechatMiniProgram
                        ? "正在注册..."
                        : "正在跳转到微信..."
                      : t.auth.wechatRegister}
                  </Button>
                </div>
              ) : userRegion === RegionType.USA &&
                !platformInfo.type.includes("app") ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleGoogleSignIn}
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    {t.auth.googleRegister}
                  </Button>
                  <Button
                    onClick={handleAppleSignIn}
                    variant="outline"
                    className="w-full h-12"
                    disabled={loading}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M17.05 20.28c-.98.95-2.05 1.72-3.11 1.72-1.01 0-1.45-.67-2.61-.67-1.18 0-1.65.67-2.61.67-1.03 0-2.18-.81-3.13-1.72C3.61 18.33 2 15.02 2 12.01c0-4.69 3.05-7.13 6-7.13 1.51 0 2.73.93 3.61.93.89 0 2.28-.93 3.91-.93 1.35 0 4.5.56 6.1 2.83-3.3 1.93-2.76 6.05.48 7.33-1.15 2.89-3.01 5.24-5.05 5.24zm-4.69-15.8c0-2.1 1.73-3.8 3.83-3.8.13 0 .26.01.39.03-.15 2.21-1.93 3.98-4.13 3.98-.03 0-.06 0-.09-.01v-.2z"
                      />
                    </svg>
                    {t.auth.appleRegister}
                  </Button>
                </div>
              ) : null}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
