import { createContext } from "@Aer/api/context";
import { appRouter } from "@Aer/api/routers/index";
import { auth } from "@Aer/auth";
import { env } from "@Aer/env/server";
import { trpcServer } from "@hono/trpc-server";
import { initLogger } from "evlog";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

initLogger({
  env: { service: "Aer-server" },
});

const app = new Hono<EvlogVariables>();

app.on(["GET", "POST", "PUT", "DELETE", "PATCH"], "*", evlog());

app.use("*", async (c, next) => {
  const path = c.req.path;
  const method = c.req.method;

  if (method === "OPTIONS" || path.startsWith("/api/auth/")) return next();

  const log = c.get("log");
  if (!log) return next();

  const start = Date.now();
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const duration = Date.now() - start;
    const identified = !!session;

    if (session) {
      log.set({
        userId: session.user.id,
        sessionId: session.session.id,
        auth: true,
      });

      // Log full identity only when it changes or is new
      const isNewSession = Date.now() - new Date(session.session.createdAt).getTime() < 10000;
      if (isNewSession) {
        log.set({
          user: session.user,
          session: session.session,
          identity_event: "created",
        });
      }
    } else {
      log.set({ auth: false });
    }

    if (duration > 50 || !identified) {
      log.set({
        auth_perf: {
          resolvedIn: duration,
          identified,
        },
      });
    }
  } catch (err) {
    const duration = Date.now() - start;
    log.set({
      auth: false,
      auth_perf: {
        resolvedIn: duration,
        identified: false,
        error: true,
      },
    });
  }

  await next();
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
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



app.get("/", (c) => {
  return c.text("OK");
});

export default app;
