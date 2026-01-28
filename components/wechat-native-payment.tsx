/**
 * components/wechat-native-payment.tsx
 * 微信 NATIVE 支付组件 (PC扫码支付)
 *
 * 使用方式:
 * <WechatNativePayment amount={99.99} description="Pro Plan" />
 */

'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';

interface WechatNativePaymentProps {
  amount: number;                    // 金额（元）
  description: string;               // 商品描述
  onSuccess?: (data: any) => void;   // 支付成功回调
  onError?: (error: string) => void; // 出错回调
  pollInterval?: number;             // 轮询间隔（ms）
  pollTimeout?: number;              // 轮询超时（ms）
}

interface PaymentState {
  status: 'idle' | 'loading' | 'showing_qr' | 'polling' | 'success' | 'error';
  outTradeNo?: string;
  codeUrl?: string;
  error?: string;
  pollCount?: number;
  expiresIn?: number;
}

export function WechatNativePayment({
  amount,
  description,
  onSuccess,
  onError,
  pollInterval = 2000,        // 默认2秒检查一次
  pollTimeout = 7200000,      // 默认2小时超时
}: WechatNativePaymentProps) {
  const [state, setState] = useState<PaymentState>({ status: 'idle' });
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  /**
   * 开始支付流程
   */
  const handleStartPayment = async () => {
    try {
      setState({ status: 'loading' });

      // 1. 调用后端创建支付订单
      const response = await fetch('/api/payment/wechat/native/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          currency: 'CNY',
          description,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment');
      }

      const data = await response.json();

      if (!data.success || !data.code_url) {
        throw new Error('Invalid response from server');
      }

      console.log('Payment order created:', data.out_trade_no);

      // 2. 显示二维码
      setState({
        status: 'showing_qr',
        outTradeNo: data.out_trade_no,
        codeUrl: data.code_url,
        expiresIn: data.expires_in,
      });

      // 3. 开始轮询检查支付状态
      setRemainingTime(data.expires_in);
      pollPaymentStatus(data.out_trade_no, pollInterval, pollTimeout);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Payment creation error:', errorMessage);

      setState({
        status: 'error',
        error: errorMessage,
      });

      onError?.(errorMessage);
    }
  };

  /**
   * 轮询检查支付状态
   */
  const pollPaymentStatus = (
    outTradeNo: string,
    interval: number,
    timeout: number
  ) => {
    setState((prev) => ({
      ...prev,
      status: 'polling',
      pollCount: 0,
    }));

    const startTime = Date.now();
    let pollCount = 0;

    const poll = async () => {
      try {
        pollCount++;

        const response = await fetch(
          `/api/payment/wechat/query?out_trade_no=${outTradeNo}`
        );

        if (!response.ok) {
          throw new Error('Failed to query payment status');
        }

        const data = await response.json();

        console.log(`Payment status check #${pollCount}:`, data.status);

        // 支付成功
        if (data.status === 'completed' || data.trade_state === 'SUCCESS') {
          console.log('Payment succeeded!');

          setState({
            status: 'success',
            outTradeNo,
          });

          onSuccess?.({
            outTradeNo,
            transactionId: data.transaction_id,
            amount,
          });

          return;
        }

        // 检查超时
        if (Date.now() - startTime > timeout) {
          throw new Error('Payment status check timeout. Please try again.');
        }

        // 继续轮询
        setState((prev) => ({
          ...prev,
          pollCount,
        }));

        setTimeout(poll, interval);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Payment status check error:', errorMessage);

        setState({
          status: 'error',
          error: errorMessage,
          outTradeNo,
        });

        onError?.(errorMessage);
      }
    };

    poll();
  };

  /**
   * 倒计时显示二维码有效期
   */
  useEffect(() => {
    if (state.status !== 'showing_qr' && state.status !== 'polling') {
      return;
    }

    if (remainingTime === null || remainingTime <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingTime((prev) => (prev ? prev - 1000 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [state.status, remainingTime]);

  /**
   * 格式化时间显示
   */
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto p-6">
      {/* 初始状态：显示支付按钮 */}
      {state.status === 'idle' && (
        <button
          onClick={handleStartPayment}
          className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
        >
          微信支付 ¥{amount.toFixed(2)}
        </button>
      )}

      {/* 加载状态 */}
      {state.status === 'loading' && (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin">⏳</div>
          <p className="text-gray-600">生成二维码中...</p>
        </div>
      )}

      {/* 显示二维码 */}
      {(state.status === 'showing_qr' || state.status === 'polling') && state.codeUrl && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="border-2 border-gray-300 p-4 rounded-lg bg-white">
            <QRCode value={state.codeUrl} size={256} level="H" includeMargin={true} />
          </div>

          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">扫一扫完成支付</h3>
            <p className="text-sm text-gray-600 mb-3">用微信扫描上面的二维码</p>

            {remainingTime !== null && (
              <p className="text-sm text-orange-600">
                二维码有效期: {formatTime(remainingTime)}
              </p>
            )}

            {state.status === 'polling' && state.pollCount && (
              <p className="text-xs text-gray-400 mt-2">
                已检查 {state.pollCount} 次...
              </p>
            )}
          </div>

          <button
            onClick={() => setState({ status: 'idle' })}
            className="text-sm text-gray-500 hover:text-gray-700 underline mt-2"
          >
            取消支付
          </button>
        </div>
      )}

      {/* 成功状态 */}
      {state.status === 'success' && (
        <div className="flex flex-col items-center gap-4 w-full py-8">
          <div className="text-5xl">✅</div>
          <h3 className="text-2xl font-bold text-green-600">支付成功</h3>
          <p className="text-gray-600 text-center">
            感谢您的购买，您已升级为 Pro 用户
          </p>
          <p className="text-sm text-gray-500 break-all">
            订单号: {state.outTradeNo}
          </p>

          <button
            onClick={() => {
              setState({ status: 'idle' });
              // 可以这里跳转到成功页面
              // window.location.href = '/payment/success';
            }}
            className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            返回
          </button>
        </div>
      )}

      {/* 错误状态 */}
      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-4 w-full py-8">
          <div className="text-5xl">❌</div>
          <h3 className="text-2xl font-bold text-red-600">支付失败</h3>
          <p className="text-gray-600 text-center">{state.error}</p>

          <button
            onClick={() => setState({ status: 'idle' })}
            className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重新支付
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 简化版组件：只返回支付按钮和二维码
 */
export function WechatNativePaymentSimple({
  amount,
  description,
}: Omit<WechatNativePaymentProps, 'onSuccess' | 'onError' | 'pollInterval' | 'pollTimeout'>) {
  const handleSuccess = (data: any) => {
    console.log('Payment succeeded:', data);
    // 跳转到成功页面
    window.location.href = '/payment/success';
  };

  const handleError = (error: string) => {
    console.error('Payment error:', error);
    alert(`支付失败: ${error}`);
  };

  return (
    <WechatNativePayment
      amount={amount}
      description={description}
      onSuccess={handleSuccess}
      onError={handleError}
    />
  );
}
