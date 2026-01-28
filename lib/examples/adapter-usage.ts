/**
 * 区域适配器使用示例
 *
 * 本文件展示如何在实际代码中使用区域适配器
 */

// ========== 1. 认证模块使用示例 ==========

import { getAuth, isAuthFeatureSupported } from "@/lib/auth/adapter";
import { isChinaRegion } from "@/lib/config/region";

/**
 * 登录页面组件示例
 */
export async function LoginPage() {
  const auth = getAuth();

  // 检查当前区域支持的认证方式
  const supportsEmail = isAuthFeatureSupported("emailAuth");
  const supportsWechat = isAuthFeatureSupported("wechatAuth");
  const supportsGoogle = isAuthFeatureSupported("googleAuth");

  // 邮箱登录（仅国际版）
  if (supportsEmail) {
    const handleEmailLogin = async (email: string, password: string) => {
      const response = await auth.signInWithEmail!(email, password);
      if (response.error) {
        console.error("登录失败:", response.error);
      } else {
        console.log("登录成功:", response.user);
      }
    };
  }

  // 微信登录（仅国内版）
  if (supportsWechat) {
    const handleWechatLogin = async (code: string) => {
      const response = await auth.signInWithWechat!(code);
      if (response.error) {
        console.error("微信登录失败:", response.error);
      } else {
        console.log("微信登录成功:", response.user);
      }
    };
  }

  // OAuth 登录（仅国际版）
  if (supportsGoogle) {
    const handleGoogleLogin = async () => {
      await auth.signInWithOAuth!("google");
    };
  }

  // 获取当前用户
  const currentUser = await auth.getCurrentUser();
  console.log("当前用户:", currentUser);

  // 检查是否已登录
  const isLoggedIn = await auth.isAuthenticated();
  console.log("是否已登录:", isLoggedIn);

  // 登出
  const handleLogout = async () => {
    await auth.signOut();
  };
}

// ========== 2. 支付模块使用示例 ==========

import {
  getPayment,
  getPaymentProviderName,
  getPaymentCurrency,
  formatAmount,
} from "@/lib/payment/adapter";

/**
 * 支付页面组件示例
 */
export async function PaymentPage() {
  const payment = getPayment();

  // 获取支付提供商信息
  const provider = getPaymentProviderName(); // 'alipay' 或 'paypal'
  const currency = getPaymentCurrency(); // 'CNY' 或 'USD'

  console.log(`支付提供商: ${provider}`);
  console.log(`货币: ${currency}`);

  // 创建支付订单
  const handleCreateOrder = async (amount: number, userId: string) => {
    try {
      const order = await payment.createOrder(amount, userId);

      if (isChinaRegion()) {
        // 国内版：支付宝返回 HTML 表单
        if (order.formHtml) {
          // 在页面中插入表单并自动提交
          const div = document.createElement("div");
          div.innerHTML = order.formHtml;
          document.body.appendChild(div);
          const form = div.querySelector("form");
          form?.submit();
        }
      } else {
        // 国际版：PayPal 返回支付链接
        if (order.paymentUrl) {
          // 跳转到 PayPal 支付页面
          window.location.href = order.paymentUrl;
        }
      }

      console.log("订单创建成功:", order.orderId);
    } catch (error) {
      console.error("创建订单失败:", error);
    }
  };

  // 验证支付回调
  const handlePaymentCallback = async (params: any) => {
    try {
      const result = await payment.verifyPayment(params);

      if (result.success) {
        console.log("支付成功!");
        console.log("订单ID:", result.orderId);
        console.log("交易ID:", result.transactionId);
        // 更新用户订阅状态等
      } else {
        console.error("支付验证失败:", result.error);
      }
    } catch (error) {
      console.error("支付验证出错:", error);
    }
  };

  // 查询订单状态
  const handleQueryOrder = async (orderId: string) => {
    try {
      const order = await payment.queryOrder(orderId);
      console.log("订单状态:", order.status);
      console.log("订单金额:", formatAmount(order.amount));
    } catch (error) {
      console.error("查询订单失败:", error);
    }
  };

  // 取消订单
  const handleCancelOrder = async (orderId: string) => {
    try {
      await payment.cancelOrder(orderId);
      console.log("订单已取消");
    } catch (error) {
      console.error("取消订单失败:", error);
    }
  };
}

