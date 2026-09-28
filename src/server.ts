import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // TanStack Start's SSR layer currently rejects requests whose Accept header
      // excludes HTML with HTTP 500 before it can reach an API route. Native apps
      // and other API clients legitimately send Accept: application/json. For
      // /api/* requests, let route matching decide the response instead of applying
      // the HTML-only SSR content-negotiation guard. This is intentionally global
      // so future native apps and API clients are not forced into browser-specific
      // headers or browser-specific fixes.
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith("/api/")) {
        const accept = request.headers.get("accept") ?? "";
        const acceptsHtml = accept.split(",").some((part) => {
          const mime = part.trim().split(";", 1)[0].toLowerCase();
          return mime === "*/*" || mime === "text/html";
        });
        if (!acceptsHtml) {
          const headers = new Headers(request.headers);
          headers.set("accept", "*/*");
          request = new Request(request, { headers });
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
