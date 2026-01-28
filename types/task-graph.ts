import { z } from "zod";

export const TaskGraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(["data", "control"]).optional(),
});

export const TaskGraphNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  dependsOn: z.array(z.string().min(1)).default([]),
  agentId: z.string().min(1).optional(),
});

export const TaskGraphSpecSchema = z.object({
  version: z.literal("2.0"),
  goal: z.string().min(1),
  nodes: z.array(TaskGraphNodeSchema).min(1),
  edges: z.array(TaskGraphEdgeSchema).default([]),
  finalNodeId: z.string().min(1).optional(),
  templateHint: z.string().optional(),
});

export type TaskGraphEdge = z.infer<typeof TaskGraphEdgeSchema>;
export type TaskGraphNode = z.infer<typeof TaskGraphNodeSchema>;
export type TaskGraphSpec = z.infer<typeof TaskGraphSpecSchema>;

export type TaskGraphNodeStatus = "pending" | "running" | "completed" | "error";

export interface TaskGraphNodeRun {
  nodeId: string;
  status: TaskGraphNodeStatus;
  agentId: string;
  agentName: string;
  model: string;
  startedAt?: string;
  finishedAt?: string;
  output?: string;
  error?: string;
}

export interface TaskGraphExecutionRun {
  runId: string;
  createdAt: string;
  finishedAt?: string;
  nodes: TaskGraphNodeRun[];
}

export function normalizeTaskGraphSpec(input: unknown): TaskGraphSpec {
  const parsed = TaskGraphSpecSchema.parse(input);

  // Ensure edges are consistent with dependsOn.
  const existing = new Set(parsed.edges.map((e) => `${e.from}::${e.to}`));
  const edges = [...parsed.edges];

  for (const node of parsed.nodes) {
    for (const dep of node.dependsOn ?? []) {
      const key = `${dep}::${node.id}`;
      if (!existing.has(key)) {
        existing.add(key);
        edges.push({ from: dep, to: node.id, kind: "control" });
      }
    }
  }

  return {
    ...parsed,
    edges,
    nodes: parsed.nodes.map((n) => ({ ...n, dependsOn: n.dependsOn ?? [] })),
  };
}

export function topoLayers(spec: TaskGraphSpec): string[][] {
  const nodeIds = new Set(spec.nodes.map((n) => n.id));
  const deps = new Map<string, Set<string>>();

  for (const n of spec.nodes) {
    const d = new Set((n.dependsOn ?? []).filter((x) => nodeIds.has(x)));
    deps.set(n.id, d);
  }

  const layers: string[][] = [];
  const remaining = new Set(nodeIds);
  const done = new Set<string>();

  while (remaining.size > 0) {
    const ready = Array.from(remaining).filter((id) => {
      const d = deps.get(id) ?? new Set();
      for (const dep of d) {
        if (!done.has(dep)) return false;
      }
      return true;
    });

    if (ready.length === 0) {
      layers.push(Array.from(remaining));
      break;
    }

    layers.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      done.add(id);
    }
  }

  return layers;
}
