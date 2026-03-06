export type AppearancePresetId =
  | "classic"
  | "ocean"
  | "violet"
  | "emerald"
  | "sunset"
  | "rose"
  | "custom";

type AppearanceLanguage = "zh" | "en";

export interface AppearancePreset {
  id: AppearancePresetId;
  label: Record<AppearanceLanguage, string>;
  description: Record<AppearanceLanguage, string>;
  primary: string;
  accent: string;
}

export interface AppearanceSettings {
  presetId: AppearancePresetId;
  customPrimary: string;
  customAccent: string;
  assistantName: string;
  assistantAvatar: string;
}

export const APPEARANCE_STORAGE_KEY = "multigpt-appearance-settings:v1";

export const APPEARANCE_PRESETS: AppearancePreset[] = [
  {
    id: "classic",
    label: { zh: "经典蓝", en: "Classic Blue" },
    description: { zh: "稳重清晰，适合日常使用", en: "Clean and balanced for daily use" },
    primary: "#2563eb",
    accent: "#7c3aed",
  },
  {
    id: "ocean",
    label: { zh: "海洋青", en: "Ocean" },
    description: { zh: "冷静高效，偏科技感", en: "Calm, cool, and tech-forward" },
    primary: "#0891b2",
    accent: "#2563eb",
  },
  {
    id: "violet",
    label: { zh: "星云紫", en: "Violet" },
    description: { zh: "灵感型配色，更有未来感", en: "A futuristic palette with creative energy" },
    primary: "#7c3aed",
    accent: "#ec4899",
  },
  {
    id: "emerald",
    label: { zh: "翡翠绿", en: "Emerald" },
    description: { zh: "自然专业，适合效率场景", en: "Fresh and professional for focused work" },
    primary: "#059669",
    accent: "#0f766e",
  },
  {
    id: "sunset",
    label: { zh: "日落橙", en: "Sunset" },
    description: { zh: "活力鲜明，更具产品感", en: "Warm and vivid with product energy" },
    primary: "#ea580c",
    accent: "#db2777",
  },
  {
    id: "rose",
    label: { zh: "玫瑰粉", en: "Rose" },
    description: { zh: "柔和精致，适合品牌包装", en: "Soft and polished for a branded feel" },
    primary: "#e11d48",
    accent: "#8b5cf6",
  },
  {
    id: "custom",
    label: { zh: "自定义", en: "Custom" },
    description: { zh: "选择一个颜色，系统自动生成搭配", en: "Pick one color and let the system build the palette" },
    primary: "#2563eb",
    accent: "#7c3aed",
  },
];

export const ASSISTANT_AVATAR_PRESETS = ["🤖", "🧠", "✨", "🚀", "🦊", "🐼", "🪄", "🌈"];

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  presetId: "classic",
  customPrimary: "#2563eb",
  customAccent: "#7c3aed",
  assistantName: "",
  assistantAvatar: "",
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const IMAGE_URL_PATTERN = /^https?:\/\/\S+$/i;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function expandHex(hex: string) {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length === 4) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  return normalized;
}

function hexToRgb(hex: string) {
  const normalized = expandHex(hex).slice(1);
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const saturation =
    delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;
  switch (max) {
    case red:
      hue = ((green - blue) / delta) % 6;
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslToHex(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = x;
  } else if (segment < 2) {
    red = x;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = x;
  } else if (segment < 4) {
    green = x;
    blue = chroma;
  } else if (segment < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const toHex = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function getReadableForegroundChannels(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "222 47% 11%" : "0 0% 98%";
}

function normalizeHexColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? expandHex(trimmed) : fallback;
}

export function isValidHexColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function isLikelyImageUrl(value: string) {
  return IMAGE_URL_PATTERN.test(value.trim());
}

export function deriveAccentColor(seedHex: string) {
  const normalized = normalizeHexColor(
    seedHex,
    DEFAULT_APPEARANCE_SETTINGS.customPrimary
  );
  const { r, g, b } = hexToRgb(normalized);
  const { h, s, l } = rgbToHsl(r, g, b);

  const accentHue = (h + (h >= 250 && h <= 330 ? -28 : 28) + 360) % 360;
  const accentSaturation = clamp(Math.max(s, 48) + 10, 48, 92);
  const accentLightness = clamp(
    l < 38 ? l + 16 : l > 64 ? l - 18 : l - 4,
    28,
    68
  );

  return hslToHex(accentHue, accentSaturation, accentLightness);
}

export function getAppearancePreset(id: AppearancePresetId) {
  return (
    APPEARANCE_PRESETS.find((preset) => preset.id === id) ||
    APPEARANCE_PRESETS[0]
  );
}

export function sanitizeAppearanceSettings(
  input: Partial<AppearanceSettings> | null | undefined
): AppearanceSettings {
  const nextPresetId = APPEARANCE_PRESETS.some(
    (preset) => preset.id === input?.presetId
  )
    ? (input?.presetId as AppearancePresetId)
    : DEFAULT_APPEARANCE_SETTINGS.presetId;

  return {
    presetId: nextPresetId,
    customPrimary: normalizeHexColor(
      input?.customPrimary,
      DEFAULT_APPEARANCE_SETTINGS.customPrimary
    ),
    customAccent: normalizeHexColor(
      input?.customAccent,
      DEFAULT_APPEARANCE_SETTINGS.customAccent
    ),
    assistantName: typeof input?.assistantName === "string"
      ? input.assistantName.trim().slice(0, 24)
      : DEFAULT_APPEARANCE_SETTINGS.assistantName,
    assistantAvatar: typeof input?.assistantAvatar === "string"
      ? input.assistantAvatar.trim().slice(0, 120)
      : DEFAULT_APPEARANCE_SETTINGS.assistantAvatar,
  };
}

export function getAppearanceColors(settings: AppearanceSettings) {
  if (settings.presetId === "custom") {
    const primary = normalizeHexColor(
      settings.customPrimary,
      DEFAULT_APPEARANCE_SETTINGS.customPrimary
    );

    return {
      primary,
      accent: deriveAccentColor(primary),
    };
  }

  const preset = getAppearancePreset(settings.presetId);
  return {
    primary: preset.primary,
    accent: preset.accent,
  };
}

export function hexToHslChannels(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return `${clamp(Math.round(h), 0, 360)} ${clamp(
    Math.round(s),
    0,
    100
  )}% ${clamp(Math.round(l), 0, 100)}%`;
}

export function buildAppearanceCssVars(settings: AppearanceSettings) {
  const { primary, accent } = getAppearanceColors(settings);

  return {
    "--primary": hexToHslChannels(primary),
    "--primary-foreground": getReadableForegroundChannels(primary),
    "--ring": hexToHslChannels(primary),
    "--sidebar-primary": hexToHslChannels(primary),
    "--sidebar-primary-foreground": getReadableForegroundChannels(primary),
    "--sidebar-ring": hexToHslChannels(primary),
    "--brand-secondary": hexToHslChannels(accent),
    "--brand-secondary-foreground": getReadableForegroundChannels(accent),
    "--chart-1": hexToHslChannels(primary),
    "--chart-2": hexToHslChannels(accent),
    "--chart-4": hexToHslChannels(accent),
    "--chart-5": hexToHslChannels(primary),
  };
}

export function getAssistantAvatarFallback(settings: AppearanceSettings) {
  const avatar = settings.assistantAvatar.trim();
  if (avatar && !isLikelyImageUrl(avatar)) {
    return avatar;
  }

  const assistantName = settings.assistantName.trim();
  if (!assistantName) {
    return "AI";
  }

  return assistantName.slice(0, 2).toUpperCase();
}
