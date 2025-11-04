import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client with service role for RLS-protected operations
// IMPORTANT: Do NOT import this file in client components. Server-only usage.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}

if (!serviceRoleKey) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Backend writes may fail due to RLS."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey || (anonKey as string),
  {
    auth: { persistSession: false },
  }
);
