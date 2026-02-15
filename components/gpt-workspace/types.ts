import type { TaskGraphExecutionRun, TaskGraphSpec } from "@/types/task-graph";

export interface AIResponse {
  agentId: string;
  agentName: string;
  content: string;
  model?: string;
  tokens?: number;
  cost?: number;
  status: "pending" | "processing" | "completed" | "error";
  timestamp: Date;
  nodeId?: string;
  nodeTitle?: string;
  dependsOn?: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string | AIResponse[];
  isMultiAI?: boolean;
  collaborationMode?: CollaborationMode;
  taskGraph?: { spec: TaskGraphSpec; run?: TaskGraphExecutionRun };
  timestamp: Date;
}

export interface AIAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
  capabilities: string[];
  maxTokens?: number;
  temperature?: number;
  icon?: string;
}

export type CollaborationMode = "parallel" | "sequential" | "deep" | "graph";

export interface GPTWorkspaceProps {
  selectedGPTs: AIAgent[];
  setSelectedGPTs: (gpts: AIAgent[]) => void;
  availableAIs: AIAgent[];
  collaborationMode: CollaborationMode;
  setCollaborationMode: (mode: CollaborationMode) => void;
}
