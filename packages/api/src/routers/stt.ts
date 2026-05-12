import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import os from "os";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath!);

async function fileToWav(file: File): Promise<File> {
  if (file.size === 0) {
    throw new Error("fileToWav: input file is empty (0 bytes)");
  }

  const tmpDir = os.tmpdir();
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(tmpDir, `stt-in-${ts}.webm`);
  const outputPath = path.join(tmpDir, `stt-out-${ts}.wav`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    await new Promise<void>((resolve, reject) =>
      ffmpeg(inputPath)
        .toFormat("wav")
        .audioCodec("pcm_s16le")
        .on("end", () => resolve())
        .on("error", (err: Error) =>
          reject(new Error(`ffmpeg conversion failed: ${err.message}`))
        )
        .save(outputPath)
    );

    if (!fs.existsSync(outputPath)) {
      throw new Error("ffmpeg produced no output file");
    }

    const wavBuffer = fs.readFileSync(outputPath);

    if (wavBuffer.byteLength === 0) {
      throw new Error("ffmpeg output WAV is empty (0 bytes)");
    }

    console.log(`[stt] WAV conversion: ${file.size}b webm → ${wavBuffer.byteLength}b wav`);
    return new File([wavBuffer], "recording.wav", { type: "audio/wav" });
  } finally {
    for (const p of [inputPath, outputPath]) {
      try { fs.unlinkSync(p); } catch { /* already gone, ignore */ }
    }
  }
}

// ─── ElevenLabs response shape ───────────────────────────────────────────────

interface ElevenLabsSTTResponse {
  text?: string;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function transcribeAudio(file: File): Promise<string> {
  if (file.size === 0) {
    throw new Error("transcribeAudio: received an empty file — nothing to transcribe");
  }

  // Try ElevenLabs primary
  try {
    const primary = await transcribeWithElevenLabs(file);
    if (isValidTranscript(primary)) {
      return primary;
    }
    console.warn(`[stt] ElevenLabs transcript failed validation: "${primary}"`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[stt] ElevenLabs failed (${reason}), falling back to Deepgram`);
  }

  // Try Deepgram fallback
  try {
    const fallback = await transcribeWithDeepgram(file);
    if (isValidTranscript(fallback)) {
      return fallback;
    }
    console.warn(`[stt] Deepgram transcript failed validation: "${fallback}"`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[stt] Deepgram fallback also failed: ${reason}`);
  }

  throw new Error("No valid transcript from any provider");
}

// ─── Providers ───────────────────────────────────────────────────────────────

function cleanTranscript(text: string): string {
  return text
    .replace(/\(.*?\)/g, "") // remove noise annotations
    .replace(/[^\x00-\x7F]+/g, "") // remove non-english / hallucinations
    .trim();
}

function isValidTranscript(text: string): boolean {
  if (!text) return false;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 1) return false;

  // reject weird noise outputs
  if (text.includes("음악") || text.includes("소음")) return false;

  // length check from previous iteration
  if (text.length < 2) return false;

  return true;
}

async function transcribeWithElevenLabs(file: File): Promise<string> {
  const wavFile = await fileToWav(file);

  const formData = new FormData();
  formData.append("file", wavFile);
  formData.append("model_id", "scribe_v1");
  formData.append("language_code", "en");
  formData.append("tag_audio_events", "false");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: formData,
  });

  if (!res.ok) {
    let body = "(unreadable)";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`ElevenLabs HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as ElevenLabsSTTResponse;

  if (typeof data.text !== "string") {
    throw new Error(
      `ElevenLabs response missing 'text' field. Got keys: ${Object.keys(data).join(", ")}`
    );
  }

  return cleanTranscript(data.text);
}

async function transcribeWithDeepgram(file: File): Promise<string> {
  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3", {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "audio/webm",
    },
    body: await file.arrayBuffer(),
  });

  if (!res.ok) {
    let body = "(unreadable)";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`Deepgram HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as DeepgramResponse;
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (typeof transcript !== "string") {
    throw new Error(
      "Deepgram response missing expected transcript path: results.channels[0].alternatives[0].transcript"
    );
  }

  return cleanTranscript(transcript);
}
