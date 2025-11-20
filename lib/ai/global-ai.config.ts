import { AIAgent, AIProviderConfig, AIRegionConfig } from "./types";

export const GLOBAL_AI_AGENTS: AIAgent[] = [
  // Mistral Text Models - Using exact model names from verified API endpoints
  {
    id: "mistral-tiny",
    name: "Mistral Tiny",
    provider: "mistral",
    model: "mistral-tiny",
    description: "Fast & lightweight | Recommended for quick responses",
    capabilities: ["conversation", "analysis"] as const,
    maxTokens: 8000,
    temperature: 0.7,
    icon: "⚡",
  },
  {
    id: "mistral-large-latest",
    name: "Mistral Large Latest",
    provider: "mistral",
    model: "mistral-large-latest",
    description: "High quality reasoning | Best for complex tasks",
    capabilities: ["conversation", "coding", "analysis", "creative"] as const,
    maxTokens: 32000,
    temperature: 0.7,
    icon: "🧠",
  },
  {
    id: "magistral-small-latest",
    name: "Magistral Small Latest",
    provider: "mistral",
    model: "magistral-small-latest",
    description: "Recommended | Balanced performance",
    capabilities: ["conversation", "coding", "analysis"] as const,
    maxTokens: 16000,
    temperature: 0.7,
    icon: "⭐",
  },
  {
    id: "magistral-medium-latest",
    name: "Magistral Medium Latest",
    provider: "mistral",
    model: "magistral-medium-latest",
    description: "Recommended | Enhanced reasoning",
    capabilities: ["conversation", "coding", "analysis", "creative"] as const,
    maxTokens: 24000,
    temperature: 0.7,
    icon: "⭐",
  },
  {
    id: "codestral-latest",
    name: "Codestral Latest",
    provider: "mistral",
    model: "codestral-latest",
    description: "Fast code generation | Recommended",
    capabilities: ["coding", "analysis"] as const,
    maxTokens: 16000,
    temperature: 0.7,
    icon: "💻",
  },
  {
    id: "codestral-2412",
    name: "Codestral 2412",
    provider: "mistral",
    model: "codestral-2412",
    description: "Fastest code model",
    capabilities: ["coding"] as const,
    maxTokens: 16000,
    temperature: 0.7,
    icon: "⚡💻",
  },
  {
    id: "devstral-small-latest",
    name: "Devstral Small Latest",
    provider: "mistral",
    model: "devstral-small-latest",
    description: "Small development model | Recommended",
    capabilities: ["coding", "analysis"] as const,
    maxTokens: 12000,
    temperature: 0.7,
    icon: "🛠️",
  },
  {
    id: "devstral-medium-latest",
    name: "Devstral Medium Latest",
    provider: "mistral",
    model: "devstral-medium-latest",
    description: "Medium development model | Recommended",
    capabilities: ["coding", "analysis", "creative"] as const,
    maxTokens: 20000,
    temperature: 0.7,
    icon: "🛠️",
  },

  // Stability AI - Image Generation
  {
    id: "stability-core",
    name: "Stability AI Image",
    provider: "stability",
    model: "stable-image-core",
    description: "Advanced image generation | Creative visual content",
    capabilities: ["creative", "analysis"] as const,
    maxTokens: 1024,
    temperature: 0.7,
    icon: "🎨",
  },

  // AssemblyAI - Speech to Text
  {
    id: "assemblyai-transcriber",
    name: "AssemblyAI Transcriber",
    provider: "assemblyai",
    model: "assemblyai-transcriber",
    description: "High-accuracy speech-to-text conversion",
    capabilities: ["research", "analysis"] as const,
    maxTokens: 8192,
    temperature: 0.0,
    icon: "🎙️",
  },

  // Gladia - Speech Processing
  {
    id: "gladia-speech",
    name: "Gladia Speech",
    provider: "gladia",
    model: "gladia-speech",
    description: "Multilingual speech transcription",
    capabilities: ["research", "translation"] as const,
    maxTokens: 8192,
    temperature: 0.0,
    icon: "🌐",
  },

  // ElevenLabs - Text to Speech
  {
    id: "elevenlabs-tts",
    name: "ElevenLabs TTS",
    provider: "elevenlabs",
    model: "elevenlabs-tts",
    description: "Natural-sounding voice synthesis",
    capabilities: ["creative", "conversation"] as const,
    maxTokens: 8192,
    temperature: 0.0,
    icon: "🔊",
  },
];

export const GLOBAL_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "mistral",
    apiKey: process.env.MISTRAL_API_KEY || "",
    baseURL: "https://api.mistral.ai/v1",
    enabled: !!process.env.MISTRAL_API_KEY,
  },
  {
    provider: "stability",
    apiKey: process.env.STABILITY_API_KEY || "",
    baseURL: "https://api.stability.ai",
    enabled: !!process.env.STABILITY_API_KEY,
  },
  {
    provider: "assemblyai",
    apiKey: process.env.ASSEMBLYAI_API_KEY || "",
    baseURL: "https://api.assemblyai.com",
    enabled: !!process.env.ASSEMBLYAI_API_KEY,
  },
  {
    provider: "gladia",
    apiKey: process.env.GLADIA_API_KEY || "",
    baseURL: "https://api.gladia.io",
    enabled: !!process.env.GLADIA_API_KEY,
  },
  {
    provider: "elevenlabs",
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    baseURL: "https://api.elevenlabs.io",
    enabled: !!process.env.ELEVENLABS_API_KEY,
  },
];

export const globalAIConfig: AIRegionConfig = {
  region: "global",
  agents: GLOBAL_AI_AGENTS,
  providers: GLOBAL_PROVIDERS,
};
