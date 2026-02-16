const CONSOLE_METHODS = [
  "log",
  "info",
  "debug",
  "warn",
  "error",
  "trace",
  "table",
  "dir",
  "dirxml",
  "group",
  "groupCollapsed",
  "groupEnd",
  "time",
  "timeLog",
  "timeEnd",
  "count",
  "countReset",
  "assert",
  "clear",
  "profile",
  "profileEnd",
] as const;

export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  const globalRef = globalThis as typeof globalThis & {
    __consoleSilencedInProd?: boolean;
    console: Console;
  };

  if (globalRef.__consoleSilencedInProd) return;
  globalRef.__consoleSilencedInProd = true;

  const noop = () => {};
  const consoleRef = globalRef.console;

  for (const method of CONSOLE_METHODS) {
    const fn = (consoleRef as any)[method];
    if (typeof fn === "function") {
      (consoleRef as any)[method] = noop;
    }
  }
}
