export type Lang = "zh" | "en";

export type Dictionary = Record<string, any>;

export type TFunction = (
  key: string,
  vars?: Record<string, string | number>
) => string;