// ========== 3. 数据库模块使用示例 ==========

import { getDatabase } from "@/lib/database/adapter";

/**
 * 用户数据管理示例
 */
export async function UserManagement() {
  const db = getDatabase();

  interface UserProfile {
    name: string;
    email?: string;
    avatar?: string;
    createdAt: Date;
  }

  // 查询所有用户
  const getAllUsers = async () => {
    const users = await db.query<UserProfile>("users");
    console.log("所有用户:", users);
  };

  // 查询特定用户
  const getUsersByEmail = async (email: string) => {
    const users = await db.query<UserProfile>("users", { email });
    console.log("查询结果:", users);
  };

  // 插入新用户
  const createUser = async (userData: UserProfile) => {
    const newUser = await db.insert("users", userData);
    console.log("新用户ID:", newUser.id);
    console.log("新用户数据:", newUser);
  };

  // 更新用户信息
  const updateUser = async (userId: string, updates: Partial<UserProfile>) => {
    const updatedUser = await db.update("users", userId, updates);
    console.log("更新后的用户:", updatedUser);
  };

  // 删除用户
  const deleteUser = async (userId: string) => {
    await db.delete("users", userId);
    console.log("用户已删除");
  };

  // 根据 ID 获取用户
  const getUser = async (userId: string) => {
    const user = await db.getById<UserProfile>("users", userId);
    if (user) {
      console.log("找到用户:", user);
    } else {
      console.log("用户不存在");
    }
  };
}

// ========== 4. AI 模块使用示例 ==========

import {
  getAI,
  getAvailableModels,
  getDefaultAIModel,
  formatModelName,
  AIMessage,
} from "@/lib/ai/adapter";

/**
 * AI 聊天功能示例
 */
export async function ChatPage() {
  const ai = getAI();

  // 获取可用模型列表
  const models = getAvailableModels();
  console.log(
    "可用模型:",
    models.map((m) => formatModelName(m))
  );

  // 获取默认模型
  const defaultModel = getDefaultAIModel();
  console.log("默认模型:", formatModelName(defaultModel));

  // 发送聊天消息（非流式）
  const handleChat = async (userMessage: string) => {
    const messages: AIMessage[] = [
      { role: "system", content: "你是一个有帮助的AI助手。" },
      { role: "user", content: userMessage },
    ];

    try {
      const response = await ai.chat(messages, defaultModel);
      console.log("AI 回复:", response.content);
      console.log("使用模型:", formatModelName(response.model));
      console.log("Token 使用:", response.usage);
    } catch (error) {
      console.error("AI 请求失败:", error);
    }
  };

  // 发送聊天消息（流式）
  const handleStreamChat = async (userMessage: string) => {
    const messages: AIMessage[] = [
      { role: "system", content: "你是一个有帮助的AI助手。" },
      { role: "user", content: userMessage },
    ];

    try {
      const response = await ai.chatStream(messages, defaultModel);
      console.log("使用模型:", formatModelName(response.model));

      // 处理流式响应
      const reader = response.stream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        console.log("收到数据块:", chunk);
        // 在 UI 中实时显示
      }

      console.log("流式响应完成");
    } catch (error) {
      console.error("流式请求失败:", error);
    }
  };

  // 多轮对话示例
  const handleMultiTurnChat = async () => {
    const messages: AIMessage[] = [
      { role: "system", content: "你是一个有帮助的AI助手。" },
      { role: "user", content: "你好！" },
      { role: "assistant", content: "你好！有什么可以帮助你的吗？" },
      { role: "user", content: "今天天气怎么样？" },
    ];

    const response = await ai.chat(messages);
    console.log("AI 回复:", response.content);
  };
}

