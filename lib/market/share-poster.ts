"use client";

type PosterLanguage = "zh" | "en";

export type ReferralPosterInput = {
  qrImageUrl: string;
  title: string;
  description: string;
  inviteCode?: string | null;
  ctaText?: string | null;
  language?: PosterLanguage;
  fileName?: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = clamp(radius, 0, Math.min(width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function trimText(text: string, maxLength: number) {
  const raw = String(text || "").trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 1))}...`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const rawText = String(text || "").trim();
  if (!rawText) return [];
  const splitWords = rawText.split(/\s+/).filter(Boolean);
  const words = splitWords.length > 1 ? splitWords : Array.from(rawText);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const separator = splitWords.length > 1 ? " " : "";
    const candidate = current ? `${current}${separator}${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) return lines;
    }

    current = word;
    if (ctx.measureText(current).width > maxWidth) {
      let shortened = current;
      while (
        shortened.length > 1 &&
        ctx.measureText(`${shortened}...`).width > maxWidth
      ) {
        shortened = shortened.slice(0, -1);
      }
      lines.push(`${shortened}...`);
      if (lines.length >= maxLines) return lines;
      current = "";
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

function triggerDownload(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

export async function buildReferralPosterDataUrl(input: ReferralPosterInput) {
  const qrImageUrl = String(input.qrImageUrl || "").trim();
  if (!qrImageUrl) {
    throw new Error("qrImageUrl is required");
  }

  const title = trimText(input.title || "", 80);
  const description = trimText(input.description || "", 120);
  const inviteCode = trimText(String(input.inviteCode || "").trim(), 32);
  const language: PosterLanguage = input.language === "en" ? "en" : "zh";
  const ctaText = trimText(
    String(input.ctaText || "").trim() ||
      (language === "zh"
        ? "扫码打开并开始使用"
        : "Scan to open and start using"),
    80
  );

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1680;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  const qrImage = await loadImage(qrImageUrl);

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#0f172a");
  background.addColorStop(0.52, "#1d4ed8");
  background.addColorStop(1, "#06b6d4");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(180, 220, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(910, 1520, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  drawRoundRect(ctx, 70, 90, 940, 1500, 42);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "700 42px Arial, sans-serif";
  ctx.fillText("MultiGPT", 130, 190);

  ctx.fillStyle = "#111827";
  ctx.font = "700 56px Arial, sans-serif";
  const titleLines = wrapText(ctx, title || "MultiGPT Invite", 820, 2);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, 130, 290 + index * 72);
  });

  ctx.fillStyle = "#475569";
  ctx.font = "400 34px Arial, sans-serif";
  const descriptionLines = wrapText(ctx, description, 820, 3);
  descriptionLines.forEach((line, index) => {
    ctx.fillText(line, 130, 440 + index * 48);
  });

  drawRoundRect(ctx, 225, 610, 630, 630, 34);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.drawImage(qrImage, 285, 670, 510, 510);

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 40px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(ctaText, canvas.width / 2, 1310);

  if (inviteCode) {
    drawRoundRect(ctx, 230, 1360, 620, 95, 22);
    ctx.fillStyle = "#eff6ff";
    ctx.fill();
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#1d4ed8";
    ctx.font = "600 34px Arial, sans-serif";
    ctx.fillText(
      language === "zh" ? `邀请码：${inviteCode}` : `Invite Code: ${inviteCode}`,
      canvas.width / 2,
      1422
    );
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "400 28px Arial, sans-serif";
  ctx.fillText(
    language === "zh"
      ? "由 MultiGPT 邀请分享生成"
      : "Generated by MultiGPT invite sharing",
    canvas.width / 2,
    1522
  );

  return canvas.toDataURL("image/png");
}

export async function downloadReferralPoster(input: ReferralPosterInput) {
  const language: PosterLanguage = input.language === "en" ? "en" : "zh";
  const dataUrl = await buildReferralPosterDataUrl(input);
  const fileName =
    String(input.fileName || "").trim() ||
    (language === "zh"
      ? "multigpt-invite-poster.png"
      : "multigpt-share-poster.png");
  triggerDownload(dataUrl, fileName);
}
