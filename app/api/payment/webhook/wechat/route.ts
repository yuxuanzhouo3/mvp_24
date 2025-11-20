// app/api/payment/webhook/wechat/route.ts
// 微信支付 Webhook 回调处理 (API v3)

import { NextRequest, NextResponse } from "next/server";
import { WechatProviderV3 } from "@/lib/architecture-modules/layers/third-party/payment/providers/wechat-provider-v3";
import { getDatabase } from "@/lib/cloudbase-service";

// WeChat Webhook 依赖 Node.js 运行时
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // 1. 获取 Webhook 签名信息
    const signature = request.headers.get("Wechatpay-Signature") || "";
    const timestamp = request.headers.get("Wechatpay-Timestamp") || "";
    const nonce = request.headers.get("Wechatpay-Nonce") || "";

    // 2. 读取请求体
    const body = await request.text();

    console.log("Received WeChat webhook:", {
      timestamp,
      nonce,
      bodyLength: body.length,
    });

    // 3. 初始化微信支付提供商用于验证签名
    const wechatProvider = new WechatProviderV3({
      appId: process.env.WECHAT_APP_ID!,
      mchId: process.env.WECHAT_PAY_MCH_ID!,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY!,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY!,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO!,
      notifyUrl: `${process.env.APP_URL}/api/payment/webhook/wechat`,
    });

    // 4. 验证签名
    if (!wechatProvider.verifyWebhookSignature(body, signature, timestamp, nonce)) {
      console.error("WeChat webhook signature verification failed");
      return NextResponse.json(
        { code: "FAIL", message: "Invalid signature" },
        { status: 401 }
      );
    }

    // 5. 解析 Webhook 数据
    const webhookData = JSON.parse(body);

    console.log("WeChat webhook event_type:", webhookData.event_type);

    // 6. 仅处理支付成功事件
    if (webhookData.event_type !== "TRANSACTION.SUCCESS") {
      console.log("Ignoring WeChat webhook event:", webhookData.event_type);
      return NextResponse.json({ code: "SUCCESS", message: "Ok" }, { status: 200 });
    }

    // 7. 解密回调数据
    let paymentData: any;
    try {
      paymentData = await wechatProvider.handleWebhookNotification(webhookData);
    } catch (error) {
      console.error("Failed to decrypt WeChat webhook data:", error);
      return NextResponse.json(
        { code: "FAIL", message: "Decryption failed" },
        { status: 400 }
      );
    }

    console.log("Decrypted WeChat payment data:", {
      out_trade_no: paymentData.out_trade_no,
      transaction_id: paymentData.transaction_id,
      trade_state: paymentData.trade_state,
      amount: paymentData.amount?.total,
    });

    // 8. 检查交易状态
    if (paymentData.trade_state !== "SUCCESS") {
      console.log("WeChat payment not successful:", paymentData.trade_state);
      return NextResponse.json({ code: "SUCCESS", message: "Ok" }, { status: 200 });
    }

    // 9. 幂等性检查：防止重复处理
    const webhookEventId = `wechat_${paymentData.transaction_id}`;
    let eventExists = false;

    try {
      const db = getDatabase();
      const result = await db
        .collection("webhook_events")
        .where({ id: webhookEventId })
        .get();

      eventExists = (result.data?.length || 0) > 0;
    } catch (error) {
      console.error("Error checking CloudBase webhook event:", error);
    }

    if (eventExists) {
      console.log("WeChat webhook event already processed:", webhookEventId);
      return NextResponse.json({ code: "SUCCESS", message: "Ok" }, { status: 200 });
    }

    // 10. 记录 Webhook 事件到 CloudBase
    const webhookEvent = {
      id: webhookEventId,
      provider: "wechat",
      event_type: "TRANSACTION.SUCCESS",
      event_data: paymentData,
      processed: false,
      created_at: new Date().toISOString(),
    };

    try {
      const db = getDatabase();
      await db.collection("webhook_events").add(webhookEvent);
    } catch (error) {
      console.error("Error saving CloudBase webhook event:", error);
    }

    // 11. 更新支付订单状态到 CloudBase
    const updateData = {
      status: "completed",
      transaction_id: paymentData.transaction_id,
      updated_at: new Date().toISOString(),
    };

    try {
      const db = getDatabase();
      await db
        .collection("payments")
        .where({ out_trade_no: paymentData.out_trade_no })
        .update(updateData);

      console.log("Updated CloudBase payment status:", paymentData.out_trade_no);
    } catch (error) {
      console.error("Error updating CloudBase payment:", error);
    }

    // 12. 获取支付订单信息（包含user_id和billingCycle）
    const amount = paymentData.amount?.total ? paymentData.amount.total / 100 : 0;
    let paymentRecord: any = null;
    let days = 30; // 默认30天

    try {
      const db = getDatabase();
      const result = await db
        .collection("payments")
        .where({ out_trade_no: paymentData.out_trade_no })
        .get();

      paymentRecord = result.data?.[0];
    } catch (error) {
      console.error("Error querying payment record:", error);
    }

    if (!paymentRecord || !paymentRecord.user_id) {
      console.error("Payment record not found or missing user_id");
      return NextResponse.json(
        { code: "FAIL", message: "Payment record not found" },
        { status: 400 }
      );
    }

    const userId = paymentRecord.user_id;

    // 13. 从支付记录中获取billingCycle，计算订阅天数
    // ✅ 修复：从payment record中读取billingCycle，而不是从金额推断
    // 优先级：billing_cycle (顶层字段) > metadata.billingCycle > 默认monthly
    const billingCycle = paymentRecord.billing_cycle ||
                         paymentRecord.metadata?.billingCycle ||
                         "monthly";

    if (billingCycle === "yearly") {
      days = 365;
      console.log("WeChat webhook: Using yearly billing cycle (365 days)", {
        out_trade_no: paymentData.out_trade_no,
        billingCycle,
      });
    } else {
      days = 30;
      console.log("WeChat webhook: Using monthly billing cycle (30 days)", {
        out_trade_no: paymentData.out_trade_no,
        billingCycle,
      });
    }

    // 14. 架构：subscriptions 表是源数据，web_users 是派生数据
    // STEP 1: 获取用户当前订阅（从源数据 subscriptions 读取）
    // 使用从payment record读取的days值，确保yearly支付添加365天
    let currentExpiresAt: Date | null = null;
    let subscriptionId: string | null = null;
    try {
      const db = getDatabase();
      const existingSubscription = await db
        .collection("subscriptions")
        .where({
          user_id: userId,
          plan_id: "pro",
        })
        .get();

      if (existingSubscription.data && existingSubscription.data.length > 0) {
        const subscription = existingSubscription.data[0];
        currentExpiresAt = new Date(subscription.current_period_end);
        subscriptionId = subscription._id;
      }
    } catch (error) {
      console.error("Error fetching existing subscription:", error);
    }

    // 计算新的到期时间（基于现有订阅或从现在开始）
    const now = new Date();
    let newExpiresAt: Date;

    if (currentExpiresAt && currentExpiresAt > now) {
      // 如果已有有效订阅，从现有到期时间延长
      newExpiresAt = new Date(currentExpiresAt);
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      console.log("Extending existing subscription for user:", userId, "days:", days);
    } else {
      // 如果没有有效订阅或已过期，从现在起计算
      newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + days);
      console.log("Creating new subscription for user:", userId, "days:", days);
    }

    // STEP 2: 更新或创建 subscriptions 记录（源数据优先）
    try {
      const db = getDatabase();
      const currentDate = new Date();

      if (subscriptionId) {
        // 更新现有订阅记录
        await db
          .collection("subscriptions")
          .doc(subscriptionId)
          .update({
            current_period_end: newExpiresAt.toISOString(),
            transaction_id: paymentData.transaction_id,
            updated_at: currentDate.toISOString(),
          });

        console.log("Updated subscription (source of truth) for user:", userId, "subscriptionId:", subscriptionId, "expiresAt:", newExpiresAt.toISOString());
      } else {
        // 创建新订阅记录
        await db.collection("subscriptions").add({
          user_id: userId,
          plan_id: "pro",
          status: "active",
          current_period_start: currentDate.toISOString(),
          current_period_end: newExpiresAt.toISOString(),
          cancel_at_period_end: false,
          payment_method: "wechat",
          transaction_id: paymentData.transaction_id,
          created_at: currentDate.toISOString(),
          updated_at: currentDate.toISOString(),
        });

        console.log("Created subscription (source of truth) for user:", userId, "expiresAt:", newExpiresAt.toISOString());
      }
    } catch (error) {
      console.error("Error managing subscription (source of truth):", error);
      // 不中断流程，但需要记录错误
    }

    // STEP 3: 同步到 web_users（派生数据）
    try {
      const db = getDatabase();
      const webUsersCollection = db.collection("web_users");

      const userQuery = await webUsersCollection
        .where({ _id: userId })
        .get();

      if (userQuery.data && userQuery.data.length > 0) {
        await webUsersCollection.doc(userId).update({
          membership_expires_at: newExpiresAt.toISOString(),
          pro: true,
          updated_at: new Date().toISOString(),
        });

        console.log("Synced membership time to web_users (derived data) for user:", userId, "expiresAt:", newExpiresAt.toISOString());
      }
    } catch (error) {
      console.error("Error extending membership:", error);
    }

    // 16. 标记 Webhook 事件为已处理
    try {
      const db = getDatabase();
      await db
        .collection("webhook_events")
        .where({ id: webhookEventId })
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error("Error updating CloudBase webhook event:", error);
    }

    // 17. 返回成功响应给微信
    return NextResponse.json(
      {
        code: "SUCCESS",
        message: "Ok",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("WeChat webhook processing error:", error);

    // 返回失败响应，微信会继续重试
    return NextResponse.json(
      {
        code: "FAIL",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
