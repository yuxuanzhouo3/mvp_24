export type InputModality = "text" | "image" | "audio";

type AgentLite = {
  id: string;
  name: string;
  model: string;
  capabilities?: string[];
};

const IMAGE_TAGS = new Set([
  "vision",
  "image",
  "image_input",
  "multimodal",
  "vl",
]);

const AUDIO_TAGS = new Set([
  "audio",
  "audio_input",
  "audio_output",
  "speech",
  "asr",
  "stt",
  "multimodal",
  "omni",
]);

const IMAGE_MODEL_HINTS =
  /(gpt-4o|gpt-4\.1|gemini|qwen-vl|glm-4v|claude-3|claude-sonnet|pixtral|llava|vision|vl)/i;

const AUDIO_MODEL_HINTS =
  /(whisper|gpt-4o-audio|qwen-audio|audio|speech|asr|stt)/i;

export function detectInputModalities(input: string): InputModality[] {
  const modalities = new Set<InputModality>(["text"]);
  const raw = input.trim();

  // markdown/image urls/data urls
  if (
    /!\[[^\]]*\]\([^)]+\)/.test(raw) ||
    /(https?:\/\/\S+\.(png|jpg|jpeg|gif|webp))/i.test(raw) ||
    /data:image\/[a-zA-Z0-9.+-]+;base64,/.test(raw)
  ) {
    modalities.add("image");
  }

  // audio urls/data urls or simple explicit markers
  if (
    /(https?:\/\/\S+\.(mp3|wav|m4a|ogg|aac|flac))/i.test(raw) ||
    /data:audio\/[a-zA-Z0-9.+-]+;base64,/.test(raw) ||
    /\[(audio|voice|语音)\]/i.test(raw)
  ) {
    modalities.add("audio");
  }

  return Array.from(modalities);
}

export function supportsModalities(
  agent: AgentLite,
  requiredModalities: InputModality[]
): boolean {
  const needsImage = requiredModalities.includes("image");
  const needsAudio = requiredModalities.includes("audio");
  if (!needsImage && !needsAudio) return true;

  const caps = new Set((agent.capabilities || []).map((c) => c.toLowerCase()));
  const model = (agent.model || "").toLowerCase();

  const imageSupported =
    !needsImage ||
    Array.from(IMAGE_TAGS).some((tag) => caps.has(tag)) ||
    IMAGE_MODEL_HINTS.test(model);
  const audioSupported =
    !needsAudio ||
    Array.from(AUDIO_TAGS).some((tag) => caps.has(tag)) ||
    AUDIO_MODEL_HINTS.test(model);

  return imageSupported && audioSupported;
}

export function buildModalityFallbackPrompt(
  originalMessage: string,
  missingModalities: InputModality[]
): string {
  const needs = missingModalities.filter((m) => m !== "text");
  if (needs.length === 0) return originalMessage;

  const zhMap: Record<InputModality, string> = {
    text: "文本",
    image: "图像",
    audio: "音频",
  };
  const missingText = needs.map((m) => zhMap[m]).join("、");

  return [
    "系统说明：当前模型不支持该请求中的全部输入模态。",
    `缺失能力：${missingText}。`,
    "请改为文本降级处理：",
    "1) 仅基于用户在文本里提供的描述、链接、上下文进行推理；",
    "2) 若关键信息不足，先明确列出缺失信息，再给出可执行下一步；",
    "3) 不要声称已经“看见图片/听到音频”。",
    "",
    "用户原始输入：",
    originalMessage,
  ].join("\n");
}

export function getIncompatibleModalities(
  agent: AgentLite,
  requiredModalities: InputModality[]
): InputModality[] {
  const needsImage = requiredModalities.includes("image");
  const needsAudio = requiredModalities.includes("audio");
  if (!needsImage && !needsAudio) return [];

  const caps = new Set((agent.capabilities || []).map((c) => c.toLowerCase()));
  const model = (agent.model || "").toLowerCase();
  const lacks: InputModality[] = [];

  if (
    needsImage &&
    !Array.from(IMAGE_TAGS).some((tag) => caps.has(tag)) &&
    !IMAGE_MODEL_HINTS.test(model)
  ) {
    lacks.push("image");
  }

  if (
    needsAudio &&
    !Array.from(AUDIO_TAGS).some((tag) => caps.has(tag)) &&
    !AUDIO_MODEL_HINTS.test(model)
  ) {
    lacks.push("audio");
  }

  return lacks;
}
