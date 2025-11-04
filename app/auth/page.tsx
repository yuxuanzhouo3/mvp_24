"use client";

import { useState, Suspense, useEffect, useCallback } from "react";
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
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Mail, Lock, MessageSquare, Home } from "lucide-react";
import { RegionType } from "@/lib/architecture-modules/core/types";
import { useUser } from "@/components/user-context";
import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

function AuthPageContent() {
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

  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useUser();
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

  // 检测用户区域
  const [userRegion, setUserRegion] = useState<RegionType>(RegionType.USA);

  useEffect(() => {
    // 如果用户已经登录且不是在加载状态，自动跳转到首页
    if (user && !userLoading) {
      console.log("用户已登录，跳转到首页");
      router.replace(buildUrl("/"));
    }
  }, [user, userLoading, router, buildUrl]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || loading) return;

    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // 登录成功，等待user-context更新用户状态后自动跳转
      // useEffect会监听user变化并跳转
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
    if (!supabase || loading) return;

    setLoading(true);
    setError("");

    // 第一步：验证表单并发送验证码
    if (signupStep === "form") {
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
        // 发送验证码到邮箱
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
          },
        });

        if (otpError) {
          console.log("发送注册验证码:", otpError);
        }

        setSignupOtpSent(true);
        setSignupStep("verify");
        setError("验证码已发送到您的邮箱，请检查并输入验证码。");
        setLoading(false);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("发送验证码失败，请稍后重试");
        }
        setLoading(false);
      }
      return;
    }

    // 第二步：验证验证码并完成注册
    if (signupStep === "verify") {
      if (!signupOtp) {
        setError("请输入验证码");
        setLoading(false);
        return;
      }

      try {
        // 先验证 OTP
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token: signupOtp,
          type: "email",
        });

        if (verifyError) {
          setError("验证码错误或已过期，请重新获取");
          setLoading(false);
          return;
        }

        // 验证成功后，创建用户账户
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        // 注册成功
        setError("注册成功！正在登录...");
        setSignupStep("form");
        setSignupOtp("");
        setSignupOtpSent(false);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("注册失败，请稍后重试");
        }
        setLoading(false);
      }
    }
  };

  // 重新发送注册验证码
  const handleResendSignupOtp = async () => {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        console.log("重新发送注册验证码:", otpError);
      }

      setError("验证码已重新发送到您的邮箱。");
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

  const handleOtpSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || loading) return;

    setLoading(true);
    setError("");

    try {
      if (!otpSent) {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) {
          setError(error.message);
        } else {
          setOtpSent(true);
          setError("验证码已发送到您的邮箱，请检查并输入验证码。");
        }
        setLoading(false);
      } else {
        const { error } = await supabase.auth.verifyOtp({
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

  const handleGoogleSignIn = async () => {
    if (!supabase || loading) return;

    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
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
        setError("Google登录失败，请稍后重试");
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
    if (!supabase || loading) return; // 防止并发请求

    setLoading(true);
    setError("");

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("发送验证码超时，请检查网络连接后重试"));
        }, 15000);
      });

      const resetOtpPromise = supabase.auth.signInWithOtp({
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
    if (!supabase || loading) return; // 防止并发请求

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

      const verifyPromise = supabase.auth.verifyOtp({
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
    if (!supabase || loading) return; // 防止并发请求

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

      const updatePromise = supabase.auth.updateUser({
        password: newPassword,
      });

      const { error } = await Promise.race([updatePromise, timeoutPromise]);

      if (error) {
        setError(error.message);
        return;
      }

      await supabase.auth.signOut();

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

              {/* 根据区域显示不同的登录选项 */}
              {userRegion === RegionType.CHINA ? (
                <div className="space-y-3">
                  <Button
                    onClick={() => setError(t.auth.domesticLoginDeveloping)}
                    variant="outline"
                    className="w-full h-12"
                    disabled={true}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                      />
                    </svg>
                    {t.auth.wechatLogin}
                  </Button>
                  <p className="text-xs text-center text-gray-500">
                    {debugRegion
                      ? t.auth.debugDomesticLogin
                      : t.auth.domesticLoginNote}
                  </p>
                </div>
              ) : (
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
              )}

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

                {/* 验证码输入框（仅在验证步骤显示） */}
                {signupStep === "verify" && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-otp">{t.auth.resetPassword}</Label>
                    <Input
                      id="signup-otp"
                      type="text"
                      placeholder={t.auth.enterOtp}
                      value={signupOtp}
                      onChange={(e) => setSignupOtp(e.target.value)}
                      maxLength={6}
                      required
                    />
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? signupStep === "form"
                      ? t.auth.sending
                      : t.auth.verifying
                    : signupStep === "form"
                    ? t.auth.sendOtp
                    : t.auth.verifyOtp}
                </Button>

                {/* 重新发送验证码和返回按钮 */}
                {signupStep === "verify" && (
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={handleResendSignupOtp}
                      disabled={loading}
                    >
                      {t.auth.resendOtp}
                    </button>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        setSignupStep("form");
                        setSignupOtp("");
                        setSignupOtpSent(false);
                        setError("");
                      }}
                    >
                      {t.auth.backToModify}
                    </button>
                  </div>
                )}
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

              {/* 根据区域显示不同的登录选项 */}
              {userRegion === RegionType.CHINA ? (
                <div className="space-y-3">
                  <Button
                    onClick={() => setError(t.auth.domesticRegisterDeveloping)}
                    variant="outline"
                    className="w-full h-12"
                    disabled={true}
                  >
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                      />
                    </svg>
                    {t.auth.wechatRegister}
                  </Button>
                  <p className="text-xs text-center text-gray-500">
                    {debugRegion
                      ? t.auth.debugDomesticRegister
                      : t.auth.domesticRegisterNote}
                  </p>
                </div>
              ) : (
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
              )}

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
