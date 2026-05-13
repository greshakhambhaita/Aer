import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import z from "zod";

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "deepseek/deepseek-chat",

] as const;

// Task extraction output is tiny — keep tokens low for latency
const MAX_TOKENS = 256;

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

const LLMRefinementSchema = z.object({
  tasks: z.array(
    z.object({
      text: z.string().min(1),
    })
  ),
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

4. TIME OF DAY WORDS (STRICT)
- morning → 09:00 local
- afternoon → 15:00 local
- evening → 19:00 local
- tonight → 20:00 local
- If the user says "tomorrow morning/afternoon/evening", apply the above time on that date

5. TASK TEXT QUALITY
- Task text must be short and action-first (imperative verb)
- Remove filler words and pronouns when possible
- If dueDateISO is set, remove any date/time wording from the task text
- Avoid vague references like "that thing" or "it"

Return clean, minimal tasks.
`.trim();
}

// ─── Prompt: PASS 2 (Light Refinement) ────────────────────────────────────────

function buildRefinementPrompt(timezone: string): string {
  return `
You refine task titles.

Timezone: ${timezone}

RULES:
- Keep meaning; do not invent details
- Make titles short and action-first
- Remove date/time words if dueDateISO exists
- Keep order; return same number of tasks
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

function shouldRefineText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length > 64) return true;
  if (/^(i|we)\b/.test(normalized)) return true;
  if (/\b(need to|have to|should|please)\b/.test(normalized)) return true;
  if (/\b(today|tomorrow|tonight|next|by|at|on|this|in)\b/.test(normalized)) return true;
  return false;
}

// ─── Fallback Split ───────────────────────────────────────────────────────────

function naiveSplit(transcript: string): string[] {
  return transcript
    .split(/,|\band\b|\bthen\b|\balso\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
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

  const systemPrompt = buildExtractionPrompt(timezone);

  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const { object } = await generateObject({
        model: openrouter(model),
        schema: LLMResponseSchema,
        system: systemPrompt,
        prompt: transcript,
        maxTokens: MAX_TOKENS,
        maxRetries: 0,
      });

      let tasks = object.tasks;

      // fallback split if suspiciously single
      if (tasks.length === 1) {
        const chunks = naiveSplit(transcript);

        if (chunks.length > 1) {
          const fallbackResults = await Promise.allSettled(
            chunks.map(async (chunk) =>
              generateObject({
                model: openrouter(model),
                schema: LLMResponseSchema,
                system: systemPrompt,
                prompt: chunk,
                maxTokens: MAX_TOKENS,
                maxRetries: 0,
              })
            )
          );

          const fallbackTasks: typeof tasks = [];

          for (const result of fallbackResults) {
            if (result.status === "fulfilled") {
              fallbackTasks.push(...result.value.object.tasks);
            }
          }

          if (fallbackTasks.length > 1) tasks = fallbackTasks;
        }
      }

      if (tasks.length > 0 && tasks.some((task) => shouldRefineText(task.text))) {
        try {
          const refinementPrompt = buildRefinementPrompt(timezone);
          const { object: refined } = await generateObject({
            model: openrouter(model),
            schema: LLMRefinementSchema,
            system: refinementPrompt,
            prompt: JSON.stringify({
              tasks: tasks.map((task) => ({
                text: task.text,
                dueDateISO: task.dueDateISO,
              })),
            }),
            maxTokens: 128,
            maxRetries: 0,
          });

          if (refined.tasks.length === tasks.length) {
            tasks = tasks.map((task, index) => ({
              ...task,
              text: refined.tasks[index]?.text ?? task.text,
            }));
          }
        } catch {
          // keep original tasks on refinement failure
        }
      }

      return tasks.map((task) => normalizeTask(task, userId));
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
