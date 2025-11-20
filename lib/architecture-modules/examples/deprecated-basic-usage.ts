// lib/architecture-modules/examples/basic-usage.ts - 基础使用示例
// ⚠️ DEPRECATED: 此示例已弃用，请使用 basic-usage-new.ts
// 主要变更：
// - APP_URL 现在自动检测，无需手动配置
// - 使用 createDatabaseConnector 替代 createDatabaseAdapter
// - 应用需要实现自己的数据访问层
import {
  geoRouter,
  createEnvironmentLoader,
  createDatabaseConnector,
  paymentRouter,
} from "../index";

/**
 * 基础使用示例：处理用户请求的完整流程
 *
 * ⚠️ 此示例已弃用，请查看 basic-usage-new.ts 获取最新用法
 */
export async function handleUserRequest(userIP: string, userId: string) {
  try {
    // 1. 地理位置检测
    console.log("🔍 检测用户地理位置...");
    const geoResult = await geoRouter.detect(userIP);
    console.log("📍 检测结果:", geoResult);

    // 2. 加载环境配置
    console.log("⚙️ 加载环境配置...");
    const envLoader = await createEnvironmentLoader(userIP);
    const config = envLoader.load();
    console.log("✅ 配置加载完成");

    // 3. 初始化数据库适配器
    console.log("💾 初始化数据库...");
    const dbAdapter = createDatabaseConnector(geoResult.database, {
      type: geoResult.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });
    await dbAdapter.initialize({
      type: geoResult.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });
    console.log("✅ 数据库初始化完成");

    // 4. 获取用户数据
    console.log("📚 获取用户收藏...");
    // ⚠️ 注意：在新版本中，DatabaseConnector 不再提供 getFavorites 方法
    // 应用需要实现自己的数据访问层，请参考 basic-usage-new.ts
    // const favorites = await dbAdapter.getFavorites(userId);
    const favorites: any[] = []; // 占位符
    console.log(`✅ 获取到 ${favorites.length} 个收藏`);

    // 5. 检查订阅状态
    console.log("🎫 检查订阅状态...");
    // ⚠️ 注意：在新版本中，DatabaseConnector 不再提供 getSubscription 方法
    // 应用需要实现自己的数据访问层，请参考 basic-usage-new.ts
    // const subscription = await dbAdapter.getSubscription(userId);
    const subscription = null; // 占位符
    console.log("📊 订阅状态:", subscription ? "VIP" : "免费用户");

    // 6. 如果需要支付，创建支付订单
    if (!subscription && geoResult.paymentMethods.length > 0) {
      console.log("💰 创建支付订单...");
      const paymentResult = await paymentRouter.createPayment(
        geoResult.region,
        {
          amount: 168,
          currency: geoResult.currency,
          description: "Pro Plan Yearly",
          userId,
          planType: "pro",
          billingCycle: "yearly",
        }
      );

      if (paymentResult.success) {
        console.log("✅ 支付订单创建成功:", paymentResult.paymentId);
        return {
          success: true,
          data: {
            favorites,
            subscription,
            payment: paymentResult,
          },
        };
      }
    }

    return {
      success: true,
      data: {
        favorites,
        subscription,
      },
    };
  } catch (error) {
    console.error("❌ 处理用户请求失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Next.js API Route 使用示例
 */
export async function apiHandler(request: Request) {
  // 获取客户端IP
  const clientIP =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  // 处理请求
  const result = await handleUserRequest(clientIP, "user-123");

  return Response.json(result);
}

/**
 * React Hook 使用示例
 */
export function useGeoArchitecture(userId: string) {
  // 在React组件中使用
  // const { geo, config, dbAdapter } = useGeoArchitecture(userId);
}
