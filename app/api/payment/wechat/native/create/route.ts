// app/api/payment/wechat/native/create/route.ts
// NATIVE 支付（PC扫码支付）- 创建支付订单

import { NextRequest, NextResponse } from 'next/server';
import { WechatProviderV3 } from '@/lib/architecture-modules/layers/third-party/payment/providers/wechat-provider-v3';
import { requireAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/cloudbase-service';
import { z } from 'zod';

export const runtime = 'nodejs';

// 验证请求体
const createNativePaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('CNY'),
  description: z.string().min(1, 'Description is required'),
});

interface PaymentCreateRequest {
  amount: number;
  currency?: string;
  description: string;
}

/**
 * POST /api/payment/wechat/native/create
 * 创建 NATIVE 支付订单（PC扫码支付）
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const authResult = await requireAuth(request);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user } = authResult;
    const userId = user.id;

    // 2. 验证请求参数
    const body = await request.json();
    const validationResult = createNativePaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { amount, currency = 'CNY', description }: PaymentCreateRequest = validationResult.data;

    // 只支持人民币
    if (currency !== 'CNY') {
      return NextResponse.json(
        { error: 'Only CNY currency is supported for WeChat Native payment' },
        { status: 400 }
      );
    }

    // 3. 检查重复支付请求（过去60秒内）
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    let recentPayments: any[] = [];

    try {
      const db = getDatabase();
      const _ = db.command;

      const result = await db
        .collection('payments')
        .where({
          user_id: userId,
          amount: amount,
          currency: currency,
          payment_method: 'wechat',
          client_type: 'native',
          created_at: _.gte(oneMinuteAgo),
          status: _.in(['pending', 'completed']),
        })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      recentPayments = result.data || [];
    } catch (error) {
      console.error('Error checking CloudBase payment:', error);
    }

    if (recentPayments.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Duplicate payment request within 60 seconds',
          code: 'DUPLICATE_PAYMENT',
          waitTime: 60,
        },
        { status: 429 }
      );
    }

    // 4. 生成商户订单号
    const out_trade_no = generateOrderNo();

    // 5. 初始化微信支付提供商
    const wechatProvider = new WechatProviderV3({
      appId: process.env.WECHAT_APP_ID!,
      mchId: process.env.WECHAT_PAY_MCH_ID!,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY!,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY!,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO!,
      notifyUrl: `${process.env.APP_URL}/api/payment/webhook/wechat`,
    });

    // 6. 调用微信 API 创建 NATIVE 支付订单
    const wechatResponse = await wechatProvider.createNativePayment({
      out_trade_no,
      amount: Math.round(amount * 100), // 转换为分
      description,
    });

    // 7. 保存订单到 CloudBase
    try {
      const db = getDatabase();
      await db.collection('payments').add({
        out_trade_no,
        user_id: userId,
        amount,
        currency,
        payment_method: 'wechat',
        client_type: 'native',
        status: 'pending',
        code_url: wechatResponse.codeUrl,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving payment to CloudBase:', error);
      // 继续处理，因为订单已经在微信创建
    }

    // 8. 返回二维码链接给前端
    return NextResponse.json(
      {
        success: true,
        out_trade_no,
        code_url: wechatResponse.codeUrl,
        amount,
        currency,
        expires_in: 7200, // 二维码有效期：2小时
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('WeChat Native payment creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * 生成商户订单号
 * 格式: WX + 时间戳 + 随机数
 */
function generateOrderNo(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `WX${timestamp}${random}`;
}
