import { createMiddleware } from "@tanstack/react-start";
import { getAccessToken } from "@/integrations/mysupabase/client";

/** Attaches the current Supabase access token to every server-fn call. */
export const attachAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await getAccessToken().catch(() => null);
  if (token) return next({ headers: { Authorization: `Bearer ${token}` } });
  return next();
});
