let initialized = false;
let Sentry: any = null;

export function initSentry() {
  try {
    if (initialized) return;

    // 仅在服务器端初始化
    if (typeof window !== "undefined") {
      initialized = true;
      return;
    }

    const dsn = process.env.SENTRY_DSN || "";
    if (!dsn) {
      // Not configured; skip
      initialized = true;
      return;
    }

    // 动态导入 Sentry（避免在客户端打包时加载）
    try {
      Sentry = require("@sentry/node");
      Sentry.init({
        dsn,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.0),
      });
      initialized = true;
    } catch (e) {
      console.warn("Sentry import/init failed", e);
      initialized = true;
    }
  } catch (e) {
    // swallow init errors to avoid crashing endpoints
    // eslint-disable-next-line no-console
    console.warn("Sentry init failed", e);
  }
}

export function captureException(err: unknown) {
  try {
    if (!initialized) {
      initSentry();
    }
    if (!Sentry) return;
    Sentry.captureException(err);
  } catch (e) {
    // ignore
  }
}
