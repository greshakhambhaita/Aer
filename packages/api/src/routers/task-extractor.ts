import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import z from "zod";

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  "google/gemini-2.0-flash-001",
  "deepseek/deepseek-chat",
  "openai/gpt-4o-mini",
] as const;

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const PrioritySchema = z.enum(["low", "medium", "high"]);

const LLMTaskSchema = z.object({
  text: z.string().min(1).describe("The actionable task description"),
  priority: PrioritySchema.describe(
    "Inferred from urgency cues: high=urgent/ASAP/critical, low=someday/eventually, medium=default"
  ),
  dueDateISO: z
    .string()
    .datetime()
    .nullable()
    .describe(
      "Due date as UTC ISO 8601 string inferred from natural language, or null if none mentioned"
    ),
});

const LLMResponseSchema = z.object({
  tasks: z.array(LLMTaskSchema).describe("All actionable tasks extracted from the transcript"),
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

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const now = new Date().toISOString();
  return `
You are a task extraction assistant. Current UTC time: ${now}.

Extract every actionable task from the user's speech transcript.

Rules:
- Only include tasks with a clear intended action. Ignore pleasantries, filler, and observations.
- Priority inference:
    "urgent", "ASAP", "immediately", "critical", "right away" → "high"
    "eventually", "someday", "when possible", "no rush"       → "low"
    everything else                                            → "medium"
- Due date inference (relative to ${now}):
    "tonight"      → today at 20  :00 UTC
    "tomorrow"     → next day at 09:00 UTC
    "next week"    → 7 days from today at 09:00 UTC
    "in X hours"   → now + X hours
    no mention     → null
- Return dueDateISO as a valid ISO 8601 UTC string, or null.
- If no actionable tasks exist, return an empty tasks array.
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractTasks(
  transcript: string,
  userId: string
): Promise<NormalizedTask[]> {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  const systemPrompt = buildSystemPrompt();
  let lastError: unknown;

  for (const model of MODELS) {
    try {
      const { object } = await generateObject({
        model: openrouter(model),
        schema: LLMResponseSchema,
        system: systemPrompt,
        prompt: transcript,
      });

      return object.tasks.map((task) => normalizeTask(task, userId));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[task-extractor] Model ${model} failed: ${reason} — trying next`);
      lastError = err;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[task-extractor] All models exhausted. Last error: ${reason}`);
  return [];
}
