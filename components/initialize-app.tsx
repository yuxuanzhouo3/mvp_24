'use client';

import { useEffect } from 'react';

/**
 * 应用初始化组件
 * 在客户端运行时执行初始化代码（支付提供商等）
 * 这样可以避免在 Next.js 构建时执行这些代码
 *
 * 注意：Sentry 和安全检查在服务器端单独初始化
 */
export default function InitializeApp() {
  useEffect(() => {
    // 仅在客户端执行一次
    const initializeApp = async () => {
      try {
        // 初始化支付提供商（仅在客户端需要初始化）
        const { initializePaymentProviders } = await import('@/lib/payment/init');
        initializePaymentProviders();
      } catch (error) {
        console.warn('Failed to initialize payment providers:', error);
        // 初始化失败不应该阻塞应用
      }
    };

    initializeApp();
  }, []);

  // 这个组件不渲染任何内容
  return null;
}
