#!/usr/bin/env node
/**
 * 真实语音多模态识别烟雾测试：
 * 1) qwen3-asr-flash
 * 2) qwen3-omni-flash
 *
 * 用法:
 *   node test-multimodal-audio.mjs
 *   node test-multimodal-audio.mjs /path/to/audio.m4a
 *
 * 需要环境变量:
 *   DASHSCOPE_API_KEY
 * 可选:
 *   DASHSCOPE_BASE_URL
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DEFAULT_AUDIO_PATH =
  "/Users/8086k/project/multigpt1/multigpt/玉州区.m4a";

const MODEL_LIST = ["qwen3-asr-flash", "qwen3-omni-flash-2025-12-01"];

function inferAudioFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".m4a" || ext === ".mp4") return "mp4";
  if (ext === ".mp3") return "mp3";
  if (ext === ".wav") return "wav";
  if (ext === ".ogg") return "ogg";
  if (ext === ".webm") return "webm";
  return "mp4";
}

function inferAudioMimeType(format) {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (format === "ogg") return "audio/ogg";
  if (format === "webm") return "audio/webm";
  if (format === "mp4") return "audio/mp4";
  return "audio/mp4";
}

function extractTextContent(rawContent) {
  if (typeof rawContent === "string") return rawContent.trim();
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

async function runSingleModel(client, model, audioBase64, audioFormat) {
  const startedAt = Date.now();
  const audioMimeType = inferAudioMimeType(audioFormat);
  const dataUri = `data:${audioMimeType};base64,${audioBase64}`;

  if (model.startsWith("qwen3-omni-flash")) {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是语音识别与摘要助手。请先输出“逐字转写”，再输出“简短摘要”。如果听不清请明确标注。",
        },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: dataUri,
                format: audioFormat,
              },
            },
            {
              type: "text",
              text: "请识别这段音频并输出结果。",
            },
          ],
        },
      ],
      stream: true,
      stream_options: { include_usage: true },
      modalities: ["text"],
      temperature: 0.1,
      max_tokens: 900,
    });

    let text = "";
    let usage = null;
    for await (const chunk of stream) {
      if (Array.isArray(chunk?.choices) && chunk.choices.length > 0) {
        const delta = chunk.choices[0]?.delta;
        if (typeof delta?.content === "string") {
          text += delta.content;
          continue;
        }
        if (Array.isArray(delta?.content)) {
          text += delta.content
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("");
        }
      } else if (chunk?.usage) {
        usage = chunk.usage;
      }
    }

    const elapsedMs = Date.now() - startedAt;
    return {
      text: text.trim(),
      elapsedMs,
      usage,
    };
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是语音识别与摘要助手。请先输出“逐字转写”，再输出“简短摘要”。如果听不清请明确标注。",
      },
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: dataUri,
              format: audioFormat,
            },
          },
          {
            type: "text",
            text: "请识别这段音频并输出结果。",
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 900,
  });
  const elapsedMs = Date.now() - startedAt;
  const text = extractTextContent(completion?.choices?.[0]?.message?.content);
  return { text, elapsedMs, usage: completion?.usage || null };
}

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error("Missing DASHSCOPE_API_KEY, cannot run test.");
    process.exit(1);
  }

  const targetAudioPath = process.argv[2] || DEFAULT_AUDIO_PATH;
  const absoluteAudioPath = path.resolve(targetAudioPath);
  const audioBuffer = await fs.readFile(absoluteAudioPath);
  const audioBase64 = audioBuffer.toString("base64");
  const audioFormat = inferAudioFormat(absoluteAudioPath);

  console.log("=== Multimodal Audio Recognition Smoke Test ===");
  console.log("Audio file:", absoluteAudioPath);
  console.log("Audio size:", `${audioBuffer.length} bytes`);
  console.log("Audio format:", audioFormat);
  console.log("Models:", MODEL_LIST.join(", "));
  console.log("");

  const client = new OpenAI({
    apiKey,
    baseURL:
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });

  let successCount = 0;
  for (const model of MODEL_LIST) {
    console.log(`--- Testing model: ${model} ---`);
    try {
      const result = await runSingleModel(client, model, audioBase64, audioFormat);
      const preview =
        result.text.length > 220 ? `${result.text.slice(0, 220)}...` : result.text;
      if (result.text) successCount += 1;

      console.log("Status:", result.text ? "SUCCESS" : "EMPTY_TEXT");
      console.log("Latency:", `${result.elapsedMs} ms`);
      console.log(
        "Token usage:",
        result.usage
          ? `prompt=${result.usage.prompt_tokens}, completion=${result.usage.completion_tokens}, total=${result.usage.total_tokens}`
          : "N/A"
      );
      console.log("Text preview:");
      console.log(preview || "(empty)");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("Status: ERROR");
      console.log("Error:", message);
    }
    console.log("");
  }

  if (successCount === 0) {
    console.error("All models failed or returned empty text.");
    process.exit(2);
  }

  console.log(`Done. ${successCount}/${MODEL_LIST.length} models returned text.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Test execution failed:", message);
  process.exit(1);
});
