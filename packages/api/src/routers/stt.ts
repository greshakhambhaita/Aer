
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

  // Try Deepgram primary
  try {
    const primary = await transcribeWithDeepgram(file);
    if (isValidTranscript(primary)) {
      console.log(`[stt] provider=Deepgram transcript="${primary.slice(0, 80)}${primary.length > 80 ? "…" : ""}"`);
      return primary;
    }
    console.warn(`[stt] Deepgram transcript failed validation: "${primary}"`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[stt] Deepgram failed (${reason}), falling back to ElevenLabs`);
  }

  // Try ElevenLabs fallback
  try {
    const fallback = await transcribeWithElevenLabs(file);
    if (isValidTranscript(fallback)) {
      console.log(`[stt] provider=ElevenLabs transcript="${fallback.slice(0, 80)}${fallback.length > 80 ? "…" : ""}"`);
      return fallback;
    }
    console.warn(`[stt] ElevenLabs transcript failed validation: "${fallback}"`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[stt] ElevenLabs fallback also failed: ${reason}`);
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
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_id", "scribe_v1");
  formData.append("language_code", "en");
  formData.append("tag_audio_events", "false");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Accept-Encoding": "gzip,deflate",
      "Connection": "keep-alive",
    },
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
  const contentType = file.type || "audio/webm";
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=en",
    {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": contentType,
      "Accept-Encoding": "gzip,deflate",
      "Connection": "keep-alive",
    },
    body: file,
  }
  );

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
