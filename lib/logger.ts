// lib/logger.ts - 统一的日志系统
// 在生产环境和Edge Runtime中总是使用简单的console logger
const isEdgeRuntime =
  process.env.NODE_ENV === "production" ||
  (typeof window === "undefined" &&
    typeof process !== "undefined" &&
    process.env.LAMBDA_TASK_ROOT);

// 简单的Edge Runtime兼容logger
class EdgeLogger {
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  error(message: string, meta?: any) {
    console.error(this.formatMessage("error", message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage("warn", message, meta));
  }

  info(message: string, meta?: any) {
    console.info(this.formatMessage("info", message, meta));
  }

  debug(message: string, meta?: any) {
    console.debug(this.formatMessage("debug", message, meta));
  }

  http(message: string, meta?: any) {
    console.log(this.formatMessage("http", message, meta));
  }
}

// 创建logger实例 - 在生产环境和Edge Runtime中直接使用EdgeLogger
export const logger = isEdgeRuntime
  ? new EdgeLogger()
  : (() => {
      // 在开发环境的Node.js中，使用winston
      try {
        // 使用动态导入语法，但为了兼容性，我们使用条件require
        if (typeof require === "function") {
          const winston = require("winston");
          const DailyRotateFile = require("winston-daily-rotate-file");
          const path = require("path");

          // 日志级别
          const levels = {
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            debug: 4,
          };

          // 日志颜色
          const colors = {
            error: "red",
            warn: "yellow",
            info: "green",
            http: "magenta",
            debug: "white",
          };

          // 添加颜色到winston
          winston.addColors(colors);

          // 日志格式
          const format = winston.format.combine(
            // 添加时间戳
            winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
            // 添加错误堆栈信息
            winston.format.errors({ stack: true }),
            // 添加自定义格式
            winston.format.printf((info: any) => {
              const { timestamp, level, message, ...args } = info;

              // 处理错误对象
              let logMessage = message;
              if (args.error && args.error instanceof Error) {
                logMessage += `\n${args.error.stack}`;
                delete args.error;
              }

              // 处理其他元数据
              const meta = Object.keys(args).length
                ? JSON.stringify(args, null, 2)
                : "";

              return `${timestamp} ${level}: ${logMessage}${
                meta ? "\n" + meta : ""
              }`;
            })
          );

          // 控制台格式（带颜色）
          const consoleFormat = winston.format.combine(
            winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
            winston.format.errors({ stack: true }),
            winston.format.colorize({ all: true }),
            winston.format.printf((info: any) => {
              const { timestamp, level, message, ...args } = info;
              return `${timestamp} ${level}: ${message}`;
            })
          );

          // 创建日志目录
          const logsDir = path.join(process.cwd(), "logs");

          // 文件传输器
          const fileRotateTransport = new DailyRotateFile({
            filename: path.join(logsDir, "app-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxSize: "20m",
            maxFiles: "14d",
            format,
          });

          // 错误文件传输器
          const errorFileRotateTransport = new DailyRotateFile({
            filename: path.join(logsDir, "error-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            level: "error",
            maxSize: "20m",
            maxFiles: "30d",
            format,
          });

          // 控制台传输器
          const consoleTransport = new winston.transports.Console({
            format: consoleFormat,
          });

          // 创建logger实例
          return winston.createLogger({
            level: process.env.LOG_LEVEL || "info",
            levels,
            format,
            transports: [
              // 总是写入文件
              fileRotateTransport,
              errorFileRotateTransport,
              // 在开发环境下也输出到控制台
              ...(process.env.NODE_ENV !== "production"
                ? [consoleTransport]
                : []),
            ],
            // 处理未捕获的异常
            exceptionHandlers: [
              new winston.transports.File({
                filename: path.join(logsDir, "exceptions.log"),
                format,
              }),
            ],
            // 处理未处理的Promise拒绝
            rejectionHandlers: [
              new winston.transports.File({
                filename: path.join(logsDir, "rejections.log"),
                format,
              }),
            ],
          });
        } else {
          // 如果没有require函数，使用EdgeLogger
          return new EdgeLogger();
        }
      } catch (error) {
        // 如果winston加载失败，使用EdgeLogger
        console.warn(
          "Failed to load winston logger, falling back to console logger"
        );
        return new EdgeLogger();
      }
    })();

// 便捷方法
export const logError = (message: string, error?: Error, meta?: any) => {
  logger.error(message, { error, ...meta });
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

// HTTP请求日志中间件
export const httpLogger = (req: any, res: any, next?: any) => {
  const start = Date.now();

  // 记录请求开始
  logger.http(`Request: ${req.method} ${req.url}`, {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  // 记录响应结束
  if (res && typeof res.on === "function") {
    res.on("finish", () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;

      logger.http(`Response: ${req.method} ${req.url} ${statusCode}`, {
        duration: `${duration}ms`,
        statusCode,
        ip: req.ip || req.connection?.remoteAddress,
      });
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
  logger.info(`Performance: ${operation}`, {
    duration: `${duration}ms`,
    ...meta,
  });
};

// 业务事件日志
export const logBusinessEvent = (
  event: string,
  userId?: string,
  meta?: any
) => {
  logger.info(`Business Event: ${event}`, {
    userId,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// 安全事件日志
export const logSecurityEvent = (
  event: string,
  userId?: string,
  ip?: string,
  meta?: any
) => {
  logger.warn(`Security Event: ${event}`, {
    userId,
    ip,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};
