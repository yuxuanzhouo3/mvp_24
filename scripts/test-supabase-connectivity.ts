import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

function loadEnvFiles() {
  const envFiles = [".env.local", ".env"];

  for (const fileName of envFiles) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) {
        continue;
      }

      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function mask(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail) {
    return `${value.slice(0, 3)}***`;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function shortBody(body: string, max = 160) {
  if (body.length <= max) {
    return body;
  }
  return `${body.slice(0, max)}...`;
}

function formatError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") {
    return error.message;
  }

  const parts: string[] = [error.message];
  const causeObj = cause as Record<string, unknown>;
  const code = typeof causeObj.code === "string" ? causeObj.code : "";
  const syscall =
    typeof causeObj.syscall === "string" ? causeObj.syscall : "";
  const hostname =
    typeof causeObj.hostname === "string" ? causeObj.hostname : "";

  if (code) {
    parts.push(`code=${code}`);
  }
  if (syscall) {
    parts.push(`syscall=${syscall}`);
  }
  if (hostname) {
    parts.push(`host=${hostname}`);
  }

  return parts.join(" | ");
}

function isConnectivityOkWithQueryError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("permission denied") ||
    lower.includes("forbidden") ||
    lower.includes("row-level security") ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

async function main() {
  console.log("Starting Supabase connectivity test...\n");
  loadEnvFiles();

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ""
  ).trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const publicKey = publishableKey || anonKey;
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !publicKey) {
    console.error("Missing required environment variables:");
    console.error(
      `- NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "set" : "missing"}`
    );
    console.error(
      `- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY: ${
        publicKey ? "set" : "missing"
      }`
    );
    process.exit(1);
  }

  console.log("Current config:");
  console.log(`- URL: ${supabaseUrl}`);
  console.log(
    `- Public Key: ${mask(publicKey)} (${
      publishableKey
        ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
        : "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    })`
  );
  console.log(
    `- Service Role Key: ${serviceRoleKey ? `${mask(serviceRoleKey)} (set)` : "missing"}`
  );

  let hasHardFailure = false;

  // Test 1: Auth endpoint
  console.log("\n1) Checking auth endpoint...");
  try {
    const authUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`;
    const response = await fetch(authUrl, {
      method: "GET",
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
      },
    });

    if (!response.ok) {
      const body = shortBody(await response.text());
      console.error(`Auth endpoint check failed: HTTP ${response.status} ${body}`);
      hasHardFailure = true;
    } else {
      console.log("Auth endpoint reachable");
    }
  } catch (error) {
    console.error(`Auth endpoint request error: ${formatError(error)}`);
    hasHardFailure = true;
  }

  // Test 2: PostgREST / Database API (via supabase-js)
  console.log("\n2) Checking database API...");
  try {
    const client = createClient(supabaseUrl, publicKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error } = await client
      .from("user_wallets")
      .select("user_id", { head: true, count: "exact" })
      .limit(1);

    if (!error) {
      console.log("Database API reachable (query to user_wallets succeeded)");
    } else if (isConnectivityOkWithQueryError(error.message || "")) {
      console.log(`Database API reachable (query restricted or table missing): ${error.message}`);
    } else {
      console.error(`Database API check failed: ${error.message}`);
      hasHardFailure = true;
    }
  } catch (error) {
    console.error(`Database API request error: ${formatError(error)}`);
    hasHardFailure = true;
  }

  // Test 3: Service role key (optional, but validated if present)
  console.log("\n3) Checking service role key...");
  if (!serviceRoleKey) {
    console.log("SUPABASE_SERVICE_ROLE_KEY is missing, skipping admin check");
  } else {
    try {
      const adminUrl = `${supabaseUrl.replace(
        /\/$/,
        ""
      )}/auth/v1/admin/users?page=1&per_page=1`;
      const response = await fetch(adminUrl, {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });

      if (!response.ok) {
        const body = shortBody(await response.text());
        console.error(
          `Service role key invalid or insufficient: HTTP ${response.status} ${body}`
        );
        hasHardFailure = true;
      } else {
        console.log("Service role key works (admin users endpoint reachable)");
      }
    } catch (error) {
      console.error(`Service role key check error: ${formatError(error)}`);
      hasHardFailure = true;
    }
  }

  console.log("\nResult:");
  if (hasHardFailure) {
    console.log("Supabase connectivity test failed");
    process.exit(1);
  }

  console.log("Supabase connectivity test passed");
}

main().catch((error) => {
  console.error(`Script execution failed: ${formatError(error)}`);
  process.exit(1);
});
