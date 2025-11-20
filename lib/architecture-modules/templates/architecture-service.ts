// lib/architecture-service.ts - 架构服务单例
import {
  createDatabaseConnector,
  geoRouter,
  createEnvironmentLoader,
} from "../index";

export class ArchitectureService {
  private static instance: ArchitectureService;
  private connector: any = null;
  private envLoader: any = null;

  static getInstance(): ArchitectureService {
    if (!ArchitectureService.instance) {
      ArchitectureService.instance = new ArchitectureService();
    }
    return ArchitectureService.instance;
  }

  async initializeForUser(userIP: string) {
    try {
      // 1. 检测地理位置
      const geo = await geoRouter.detect(userIP);
      console.log(`🌍 用户地区: ${geo.region}, 数据库: ${geo.database}`);

      // 2. 创建环境加载器（自动检测 APP_URL，无需手动配置）
      this.envLoader = await createEnvironmentLoader(userIP);
      const config = this.envLoader.load();

      // 3. 创建数据库连接器
      this.connector = createDatabaseConnector(geo.database, {
        type: geo.database,
        connectionString: config.SUPABASE_URL,
        envId: config.WECHAT_CLOUDBASE_ID,
      });

      // 4. 初始化连接
      await this.connector.initialize();
      console.log("✅ 数据库连接器初始化完成");

      return { geo, connector: this.connector, config };
    } catch (error) {
      console.error("❌ 架构服务初始化失败:", error);
      throw error;
    }
  }

  getConnector() {
    if (!this.connector) {
      throw new Error("架构服务未初始化，请先调用 initializeForUser()");
    }
    return this.connector;
  }

  async close() {
    if (this.connector) {
      await this.connector.close();
    }
  }
}

export const architectureService = ArchitectureService.getInstance();
