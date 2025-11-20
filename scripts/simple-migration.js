// Simple migration script to add subscription_expires_at field
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://arpgaaseuxcvrwdxayzf.supabase.co";
const supabaseServiceKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFycGdhYXNldXhjdnJ3ZHhheXpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTMwMDcwNCwiZXhwIjoyMDc2ODc2NzA0fQ.R18oWxdbLHPeg74MVwlSAPFGbqI04hw0PUkRKFP4vhQ";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log("Starting migration: Add subscription_expires_at field...");

    // Add subscription_expires_at field to user_profiles table
    const { error: alterError } = await supabase.rpc("exec_sql", {
      sql: `
        alter table public.user_profiles
        add column if not exists subscription_expires_at timestamp with time zone;
      `,
    });

    if (alterError) {
      console.error("Error adding column:", alterError);
      return;
    }

    console.log("Column added successfully");

    // Update existing active subscriptions to set expiration time
    const { error: updateError } = await supabase.rpc("exec_sql", {
      sql: `
        update public.user_profiles
        set subscription_expires_at = s.current_period_end
        from public.subscriptions s
        where user_profiles.id = s.user_id
        and s.status = 'active'
        and user_profiles.subscription_status = 'active'
        and user_profiles.subscription_plan != 'free';
      `,
    });

    if (updateError) {
      console.error("Error updating existing subscriptions:", updateError);
      return;
    }

    console.log("Existing subscriptions updated");

    // For users without active subscriptions, set expiration to null (free users)
    const { error: nullUpdateError } = await supabase.rpc("exec_sql", {
      sql: `
        update public.user_profiles
        set subscription_expires_at = null
        where subscription_plan = 'free' or subscription_status != 'active';
      `,
    });

    if (nullUpdateError) {
      console.error("Error setting null expirations:", nullUpdateError);
      return;
    }

    console.log("Free users updated");

    // Create index for subscription expiration queries
    const { error: indexError } = await supabase.rpc("exec_sql", {
      sql: `
        create index if not exists idx_user_profiles_subscription_expires_at
        on public.user_profiles(subscription_expires_at);
      `,
    });

    if (indexError) {
      console.error("Error creating index:", indexError);
      return;
    }

    console.log("Index created successfully");
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

runMigration();
