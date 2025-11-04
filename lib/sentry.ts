import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry() {
  try {
    if (initialized) return;
    const dsn = process.env.SENTRY_DSN || "";
    if (!dsn) {
      // Not configured; skip
      initialized = true;
      return;
    }
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.0),
    });
    initialized = true;
  } catch (e) {
    // swallow init errors to avoid crashing endpoints
    // eslint-disable-next-line no-console
    console.warn("Sentry init failed", e);
  }
}

export function captureException(err: unknown) {
  try {
    if (!initialized) return;
    Sentry.captureException(err);
  } catch (e) {
    // ignore
  }
}
