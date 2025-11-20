// lib/architecture-modules/examples/basic-usage.ts - 基础使用示例
import {
  geoRouter,
  createEnvironmentLoader,
  createDatabaseConnector,
  paymentRouter,
} from "../index";

/**
 * 基础使用示例：处理用户请求的完整流程
 *
 * 注意：APP_URL 现在是自动检测的！
 * - Vercel 部署：自动使用 VERCEL_URL
 * - 开发环境：自动使用 localhost:3000
 * - 手动配置：设置 APP_URL 环境变量覆盖自动检测
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

    // 3. 初始化数据库连接器
    console.log("💾 初始化数据库连接...");
    const dbConnector = createDatabaseConnector(geoResult.database, {
      type: geoResult.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });
    await dbConnector.initialize({
      type: geoResult.database,
      connectionString: config.SUPABASE_URL,
      envId: config.WECHAT_CLOUDBASE_ID,
    });
    console.log("✅ 数据库连接初始化完成");

    // 4. 获取数据库客户端
    const dbClient = dbConnector.getClient();

    // 5. 应用自己实现数据操作（示例）
    console.log("📚 获取用户数据...");
    const favorites = await getUserFavorites(
      dbClient,
      userId,
      geoResult.database
    );
    const subscription = await getUserSubscription(
      dbClient,
      userId,
      geoResult.database
    );
    console.log(`✅ 获取到 ${favorites.length} 个收藏`);

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
 * 应用自己的数据访问层示例
 * 每个应用可以根据自己的数据库schema实现这些函数
 */
async function getUserFavorites(
  dbClient: any,
  userId: string,
  dbType: string
): Promise<any[]> {
  if (dbType === "supabase") {
    // 应用A的表结构
    const { data, error } = await dbClient
      .from("app_a_favorites") // 应用自定义表名
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return data || [];
  } else {
    // CloudBase
    const result = await dbClient
      .collection("app_a_favorites") // 应用自定义集合名
      .where({ user_id: userId })
      .get();

    return result.data || [];
  }
}

async function getUserSubscription(
  dbClient: any,
  userId: string,
  dbType: string
): Promise<any> {
  if (dbType === "supabase") {
    // 应用A的订阅表
    const { data, error } = await dbClient
      .from("app_a_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  } else {
    // CloudBase
    const result = await dbClient
      .collection("app_a_subscriptions")
      .where({ user_id: userId, status: "active" })
      .get();

    return result.data?.[0] || null;
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
