import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import z from "zod";

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  "deepseek/deepseek-chat",
  "google/gemini-2.0-flash-001",

  "openai/gpt-4o-mini",
] as const;

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PrioritySchema = z.enum(["low", "medium", "high"]);

const LLMTaskSchema = z.object({
  text: z.string().min(1),
  priority: PrioritySchema,
  dueDateISO: z.string().datetime().nullable(),
});

const LLMResponseSchema = z.object({
  tasks: z.array(LLMTaskSchema),
});

// second pass schema (enrichment)
const EnrichedTaskSchema = z.object({
  text: z.string().min(1),
  priority: PrioritySchema,
  dueDateISO: z.string().datetime().nullable(),
});

const EnrichedResponseSchema = z.object({
  tasks: z.array(EnrichedTaskSchema),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = z.infer<typeof PrioritySchema>;

export type ExtractedTask = {
  text: string;
  priority: Priority;
  dueDate: Date | null;
};

export type NormalizedTask = ExtractedTask & {
  userId: string;
  status: "created";
  createdAt: Date;
  updatedAt: Date;
};

// ─── Prompt: PASS 1 (Extraction) ───────────────────────────────────────────────

function buildExtractionPrompt(timezone: string): string {
  const now = new Date();
  const localNow = now.toLocaleString("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  });

  // Compute the local date string (YYYY-MM-DD) in the user's timezone
  const localDate = now.toLocaleDateString("en-CA", { timeZone: timezone }); // en-CA gives YYYY-MM-DD

  return `
You are an intelligent task extraction assistant.

Current LOCAL time: ${localNow}
User timezone: ${timezone}
Today's local date: ${localDate}

Extract actionable tasks from natural speech.

RULES:

1. SPLIT vs GROUP
- Split tasks if different time references exist
- Group if actions form one continuous outcome

2. TIME (CRITICAL — READ CAREFULLY)
- Interpret relative dates in the user's LOCAL timezone: ${timezone}
- Today's local date is: ${localDate}
- NEVER use midnight (00:00) as a default time — it causes the date to appear as the NEXT day in UTC+offset timezones
- Default time when no specific time is mentioned:
    "today"     → ${localDate}T09:00:00 local → convert to UTC
    "tomorrow"  → next local day at 09:00 local → convert to UTC
    "tonight"   → ${localDate}T20:00:00 local → convert to UTC
    "next week" → 7 days from ${localDate} at 09:00 local → convert to UTC
- Always output dueDateISO as a valid UTC ISO 8601 string
- If no date is mentioned → null

3. PRIORITY
- urgent / ASAP → high
- later / someday → low
- else → medium

Return clean, minimal tasks.
`.trim();
}

// ─── Prompt: PASS 2 (Enrichment) ───────────────────────────────────────────────

function buildEnrichmentPrompt(timezone: string): string {
  const localNow = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  });

  return `
You are a task refinement assistant.

Current LOCAL time: ${localNow}
Timezone: ${timezone}

You will improve already extracted tasks.

GOALS:

1. RESOLVE VAGUENESS
- Rewrite vague tasks into clearer actionable tasks
- Example:
  "finish that thing" → "Finish previously started work"

2. SOFT TIME INFERENCE
- "soon" → 1–3 days
- "later" → 3–7 days
- "sometime" → 2–5 days
- If no time exists but urgency implied → assign reasonable date
- All dates must be in UTC ISO 8601 format, resolved from ${timezone}

3. CLEAN TEXT
- Make tasks short, clear, and executable
- Remove filler words

4. DO NOT OVER-INVENT
- Do not hallucinate specifics
- Stay faithful to original meaning

Return improved tasks.
`.trim();
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeTask(
  task: z.infer<typeof LLMTaskSchema>,
  userId: string
): NormalizedTask {
  const now = new Date();

  return {
    userId,
    text: task.text.trim(),
    priority: task.priority,
    status: "created",
    dueDate: task.dueDateISO ? new Date(task.dueDateISO) : null,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Fallback Split ───────────────────────────────────────────────────────────

function naiveSplit(transcript: string): string[] {
  return transcript
    .split(/,|\band\b|\bthen\b|\balso\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Enrichment Pass ──────────────────────────────────────────────────────────

async function enrichTasks(
  tasks: z.infer<typeof LLMTaskSchema>[],
  model: (typeof MODELS)[number],
  timezone: string
) {
  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: EnrichedResponseSchema,
      system: buildEnrichmentPrompt(timezone),
      prompt: JSON.stringify({ tasks }),
    });

    return object.tasks;
  } catch {
    return tasks; // fallback silently
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractTasks(
  transcript: string,
  userId: string,
  timezone: string = "UTC"
): Promise<NormalizedTask[]> {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  let lastError: unknown;

  for (const model of MODELS) {
    try {
      // PASS 1: extraction
      const { object } = await generateObject({
        model: openrouter(model),
        schema: LLMResponseSchema,
        system: buildExtractionPrompt(timezone),
        prompt: transcript,
      });

      let tasks = object.tasks;

      // fallback split if suspiciously single
      if (tasks.length === 1) {
        const chunks = naiveSplit(transcript);

        if (chunks.length > 1) {
          const fallbackTasks: typeof tasks = [];

          for (const chunk of chunks) {
            try {
              const { object: sub } = await generateObject({
                model: openrouter(model),
                schema: LLMResponseSchema,
                system: buildExtractionPrompt(timezone),
                prompt: chunk,
              });

              fallbackTasks.push(...sub.tasks);
            } catch { }
          }

          if (fallbackTasks.length > 1) {
            tasks = fallbackTasks;
          }
        }
      }

      // PASS 2: enrichment
      const enriched = await enrichTasks(tasks, model, timezone);

      return enriched.map((task) => normalizeTask(task, userId));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[task-extractor] Model ${model} failed: ${reason} — trying next`
      );
      lastError = err;
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);

  console.error(
    `[task-extractor] All models exhausted. Last error: ${reason}`
  );

  return [];
}