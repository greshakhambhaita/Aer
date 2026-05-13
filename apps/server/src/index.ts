import { createContext } from "@Aer/api/context";
import { appRouter } from "@Aer/api/routers/index";
import { auth } from "@Aer/auth";
import { env } from "@Aer/env/server";
import { transcribeAudio } from "@Aer/api/routers/stt";
import { extractTasks } from "@Aer/api/routers/task-extractor";
import { db } from "@Aer/db";
import { todo } from "@Aer/db/schema/todo";
import { trpcServer } from "@hono/trpc-server";
import { initLogger } from "evlog";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

initLogger({
  env: { service: "Aer-server" },
});

type AppVariables = EvlogVariables & {
  Variables: {
    session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  };
};

const app = new Hono<AppVariables>();

app.on(["GET", "POST", "PUT", "DELETE", "PATCH"], "*", evlog());

// 1. Auth Resolution Middleware (Pure logic + Context storage)
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || c.req.method === "OPTIONS") {
    return next();
  }

  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("session", session);
  } catch (err) {
    c.set("session", null);
  }
  await next();
});

// 2. Logging & Observability Middleware (Side-effects)
app.use("*", async (c, next) => {
  const log = c.get("log");
  if (!log || c.req.method === "OPTIONS") return next();

  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  const session = c.get("session");
  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(c.req.method);
  const isError = c.res.status >= 400;
  const isSlow = duration > 100;

  // Identity attribution - only on mutations, errors, or slow requests
  if (session && (isMutation || isError || isSlow)) {
    log.set({
      userId: session.user.id,
      sessionId: session.session.id,
      auth: true,
    });

    // Detailed identity only for very new sessions
    const isNewSession = Date.now() - new Date(session.session.createdAt).getTime() < 10000;
    if (isNewSession) {
      log.set({
        identity_event: "created",
        user_email: session.user.email,
      });
    }
  } else if (session) {
    // For normal queries, keep it in DEBUG context if supported or just omit from INFO
    // Here we use set() but we'll mark the whole request level later
    log.set({ auth: true });
  } else {
    log.set({ auth: false });
  }

  // Level separation
  if (isError) {
    log.set({ level: "error", duration });
  } else if (isMutation || isSlow) {
    log.set({ level: "info", duration });
  } else {
    // Normal GET queries are DEBUG level
    log.set({ level: "debug", duration });
  }
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Timezone"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.post("/api/audio/upload", async (c) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    // Robust file check (Hono's parseBody might return File or string)
    if (!file || typeof file === "string" || !("size" in file)) {
      return c.json({ success: false, error: "No file provided" }, 400);
    }

    if (file.size === 0) {
      return c.json({ success: false, error: "Empty file" }, 400);
    }

    if (file.size > 10 * 1024 * 1024) { // Increased to 10MB
      return c.json({ success: false, error: "File too large (max 10MB)" }, 400);
    }

    const transcript = await transcribeAudio(file as unknown as File);

    const clientTimezone = c.req.header("X-Timezone") ?? "UTC";
    const tasks = await extractTasks(transcript, session.user.id, clientTimezone);

    if (tasks.length > 0) {
      await db.insert(todo).values(tasks);
    }

    console.log(`[stt] Saved ${tasks.length} task(s) from voice to DB`);

    return c.json({ success: true, savedTasks: tasks.length });
  } catch (err) {
    const log = c.get("log");
    const error = err instanceof Error ? err.message : String(err);
    log?.set({ error });
    console.error("STT error:", error);

    return c.json(
      {
        success: false,
        error: error || "Transcription failed",
      },
      500
    );
  }
});



app.get("/", (c) => {
  return c.text("OK");
});

export default app;
