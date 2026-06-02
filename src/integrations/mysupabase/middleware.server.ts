import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getAdmin, getUserFromToken } from "@/integrations/mysupabase/admin.server";

/** Reads Authorization: Bearer <jwt>, validates with Supabase, attaches user. */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const user = await getUserFromToken(token);
  if (!user) throw new Error("Unauthorized");
  return next({ context: { user, admin: getAdmin(), accessToken: token! } });
});
