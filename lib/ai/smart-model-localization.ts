import { SMART_AGENT_ID, SMART_MODEL_ID } from "./smart-model-router";

type LocalizableSmartAgent = {
  id?: string;
  model?: string;
  name?: string;
  description?: string;
  role?: string;
};

function isSmartAgent(agent?: LocalizableSmartAgent | null): boolean {
  if (!agent) return false;
  const id = String(agent.id || "").trim().toLowerCase();
  const model = String(agent.model || "").trim().toLowerCase();
  return id === SMART_AGENT_ID || model === SMART_MODEL_ID || id.includes(SMART_AGENT_ID);
}

export function localizeSmartAgent<T extends LocalizableSmartAgent>(
  agent: T,
  language?: string | null
): T {
  if (!isSmartAgent(agent)) return agent;

  const isZh = String(language || "").trim().toLowerCase().startsWith("zh");

  return {
    ...agent,
    name: isZh ? "自动" : "Auto",
    description: isZh
      ? "自动选择最优模型"
      : "Automatically choose the best model",
    ...(typeof agent.role === "string"
      ? { role: isZh ? "自动路由" : "Auto Router" }
      : {}),
  };
}

