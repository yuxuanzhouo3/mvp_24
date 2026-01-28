// AI模型定义及其标签
export interface AI {
  id: string;
  name: string;
  model: string;
  tags: string[]; // 功能标签，如 ['战略规划', '综合分析']
  description: string;
}

// 预定义AI列表
export const AVAILABLE_AIS: AI[] = [
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    model: "gpt-4-turbo",
    tags: ["战略规划", "综合分析", "创意生成"],
    description: "强大的综合AI，适合战略规划和创意任务",
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    model: "claude-3-5-sonnet",
    tags: ["市场分析", "数据处理", "逻辑推理"],
    description: "优秀的分析型AI，适合市场研究和数据分析",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    model: "gpt-4o",
    tags: ["创意写作", "润色优化", "快速响应"],
    description: "高效的创意AI，适合文案写作和内容优化",
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    model: "claude-3-haiku",
    tags: ["快速分析", "总结提炼", "辅助工具"],
    description: "轻量级AI，适合快速分析和辅助任务",
  },
];

// 根据标签查找AI
export function findAIsByTags(requiredTags: string[]): AI[] {
  return AVAILABLE_AIS.filter((ai) =>
    requiredTags.some((tag) => ai.tags.includes(tag))
  );
}

// 根据ID查找AI
export function findAIById(id: string): AI | undefined {
  return AVAILABLE_AIS.find((ai) => ai.id === id);
}
