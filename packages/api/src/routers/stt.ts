import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import os from "os";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath!);

export async function transcribeAudio(file: File): Promise<string> {
  try {
    const text = await transcribeWithElevenLabs(file);
    if (text && text.trim().length > 0) return text;
    throw new Error("Empty transcript from ElevenLabs");
  } catch (err) {
    console.warn("ElevenLabs failed, falling back to Deepgram:", err instanceof Error ? err.message : err);
    return await transcribeWithDeepgram(file);
  }
}

async function transcribeWithElevenLabs(file: File): Promise<string> {
  const wavFile = await fileToWav(file);
  console.log(`Converted to WAV: ${wavFile.size} bytes`);

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
    let body: string;
    try { body = await res.text(); } catch { body = "(unreadable)"; }
    console.error(`ElevenLabs HTTP ${res.status}:`, body);
    throw new Error(`ElevenLabs failed: ${res.status} — ${body}`);
  }

  const data = (await res.json()) as any;
  console.log("ElevenLabs response keys:", Object.keys(data));

  const raw: string = data.text ?? "";
  return raw.replace(/\(.*?\)/g, "").trim();
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

  if (!res.ok) throw new Error(`Deepgram failed: ${res.status}`);

  const data = (await res.json()) as any;
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

async function fileToWav(file: File): Promise<File> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `stt-in-${Date.now()}.webm`);
  const outputPath = path.join(tmpDir, `stt-out-${Date.now()}.wav`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(await file.arrayBuffer()));

    await new Promise<void>((resolve, reject) =>
      ffmpeg(inputPath)
        .toFormat("wav")
        .audioCodec("pcm_s16le")
        .on("end", () => resolve)
        .on("error", reject)
        .save(outputPath)
    );

    const wavBuffer = fs.readFileSync(outputPath);
    return new File([wavBuffer], "recording.wav", { type: "audio/wav" });
  } finally {
    for (const p of [inputPath, outputPath]) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}