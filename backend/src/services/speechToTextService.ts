import { Blob } from "node:buffer";

/** 使用 OpenAI Whisper 將語音轉成文字 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename = "audio.m4a",
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("未設定 OPENAI_API_KEY，無法轉錄語音");
  }

  const model = process.env.OPENAI_WHISPER_MODEL?.trim() || "whisper-1";
  const form = new FormData();
  form.append("file", new Blob([audioBuffer]), filename);
  form.append("model", model);
  form.append("language", "zh");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper API 失敗 (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) {
    throw new Error("Whisper 回傳空文字");
  }

  return text;
}
