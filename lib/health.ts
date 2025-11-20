// lib/health.ts - Health check utilities
import pkg from "../package.json";

export function checkHealth() {
  try {
    const uptime = process.uptime();
    return {
      status: "ok",
      uptime,
      time: new Date().toISOString(),
      version: pkg?.version ?? "unknown",
    };
  } catch (e) {
    // keep it serializable
    return { status: "error", error: String(e) };
  }
}
