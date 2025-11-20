/**
 * 配置模块统一导出
 *
 * 使用方式：
 * import { isChinaRegion, getAuthProvider, deploymentConfig } from "@/lib/config";
 */

// 部署配置
export {
  deploymentConfig,
  currentRegion,
  isChinaDeployment,
  isInternationalDeployment,
  getAuthProvider,
  getDatabaseProvider,
  isAuthFeatureSupported,
  getPaymentProviders,
  isPaymentMethodSupported,
  getFullConfig,
  type DeploymentRegion,
  type DeploymentConfig,
} from "./deployment.config";

// 区域工具函数（保持向后兼容）
export {
  isChinaRegion,
  isInternationalRegion,
  getDEPLOY_REGION,
  RegionConfig,
  validateRegionConfig,
  printRegionConfig,
  type Region,
} from "./region";
