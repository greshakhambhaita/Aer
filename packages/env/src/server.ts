import { createEnv } from "@t3-oss/env-core";
import "dotenv/config";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    BETTER_AUTH_SECRET: z.string().min(32),
    OPENROUTER_API_KEY: z.string(),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    ELEVENLABS_API_KEY: z.string(),
    DEEPGRAM_API_KEY: z.string(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
