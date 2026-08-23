// src/lib/aem-browser-tool.server.ts
// Gives AEM AI real eyes and hands on the web — not a new browser engine
// (that's a multi-year project), but automated control of a real one
// (Chromium via Playwright), running headless on the server. This is the
// same underlying technique real browser-using AI products use.
//
// HONEST DEPENDENCY: needs the `playwright` package installed, plus its
// browser binaries downloaded server-side (`npx playwright install
// chromium`). Same caveat as the video-learning tool — confirm this is
// actually installable on wherever this project is hosted before relying
// on it; some hosting platforms don't allow this.

import { chromium, type Browser, type Page } from "playwright";

export interface BrowserActionResult {
  ok: boolean;
  screenshotBase64?: string;
  pageText?: string;
  currentUrl?: string;
  error?: string;
}

async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    return await fn(page);
  } finally {
    await browser?.close();
  }
}

/** Visit a URL and report what's actually there — the direct fix for
 * "you can't see what's happening on my site." */
export async function checkWebsite(url: string): Promise<BrowserActionResult> {
  return withPage(async (page) => {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
      const pageText = await page.innerText("body").catch(() => "");
      return {
        ok: true,
        screenshotBase64: screenshot.toString("base64"),
        pageText: pageText.slice(0, 3000),
        currentUrl: page.url(),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

/** Real interaction — click, type, submit. Steps run in order; stops and
 * reports on the first failure rather than pressing on blindly. */
export interface BrowserStep {
  action: "click" | "type" | "goto" | "wait";
  selector?: string;
  text?: string;
  url?: string;
  ms?: number;
}

export async function interactWithWebsite(
  startUrl: string,
  steps: BrowserStep[]
): Promise<BrowserActionResult> {
  return withPage(async (page) => {
    try {
      await page.goto(startUrl, { waitUntil: "networkidle", timeout: 20000 });

      for (const step of steps) {
        switch (step.action) {
          case "click":
            if (!step.selector) throw new Error("click requires a selector");
            await page.click(step.selector, { timeout: 10000 });
            break;
          case "type":
            if (!step.selector || step.text === undefined) throw new Error("type requires selector + text");
            await page.fill(step.selector, step.text, { timeout: 10000 });
            break;
          case "goto":
            if (!step.url) throw new Error("goto requires a url");
            await page.goto(step.url, { waitUntil: "networkidle", timeout: 20000 });
            break;
          case "wait":
            await page.waitForTimeout(step.ms ?? 1000);
            break;
        }
      }

      const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
      const pageText = await page.innerText("body").catch(() => "");
      return {
        ok: true,
        screenshotBase64: screenshot.toString("base64"),
        pageText: pageText.slice(0, 3000),
        currentUrl: page.url(),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
}

// --- Tool definitions for the hub's tool-calling loop ---
export const BROWSER_TOOLS = [
  {
    type: "function",
    function: {
      name: "check_website",
      description: "Visit a URL with a real headless browser and report what's actually on the page — a screenshot, the visible text, and whether it loaded. Use this to verify a fix actually worked instead of assuming.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "interact_with_website",
      description: "Visit a URL and perform a sequence of real actions (click, type into a field, navigate, wait) — e.g. testing a signup form or login flow end to end.",
      parameters: {
        type: "object",
        properties: {
          startUrl: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["click", "type", "goto", "wait"] },
                selector: { type: "string" },
                text: { type: "string" },
                url: { type: "string" },
                ms: { type: "number" },
              },
              required: ["action"],
            },
          },
        },
        required: ["startUrl", "steps"],
      },
    },
  },
] as const;

export async function runBrowserTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "check_website":
      return await checkWebsite(String(args.url));
    case "interact_with_website":
      return await interactWithWebsite(String(args.startUrl), args.steps as BrowserStep[]);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
