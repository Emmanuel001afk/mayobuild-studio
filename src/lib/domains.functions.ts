import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

/**
 * Domain skeletons.
 * - registerCustomDomain: stub for the Whogohost API. Activate by setting
 *   WHOGOHOST_API_KEY in Supabase secrets and replacing the TODO block.
 * - assignFreeSubdomain: deterministic *.mayobuild.app subdomain for
 *   unsubscribed users. Persists nothing yet — wire to a `subdomains` table
 *   once you're ready.
 */

const RegisterInput = z.object({
  projectId: z.string().uuid(),
  domain: z.string().regex(/^[a-z0-9-]+\.(com\.ng|name\.ng)$/i, "Only .com.ng / .name.ng supported"),
  years: z.number().int().min(1).max(5).default(1),
});

export const registerCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => RegisterInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.WHOGOHOST_API_KEY;
    if (!apiKey) {
      return {
        status: "skeleton" as const,
        message: "WHOGOHOST_API_KEY not configured. Add it in Cloud → Secrets to activate.",
        domain: data.domain,
      };
    }
    // TODO: replace with real Whogohost API call once you confirm the endpoint shape.
    // const res = await fetch("https://api.whogohost.com/v1/domains/register", {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ domain: data.domain, years: data.years }),
    // });
    return { status: "pending" as const, domain: data.domain, projectId: data.projectId };
  });

const SubInput = z.object({ projectId: z.string().uuid(), preferred: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/) });

export const assignFreeSubdomain = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => SubInput.parse(d))
  .handler(async ({ data }) => {
    const sub = `${data.preferred}.mayobuild.app`;
    return { status: "assigned" as const, subdomain: sub, projectId: data.projectId };
  });
