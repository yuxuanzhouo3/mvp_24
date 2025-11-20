// 模板定义
export interface TemplateStep {
  id: string;
  role: string; // AI角色，如 '战略规划师'
  requiredTags: string[]; // 必需的标签，如 ['战略规划']
  task: string; // 任务描述
  maxModels?: number; // 可选的最大模型数量，默认1
}

export interface Template {
  id: string;
  name: string; // 模板名称，如 '商业分析组合'
  description: string; // 适用场景描述
  aiSequence: TemplateStep[]; // AI执行序列
  maxAI?: number; // 最大AI数量，默认序列长度
}

// 预定义模板列表
export const AVAILABLE_TEMPLATES: Template[] = [
  {
    id: "business-analysis",
    name: "商业分析组合",
    description: "适合商业计划书、市场调研、竞争分析等任务",
    aiSequence: [
      {
        id: "strategic-planner",
        role: "战略规划师",
        requiredTags: ["战略规划"],
        task: "生成框架和大纲",
      },
      {
        id: "market-analyst",
        role: "市场分析师",
        requiredTags: ["市场分析"],
        task: "补充市场数据和竞争分析",
      },
      {
        id: "creative-writer",
        role: "创意润色师",
        requiredTags: ["创意写作"],
        task: "将数据转化为吸引人的文案",
      },
    ],
  },
  {
    id: "code-development",
    name: "代码开发组合",
    description: "适合软件开发、架构设计、代码审查等任务",
    aiSequence: [
      {
        id: "architect",
        role: "架构设计师",
        requiredTags: ["战略规划", "逻辑推理"],
        task: "设计系统架构",
      },
      {
        id: "code-generator",
        role: "代码生成器",
        requiredTags: ["综合分析", "快速响应"],
        task: "生成代码实现",
      },
      {
        id: "code-reviewer",
        role: "代码审查员",
        requiredTags: ["逻辑推理", "总结提炼"],
        task: "优化和审查代码",
      },
    ],
  },
  {
    id: "content-creation",
    name: "内容创作组合",
    description: "适合文章写作、创意内容、营销文案等任务",
    aiSequence: [
      {
        id: "content-planner",
        role: "内容规划师",
        requiredTags: ["战略规划"],
        task: "规划内容结构和大纲",
      },
      {
        id: "content-creator",
        role: "内容创作者",
        requiredTags: ["创意生成", "创意写作"],
        task: "创作核心内容",
      },
      {
        id: "content-editor",
        role: "内容编辑师",
        requiredTags: ["润色优化", "总结提炼"],
        task: "润色和优化内容",
      },
    ],
  },
];

// 根据ID查找模板
export function findTemplateById(id: string): Template | undefined {
  return AVAILABLE_TEMPLATES.find((template) => template.id === id);
}
