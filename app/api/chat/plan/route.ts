import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAuthToken, extractTokenFromHeader } from "@/lib/auth-utils";
import { isChinaRegion } from "@/lib/config/region";
import { aiRouter } from "@/lib/ai/router";
import type { AIMessage } from "@/lib/ai/types";
import { getAgentById } from "@/lib/ai/ai-agents.config";
import {
  normalizeTaskGraphSpec,
  TaskGraphSpecSchema,
  type TaskGraphSpec,
} from "@/types/task-graph";

export const runtime = "nodejs";

function extractFirstJsonObject(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();

  // Find the first '{' and try to parse a progressively larger slice.
  const firstBrace = candidate.indexOf("{");
  if (firstBrace === -1) return null;

  for (let end = candidate.length; end > firstBrace; end--) {
    const slice = candidate.slice(firstBrace, end);
    try {
      return JSON.parse(slice);
    } catch {
      // keep trying
    }
  }

  return null;
}

function pickPlannerModel(allowedAgentIds: string[]): string {
  for (const id of allowedAgentIds) {
    const agent = getAgentById(id);
    if (agent?.model && aiRouter.isModelAvailable(agent.model)) return agent.model;
  }
  return aiRouter.getDefaultModel();
}

function sanitizeSpec(spec: TaskGraphSpec, allowedAgentIds: string[]): TaskGraphSpec {
  const allowed = new Set(allowedAgentIds);
  const nodeIds = new Set(spec.nodes.map((n) => n.id));

  const nodes = spec.nodes.map((n) => ({
    ...n,
    dependsOn: (n.dependsOn ?? []).filter((d) => nodeIds.has(d)),
    agentId: n.agentId && allowed.has(n.agentId) ? n.agentId : undefined,
  }));

  // Ensure unique node ids (very defensive)
  const seen = new Set<string>();
  const deduped = [] as typeof nodes;
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    deduped.push(n);
  }

  return normalizeTaskGraphSpec({ ...spec, nodes: deduped });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { token, error: tokenError } = extractTokenFromHeader(authHeader);

    if (tokenError || !token) {
      return Response.json(
        { error: tokenError || "Unauthorized" },
        { status: 401 }
      );
    }

    const authResult = await verifyAuthToken(token);
    if (!authResult.success || !authResult.userId) {
      return Response.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.userId;

    const body = await req.json();
    const {
      sessionId,
      goal,
      templateHint,
      maxNodes = 8,
    }: {
      sessionId: string;
      goal: string;
      templateHint?: string;
      maxNodes?: number;
    } = body;

    if (!sessionId || !goal || typeof goal !== "string" || goal.trim().length === 0) {
      return Response.json(
        { error: "sessionId and goal are required" },
        { status: 400 }
      );
    }

    // Validate session ownership and load session config.
    let session: any;

    if (isChinaRegion()) {
      const cloudbase = require("@cloudbase/node-sdk")
        .init({
          env: process.env.NEXT_PUBLIC_WECHAT_CLOUDBASE_ID,
          secretId: process.env.CLOUDBASE_SECRET_ID,
          secretKey: process.env.CLOUDBASE_SECRET_KEY,
        })
        .database();

      const sessionResult = await cloudbase
        .collection("ai_conversations")
        .doc(sessionId)
        .get();

      if (!sessionResult.data || sessionResult.data.length === 0) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      const conv = sessionResult.data[0];
      if (conv.user_id !== userId) {
        return Response.json({ error: "Access denied" }, { status: 404 });
      }

      session = conv;
    } else {
      const result = await supabaseAdmin
        .from("gpt_sessions")
        .select("id, user_id, multi_ai_config")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .single();

      if (result.error || !result.data) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      session = result.data;
    }

    const allowedAgentIds: string[] =
      session?.multi_ai_config?.selectedAgentIds &&
      Array.isArray(session.multi_ai_config.selectedAgentIds)
        ? session.multi_ai_config.selectedAgentIds
        : [];

    if (allowedAgentIds.length === 0) {
      return Response.json(
        {
          error:
            "Session has no locked agents. Please create a session with selected agents first.",
        },
        { status: 409 }
      );
    }

    const allowedAgentSummaries = allowedAgentIds
      .map((id) => {
        const a = getAgentById(id);
        return a
          ? {
              id: a.id,
              name: a.name,
              model: a.model,
              description: a.description,
              tags: a.tags ?? [],
            }
          : { id, name: id, model: "", description: "" };
      })
      .slice(0, 12);

    const plannerModel = pickPlannerModel(allowedAgentIds);
    const provider = aiRouter.getProviderForModel(plannerModel);

    const system = [
      "你是一个任务分解与编排器（Task Graph Planner）。",
      "目标：把用户的总任务拆成可执行的子任务图（DAG），同时支持串联与并联。",
      "你必须只输出 JSON，不要输出额外解释、不要输出 Markdown。",
      "约束：",
      `- nodes 数量 <= ${Math.max(1, Math.min(20, maxNodes))}`,
      "- 节点必须有 id/title/description/dependsOn[]",
      "- dependsOn 只能引用本次输出中的节点 id",
      "- agentId 可选：如果给出，必须来自 allowedAgents[].id",
      "- version 固定为 \"2.0\"",
      "输出 JSON schema：",
      "{ version: '2.0', goal: string, nodes: [{id,title,description,dependsOn,agentId?}], edges?:[{from,to,kind?}], finalNodeId?:string, templateHint?:string }",
    ].join("\n");

    const user = [
      `【总目标】\n${goal.trim()}`,
      "",
      templateHint ? `【模板提示】\n${templateHint}` : null,
      "",
      `【可用专家/模型（allowedAgents）】\n${JSON.stringify(allowedAgentSummaries, null, 2)}`,
      "",
      "请基于可用专家，把任务拆分成 DAG。并行节点应尽量彼此独立。",
    ]
      .filter(Boolean)
      .join("\n");

    const messages: AIMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    const resp = await provider.chat(messages, {
      model: plannerModel,
      temperature: 0.2,
      maxTokens: 1800,
    });

    const rawText = resp.content ?? "";
    const parsed = extractFirstJsonObject(rawText);

    if (!parsed) {
      return Response.json(
        { error: "Planner returned non-JSON output", raw: rawText },
        { status: 502 }
      );
    }

    const normalized = normalizeTaskGraphSpec(parsed);
    const safe = sanitizeSpec(normalized, allowedAgentIds);

    // Validate again after sanitize (safety)
    TaskGraphSpecSchema.parse(safe);

    return Response.json({ spec: safe, plannerModel });
  } catch (error) {
    console.error("/api/chat/plan error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
