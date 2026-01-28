import { useEffect, useState } from "react";

export interface AuthConfig {
  wechatAppId: string | undefined;
  appUrl: string | undefined;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  wechatCloudbaseId: string | undefined;
}

export function useAuthConfig() {
  const [config, setConfig] = useState<AuthConfig>({
    wechatAppId: undefined,
    appUrl: undefined,
    supabaseUrl: undefined,
    supabaseAnonKey: undefined,
    wechatCloudbaseId: undefined,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/auth/config");

        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.statusText}`);
        }

        const data = await response.json();
        setConfig(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        console.error("Failed to fetch auth config:", errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading, error };
}
