#!/usr/bin/env node
import { runOpenRouterImportCli } from "../lib/importers/openrouter";

runOpenRouterImportCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
