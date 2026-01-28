// lib/logger.ts - 统一的日志系统
// 完全兼容 Edge Runtime 和所有环境的轻量级日志库

// 通用日志类（兼容所有环境）
class UniversalLogger {
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  error(message: any, meta?: any) {
    if (typeof message === "object" && meta) {
      console.error(this.formatMessage("error", meta, message));
    } else if (typeof message === "object") {
      console.error(this.formatMessage("error", JSON.stringify(message), undefined));
    } else {
      console.error(this.formatMessage("error", message, meta));
    }
  }

  warn(message: any, meta?: any) {
    if (typeof message === "object" && meta) {
      console.warn(this.formatMessage("warn", meta, message));
    } else if (typeof message === "object") {
      console.warn(this.formatMessage("warn", JSON.stringify(message), undefined));
    } else {
      console.warn(this.formatMessage("warn", message, meta));
    }
  }

  info(message: any, meta?: any) {
    if (typeof message === "object" && meta) {
      console.info(this.formatMessage("info", meta, message));
    } else if (typeof message === "object") {
      console.info(this.formatMessage("info", JSON.stringify(message), undefined));
    } else {
      console.info(this.formatMessage("info", message, meta));
    }
  }

  debug(message: any, meta?: any) {
    if (typeof message === "object" && meta) {
      console.debug(this.formatMessage("debug", meta, message));
    } else if (typeof message === "object") {
      console.debug(this.formatMessage("debug", JSON.stringify(message), undefined));
    } else {
      console.debug(this.formatMessage("debug", message, meta));
    }
  }

  http(message: any, meta?: any) {
    if (typeof message === "object" && meta) {
      console.log(this.formatMessage("http", meta, message));
    } else if (typeof message === "object") {
      console.log(this.formatMessage("http", JSON.stringify(message), undefined));
    } else {
      console.log(this.formatMessage("http", message, meta));
    }
  }
}

// 导出 logger 实例
export const logger = new UniversalLogger();

// 便捷方法
export const logError = (message: string, error?: Error, meta?: any) => {
  if (error instanceof Error) {
    logger.error({ err: error, ...meta }, message);
  } else {
    logger.error(message, meta);
  }
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn({ ...meta }, message);
};

export const logInfo = (message: string, meta?: any) => {
  logger.info({ ...meta }, message);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug({ ...meta }, message);
};

// HTTP 请求日志中间件
export const httpLogger = (req: any, res: any, next?: any) => {
  const start = Date.now();

  // 记录请求开始
  logger.info(
    {
      type: "http",
      method: req.method,
      url: req.url,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get ? req.get("User-Agent") : undefined,
    },
    `Request: ${req.method} ${req.url}`
  );

  // 记录响应结束
  if (res && typeof res.on === "function") {
    res.on("finish", () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      logger.info(
        {
          type: "http",
          method: req.method,
          url: req.url,
          statusCode,
          duration: `${duration}ms`,
          ip: req.ip || req.connection?.remoteAddress,
        },
        `Response: ${req.method} ${req.url} ${statusCode} (${duration}ms)`
      );
    });
  }

  if (next) next();
};

// 性能监控日志
export const logPerformance = (
  operation: string,
  duration: number,
  meta?: any
) => {
  logger.info(
    {
      type: "performance",
      operation,
      duration: `${duration}ms`,
      ...meta,
    },
    `Performance: ${operation} took ${duration}ms`
  );
};

// 业务事件日志
export const logBusinessEvent = (
  event: string,
  userId?: string,
  meta?: any
) => {
  logger.info(
    {
      type: "business",
      event,
      userId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
    `Business Event: ${event}`
  );
};

// 安全事件日志
export const logSecurityEvent = (
  event: string,
  userId?: string,
  ip?: string,
  meta?: any
) => {
  logger.warn(
    {
      type: "security",
      event,
      userId,
      ip,
      timestamp: new Date().toISOString(),
      ...meta,
    },
    `Security Event: ${event}`
  );
};
