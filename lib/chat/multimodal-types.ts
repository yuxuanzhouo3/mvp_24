export type MultimodalAttachmentKind = "image" | "audio" | "video" | "file";

export interface MultimodalAttachmentPayload {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: MultimodalAttachmentKind;
  dataUrl?: string;
  textContent?: string;
}

export interface MultimodalPreprocessResult {
  enhancedMessage: string;
  summary: string;
  quota?: {
    image: {
      used: number;
      limit: number;
      remaining: number;
    };
    videoAudio: {
      used: number;
      limit: number;
      remaining: number;
    };
  };
}
