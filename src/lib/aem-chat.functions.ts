// src/lib/aem-chat.functions.ts
// Talking to AEM AI from inside this app. Authenticated by the signed-in
// overseer account — deliberately NO API key involved. API keys exist only
// so *other* websites can reach the same central brain.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

function isAdminEmail(email: string | null | undefined) {
  const allowed = process.env.ADMIN_EMAIL?.toLowerCase();
  return !!allowed && !!email && email.toLowerCase() === allowed;
}

export const askAem = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      message: z.string().min(1).max(8000),
      deviceId: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { answerWithAem } = await import("@/lib/aem-brain.server");
    return await answerWithAem({
      prompt: data.message,
      deviceId: data.deviceId,
      // The overseer gets the management tools; other signed-in users get
      // the safe core tools only.
      allowManagementTools: isAdminEmail(context.user.email),
    });
  });
