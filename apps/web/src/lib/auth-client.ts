import { env } from "@Aer/env/web";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,

});
