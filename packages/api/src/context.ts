import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = context.get("session");
  return {
    auth: null,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
