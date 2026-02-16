// app/api/payment/wechat/query/route.ts
// 查询微信支付订单状态

import { NextRequest, NextResponse } from 'next/server';
import { WechatProviderV3 } from '@/lib/architecture-modules/layers/third-party/payment/providers/wechat-provider-v3';
import { getDatabase } from '@/lib/cloudbase-service';
import { z } from 'zod';
import { requireAuth, createAuthErrorResponse } from '@/lib/auth';

export const runtime = 'nodejs';

// 验证查询参数
const querySchema = z.object({
  out_trade_no: z.string().min(1, 'out_trade_no is required'),
});

/**
 * GET /api/payment/wechat/query?out_trade_no=xxx
 * 查询支付订单状态
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!authResult) {
      return createAuthErrorResponse();
    }
    const { user } = authResult;

    // 1. 解析查询参数
    const searchParams = request.nextUrl.searchParams;
    const out_trade_no = searchParams.get('out_trade_no');

    const validationResult = querySchema.safeParse({ out_trade_no });
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
    const validatedOutTradeNo = validationResult.data.out_trade_no;

    // 2. 从 CloudBase 查询订单信息（必须属于当前登录用户）
    let localPayment: any = null;

    try {
      const db = getDatabase();
      const result = await db
        .collection('payments')
        .where({ out_trade_no: validatedOutTradeNo, user_id: user.id })
        .get();

      localPayment = result.data?.[0];
    } catch (error) {
      console.error('Error querying CloudBase payment:', error);
    }

    if (!localPayment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Payment record not found',
        },
        { status: 404 }
      );
    }

    // 3. 初始化微信支付提供商
    const wechatProvider = new WechatProviderV3({
      appId: process.env.WECHAT_APP_ID!,
      mchId: process.env.WECHAT_PAY_MCH_ID!,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY!,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY!,
      serialNo: process.env.WECHAT_PAY_SERIAL_NO!,
      notifyUrl: `${process.env.APP_URL}/api/payment/webhook/wechat`,
    });

    // 4. 查询微信支付订单状态
    const paymentStatus = await wechatProvider.queryOrderByOutTradeNo(validatedOutTradeNo);

    // 5. 如果微信报告支付成功但本地数据库还没更新，则更新
    if (
      paymentStatus.tradeState === 'SUCCESS' &&
      localPayment &&
      localPayment.status !== 'completed'
    ) {
      const updatedPayment = {
        status: 'completed',
        transaction_id: paymentStatus.transactionId,
        updated_at: new Date().toISOString(),
      };

      try {
        const db = getDatabase();
        if (localPayment._id) {
          await db.collection('payments').doc(localPayment._id).update(updatedPayment);
        } else {
          await db
            .collection('payments')
            .where({ out_trade_no: validatedOutTradeNo, user_id: user.id })
            .update(updatedPayment);
        }

        localPayment = { ...localPayment, ...updatedPayment };
      } catch (error) {
        console.error('Error updating CloudBase payment:', error);
      }
    }

    // 6. 返回订单状态
    return NextResponse.json(
      {
        success: true,
        out_trade_no: validatedOutTradeNo,
        status: mapTradeStateToPaymentStatus(paymentStatus.tradeState),
        trade_state: paymentStatus.tradeState,
        transaction_id: paymentStatus.transactionId,
        amount: paymentStatus.amount ? paymentStatus.amount / 100 : localPayment?.amount,
        success_time: paymentStatus.successTime,
        local_status: localPayment?.status,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('WeChat payment query error:', error);
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
 * 将微信支付状态映射到通用支付状态
 */
function mapTradeStateToPaymentStatus(tradeState: string): string {
  const stateMap: Record<string, string> = {
    'SUCCESS': 'completed',
    'NOTPAY': 'pending',
    'CLOSED': 'failed',
    'REFUND': 'refunded',
    'REVOKED': 'failed',
    'USERPAYING': 'pending',
    'PAYERROR': 'failed',
  };

  return stateMap[tradeState] || 'unknown';
}
