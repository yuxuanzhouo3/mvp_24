// lib/architecture-modules/index.ts - 主入口
export * from "./core/geo-router";
export * from "./core/types";
export * from "./config/env-loader";
export * from "./layers/data-storage/adapter";
export * from "./layers/third-party/payment/router";
export * from "./layers/third-party/payment/providers/abstract/base-provider";
export * from "./layers/third-party/payment/providers/abstract/alipay-provider";
export * from "./layers/third-party/payment/providers/abstract/wechat-provider";
export * from "./layers/third-party/payment/providers/abstract/stripe-provider";
export * from "./layers/third-party/payment/providers/config-templates";
export * from "./layers/third-party/payment/services/payment-service";
export * from "./utils/ip-detection";
export * from "./utils/error-handler";

// 便捷函数
export { createEnvironmentLoader } from "./config/env-loader";
export { createDatabaseConnector } from "./layers/data-storage/adapter";

// 默认导出地理路由器
export { geoRouter as defaultGeoRouter } from "./core/geo-router";