// ========== 5. 综合使用示例：完整注册流程 ==========

export async function CompleteRegistrationFlow() {
  const auth = getAuth();
  const db = getDatabase();
  const payment = getPayment();

  // 步骤 1: 用户注册/登录
  const handleRegistration = async () => {
    if (isChinaRegion()) {
      // 国内版：微信登录
      const wechatCode = "..."; // 从微信获取的授权码
      const authResult = await auth.signInWithWechat!(wechatCode);

      if (authResult.user) {
        // 保存用户信息到数据库
        await db.insert("users", {
          name: authResult.user.name,
          avatar: authResult.user.avatar,
          createdAt: new Date(),
        });
      }
    } else {
      // 国际版：邮箱注册
      const email = "user@example.com";
      const password = "secure-password";
      const authResult = await auth.signUpWithEmail!(email, password);

      if (authResult.user) {
        // 保存用户信息到数据库
        await db.insert("users", {
          name: authResult.user.name,
          email: authResult.user.email,
          createdAt: new Date(),
        });
      }
    }
  };

  // 步骤 2: 用户付费
  const handlePayment = async (userId: string) => {
    const amount = 9.99; // 价格会根据区域自动转换货币
    const order = await payment.createOrder(amount, userId);

    console.log("创建订单:", order.orderId);
    console.log("支付金额:", formatAmount(amount));

    // 根据不同区域跳转到不同的支付页面
    if (isChinaRegion() && order.formHtml) {
      // 支付宝支付
      const div = document.createElement("div");
      div.innerHTML = order.formHtml;
      document.body.appendChild(div);
      const form = div.querySelector("form");
      form?.submit();
    } else if (order.paymentUrl) {
      // PayPal 支付
      window.location.href = order.paymentUrl;
    }
  };

  // 步骤 3: 支付成功后更新用户状态
  const handlePaymentSuccess = async (userId: string, orderId: string) => {
    // 验证支付
    const paymentResult = await payment.verifyPayment({ orderId });

    if (paymentResult.success) {
      // 更新用户的会员状态
      await db.update("users", userId, {
        isPro: true,
        subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
      });

      console.log("用户已升级为 Pro 会员");
    }
  };

  // 步骤 4: 使用 AI 功能
  const handleAIChat = async (userMessage: string) => {
    const ai = getAI();
    const messages: AIMessage[] = [{ role: "user", content: userMessage }];

    const response = await ai.chat(messages);
    console.log("AI 回复:", response.content);

    // 保存对话历史
    await db.insert("conversations", {
      userId: "current-user-id",
      userMessage,
      aiResponse: response.content,
      model: response.model,
      createdAt: new Date(),
    });
  };
}

// ========== 6. 区域检测和配置示例 ==========

import {
  DEPLOY_REGION,
  RegionConfig,
  printRegionConfig,
  validateRegionConfig,
} from "@/lib/config/region";

export function RegionInfo() {
  // 获取当前部署区域
  console.log("部署区域:", DEPLOY_REGION);

  // 检查区域
  if (isChinaRegion()) {
    console.log("当前运行在中国版本");
  } else {
    console.log("当前运行在国际版本");
  }

  // 打印配置信息
  printRegionConfig();
  /* 输出示例：
  🌍 ========== 区域配置信息 ==========
  📍 当前区域: 中国 🇨🇳
  🔐 认证服务: cloudbase
  💾 数据库服务: cloudbase
  💰 支付服务: alipay
  🤖 AI 服务: deepseek
  ========================================
  */

  // 验证配置
  const validation = validateRegionConfig();
  if (!validation.valid) {
    console.error("配置错误:");
    validation.errors.forEach((error) => console.error(error));
  }

  // 访问区域配置
  console.log("认证提供商:", RegionConfig.auth.provider);
  console.log("支付提供商:", RegionConfig.payment.primary);
  console.log("AI 可用模型:", RegionConfig.ai.availableModels);
  console.log("重定向URL:", RegionConfig.redirectUrls);
}
