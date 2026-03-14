export interface ClientAIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  maxTokens?: number;
  temperature?: number;
  icon?: string;
  isFree?: boolean;
  pricingLevel?: "free" | "low" | "medium" | "high";
  unitPrice?: number;
  releaseDate?: string | null;
  openrouterRank?: number;
  openrouterOrder?: string;
}

export interface ClientAIConfigResponse {
  success?: boolean;
  region?: string;
  country?: string;
  agents?: ClientAIAgent[];
  totalAgents?: number;
  providers?: Array<{
    provider: string;
    enabled: boolean;
    baseURL?: string;
  }>;
}

let cachedAIConfig: ClientAIConfigResponse | null = null;
let inflightAIConfigRequest: Promise<ClientAIConfigResponse> | null = null;

export async function fetchClientAIConfig(
  options?: { forceRefresh?: boolean }
): Promise<ClientAIConfigResponse> {
  if (options?.forceRefresh) {
    cachedAIConfig = null;
    inflightAIConfigRequest = null;
  }

  if (cachedAIConfig) {
    return cachedAIConfig;
  }

  if (inflightAIConfigRequest) {
    return inflightAIConfigRequest;
  }

  inflightAIConfigRequest = fetch("/api/config/ai")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load AI config (${response.status})`);
      }

      const data = (await response.json()) as ClientAIConfigResponse;
      cachedAIConfig = data;
      return data;
    })
    .finally(() => {
      inflightAIConfigRequest = null;
    });

  return inflightAIConfigRequest;
}

export function clearClientAIConfigCache() {
  cachedAIConfig = null;
  inflightAIConfigRequest = null;
}
