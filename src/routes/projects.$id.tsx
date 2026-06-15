import { cleanFilePaths, getActuallyChangedFiles, matchFileFromCode, validateFilesForPush, deriveVercelUrl, extractFilesFromScaffold, rebuildScaffold, EDIT_SYSTEM_PROMPT, BUILD_SYSTEM_PROMPT, AUTONOMOUS_THINKING_PROMPT, buildKnowledgeBlock, STARTER_TEMPLATES } from "@/mayobuild.config";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  getProject, savePreview, publishSite, saveApiKey, listApiKeys, runProjectSQL,
  checkVercelDeployment, autoFixFromVercelError, runScheduledHealthCheck,
  runFullVerificationLoop, pullFromGitHub, pushToCloudflare,
  saveProjectKnowledge, generateDiffPreview, remixProject,
} from "@/lib/projects.functions";
import { callRouter } from "@/lib/router.functions";
import { wrapWebsiteAsApp } from "@/lib/mobile-gen.functions";
import { MicButton } from "@/components/MicButton";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Send, Globe, Smartphone, Monitor, RefreshCw,
  ExternalLink, Rocket, Paperclip, ChevronDown, Download, Sparkles,
  KeyRound, X, Wrench, Undo2, History, GitPullRequest, CloudUpload, BookOpen,
} from "lucide-react";

export const Route = createFileRoute("/projects/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    firstPrompt: typeof s.firstPrompt === "string" ? s.firstPrompt : "",
  }),
  head: () => ({ meta: [{ title: "Editor — Mayobuild Studio" }] }),
  component: ProjectPage,
});

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  html?: string;
  summary?: { added: string[]; changed: string[]; removed: string[] };
};

// ── AI System Prompts ─────────────────────────────────────────────────────────
// BUILD_SYSTEM_PROMPT = first message ever (no existing code yet) → scaffolds full React/TS project
// EDIT_SYSTEM_PROMPT  = all edits after that (existing code present) → precise file edits only
const SYSTEM_WEBSITE = EDIT_SYSTEM_PROMPT;

const SYSTEM_MOBILE_BASE = [
  "You are Mayobuild AI. You improve an existing Expo React Native App.tsx (TypeScript) only.",
  "Read EXISTING CODE before changing it. Only modify what the user asked for. Preserve everything else.",
  "Use only standard Expo SDK: react, react-native, expo-status-bar. No external native modules.",
  "Respond in this EXACT format: 2-3 plain English sentences, then 'CHANGES: Added [x] | Modified [y] | Removed [z]', then ONE ```tsx``` fenced block with the complete updated App.tsx.",
  "AUTO-FIX: If you see an error message, find root cause and fix automatically.",
].join(" ");

const PLAN_SYSTEM = "You are Mayobuild AI in PLAN mode. Ask the user 2-3 short clarifying questions to fully understand what they want. Output ONLY the questions in plain English. Do NOT write any code.";

const WEBSITE_SUGGESTIONS = [
  "Landing page for a coffee shop with menu and hours",
  "Personal portfolio with projects grid and contact form",
  "SaaS pricing page with 3 tiers and FAQ",
  "Event RSVP page with countdown and map",
];
const MOBILE_SUGGESTIONS = [
  "Daily meditation app with morning alarms",
  "Habit tracker with streaks and reminders",
  "Pomodoro timer with notifications",
  "Grocery list with categories and check-off",
];

const PROVIDER_ORDER_WEB = ["deepseek", "gemini", "groq", "openrouter", "mistral", "cerebras", "huggingface"];
const PROVIDER_ORDER_MOBILE = ["gemini", "deepseek", "groq", "openrouter", "mistral", "cerebras", "huggingface"];

function extractSql(text: string): string | null {
  const m = text.match(/```sql\s*\n([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function extractHtml(text: string): string | null {
  const m = text.match(/```(?:html)?\s*\n([\s\S]*?)```/i);
  if (m) return m[1].trim();
  if (/<!doctype html|<html[\s>]/i.test(text)) return text.trim();
  return null;
}
function extractCode(text: string): string | null {
  const m = text.match(/```(?:tsx|ts|jsx|js|html)?\s*\n([\s\S]*?)```/i);
  return m ? m[1].trim() : text.trim() || null;
}
function parseChangesLine(text: string): string | null {
  const m = text.match(/CHANGES:\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}
function diffSummary(prev: string | null, next: string): { added: string[]; changed: string[]; removed: string[] } {
  if (!prev) return { added: ["Initial generation"], changed: [], removed: [] };
  const tags = (s: string) => new Set((s.match(/<([a-z][a-z0-9-]*)/gi) ?? []).map((t) => t.slice(1).toLowerCase()));
  const a = tags(prev), b = tags(next);
  const added = [...b].filter((x) => !a.has(x)).slice(0, 6).map((t) => `<${t}>`);
  const removed = [...a].filter((x) => !b.has(x)).slice(0, 6).map((t) => `<${t}>`);
  const sizeDelta = next.length - prev.length;
  const changed: string[] = [];
  if (Math.abs(sizeDelta) > 50) changed.push(`${sizeDelta > 0 ? "Expanded" : "Trimmed"} (${Math.abs(sizeDelta)} chars)`);
  if (!added.length && !removed.length && !changed.length) changed.push("Refined markup");
  return { added, changed, removed };
}
function detectKeyRequest(text: string): string | null {
  const m = text.match(/__API_KEY_([A-Z0-9_-]+)__/);
  if (m) return m[1].toLowerCase();
  const phrase = text.match(/I need your\s+([A-Za-z0-9 _-]+?)\s+API key/i);
  if (phrase) return phrase[1].trim().toLowerCase().replace(/\s+/g, "_");
  return null;
}

// ── Live Site Preview ─────────────────────────────────────────────────────────
// Shows the actual deployed Vercel site in an iframe.
// After pushing to GitHub, Vercel redeploys in ~60s and the iframe refreshes.
function WebContainerPreview({ files, iframeKey, liveUrl }: { files: Record<string, string>; iframeKey: number; liveUrl?: string }) {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // When iframeKey changes (after a push), wait 5s then refresh the iframe
    if (iframeKey > 0) {
      const t = setTimeout(() => setRefreshKey(k => k + 1), 5000);
      return () => clearTimeout(t);
    }
  }, [iframeKey]);

  if (!liveUrl) return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center">
      <p className="text-sm">No live URL configured for this project.</p>
      <p className="text-xs">Push to GitHub first — Vercel will deploy your site automatically.</p>
    </div>
  );

  return (
    <iframe
      key={refreshKey}
      src={liveUrl}
      className="w-full h-full bg-white rounded-md border border-border min-h-[70vh]"
      title="Live site preview"
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function ProjectPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const get = useServerFn(getProject);
  const route = useServerFn(callRouter);
  const save = useServerFn(savePreview);
  const wrapSite = useServerFn(wrapWebsiteAsApp);
  const publish = useServerFn(publishSite);
  const saveKey = useServerFn(saveApiKey);
  const listKeys = useServerFn(listApiKeys);
  const runSQL = useServerFn(runProjectSQL);
  const checkDeploy = useServerFn(checkVercelDeployment);
  const autoFix = useServerFn(autoFixFromVercelError);
  const healthCheck = useServerFn(runScheduledHealthCheck);
  const pullGitHub = useServerFn(pullFromGitHub);
  const pushCloudflare = useServerFn(pushToCloudflare);
  const saveKnowledge = useServerFn(saveProjectKnowledge);
  const getDiff = useServerFn(generateDiffPreview);
  const remix = useServerFn(remixProject);
  const runLoop = useServerFn(runFullVerificationLoop);

  const [data, setData] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"Build" | "Plan">("Build");
  const [modeOpen, setModeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewFiles, setPreviewFiles] = useState<Record<string, string> | null>(null);
  const [changedFiles, setChangedFiles] = useState<Record<string, string>>({});
  const [undoStack, setUndoStack] = useState<{ html: string; files: Record<string, string> | null }[]>([]);
  const [iframeKey, setIframeKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [wrapBusy, setWrapBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [keyModal, setKeyModal] = useState<{ service: string; value: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [savedKeys, setSavedKeys] = useState<{ service: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<"idle"|"checking"|"success"|"error"|"fixing"|"fixed">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => { setIsPhone(mq.matches); if (mq.matches) setDevice("mobile"); };
    apply(); mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!user) return;
    get({ data: { id } }).then(async (d) => {
      setData(d);
      if (d.project.preview_html) {
        const html = d.project.preview_html;
        setPreviewHtml(html);
        // Extract React source files using guardian from mayobuild.config
        if (html.includes('id="react-source"')) {
          try {
            const extracted = extractFilesFromScaffold(html);
            if (extracted && Object.keys(extracted).length > 0) setPreviewFiles(extracted);
          } catch {}
        }
        // Load past conversation history from Supabase so AI remembers previous sessions
        try {
          const sbUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
          const sbKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "";
          if (sbUrl && sbKey) {
            const { createClient } = await import("@supabase/supabase-js");
            const sb = createClient(sbUrl, sbKey);
            const { data: gens } = await sb
              .from("generations")
              .select("prompt,output,created_at")
              .eq("project_id", id)
              .eq("ok", true)
              .neq("task", "zip_import")
              .order("created_at", { ascending: true })
              .limit(20);
            if (gens && gens.length > 0) {
              const hist: ChatMsg[] = [];
              for (const g of gens) {
                if (g.prompt) hist.push({ role: "user", content: g.prompt });
                if (g.output) hist.push({ role: "assistant", content: g.output.slice(0, 1500), summary: { added: [], changed: ["previous edit"], removed: [] } });
              }
              hist.push({ role: "assistant", content: `Restored your last build. I remember ${gens.length} previous edit${gens.length === 1 ? "" : "s"}. Tell me what to change.` });
              setMessages(hist);
              return;
            }
          }
        } catch {}
        setMessages([{ role: "assistant", content: "Restored your last build. Tell me what to change." }]);
      }
    }).catch((e) => setErr(e.message));
    listKeys({ data: { projectId: id } }).then(setSavedKeys).catch(() => {});
  }, [user, id]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  const isMobile = data?.project?.kind === "mobile";
  const suggestions = isMobile ? MOBILE_SUGGESTIONS : WEBSITE_SUGGESTIONS;
  const liveUrl = data?.project?.github_repo ? deriveVercelUrl(data.project.github_repo) : undefined;
  const chainOrder = isMobile ? PROVIDER_ORDER_MOBILE : PROVIDER_ORDER_WEB;
  const showMobileOnly = isPhone || isMobile;
  const isReactSource = !!(previewFiles && Object.keys(previewFiles).length > 0);

  async function callWithFailover(payload: any): Promise<any> {
    let lastErr: any;
    for (let i = 0; i < chainOrder.length; i++) {
      const provider = chainOrder[i];
      try {
        const res = await route({ data: { ...payload, preferProvider: provider } });
        if (i > 0) toast(`Switched to ${provider}`, { description: "Previous provider was slow or unavailable." });
        return res;
      } catch (e) { lastErr = e; }
    }
    throw lastErr ?? new Error("All providers failed");
  }

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setErr(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next); setInput(""); setBusy(true);
    // Save current state to undo stack (keep last 5)
    setUndoStack((prev) => [...prev.slice(-4), { html: previewHtml, files: previewFiles }]);
    try {
      const changeContext = messages.filter((m) => m.role === "assistant" && m.summary).slice(-10)
        .map((m, i) => `Turn ${i + 1}: +${m.summary!.added.join(",")} ~${m.summary!.changed.join(",")} -${m.summary!.removed.join(",")}`).join("\n");

      // Build knowledge block from project settings (if set)
      const proj = data?.project;
      const knowledgeBlock = proj?.knowledge_description ? "\n\n" + buildKnowledgeBlock({
        projectName: proj.name ?? "",
        description: proj.knowledge_description ?? "",
        importantFiles: proj.knowledge_important_files ?? [],
        doNotTouch: proj.knowledge_do_not_touch ?? [],
        customInstructions: proj.knowledge_custom_instructions ?? "",
      }) : "";

      const sysBase = mode === "Plan" ? PLAN_SYSTEM : isMobile ? SYSTEM_MOBILE_BASE : (!previewHtml && !isReactSource) ? BUILD_SYSTEM_PROMPT : SYSTEM_WEBSITE;

      // Build explicit file tree so AI knows EXACTLY what files exist before choosing which one to edit
      const fileTree = isReactSource && previewFiles
        ? `\n\nPROJECT FILE TREE (these are the ONLY valid file paths — copy paths exactly from this list):\n${Object.keys(previewFiles).map((p) => `  - ${p}`).join("\n")}\n`
        : "";

      // Pass React files if available — routes first, capped at 40000 chars to avoid AI truncation
      const fileContext = isReactSource && previewFiles
        ? (() => {
            const entries = Object.entries(previewFiles);
            const routes = entries.filter(([p]) => p.includes("/routes/") || p.includes("route"));
            const others = entries.filter(([p]) => !p.includes("/routes/") && !p.includes("route"));
            const ordered = [...routes, ...others];
            let total = 0;
            const MAX = 40000;
            const chosen: string[] = [];
            for (const [path, content] of ordered) {
              const block = `/* ===== FILE: ${path} ===== */\n${content}`;
              if (total + block.length > MAX) break;
              chosen.push(block);
              total += block.length;
            }
            return chosen.join("\n\n");
          })()
        : null;

      const codeBlock = fileContext
        ? `\n\nFULL PROJECT SOURCE CODE (read ALL files, edit only what was asked):\n\`\`\`tsx\n${fileContext}\n\`\`\``
        : previewHtml
        ? `\n\nEXISTING CODE:\n\`\`\`${isMobile ? "tsx" : "html"}\n${previewHtml}\n\`\`\``
        : "";

      const historyBlock = changeContext ? `\n\nRECENT CHANGES:\n${changeContext}` : "";
      // AUTONOMOUS THINKING — AI reasons through problems rather than pattern-matching
      const autonomousBlock = `\n\n${AUTONOMOUS_THINKING_PROMPT}`;
      const system = `${sysBase}${knowledgeBlock}${fileTree}${codeBlock}${historyBlock}${autonomousBlock}\n\nMODE: ${mode.toUpperCase()}`;

      // First build = complex_app (creative, high temperature). Editing = website (precise, low temperature).
      const aiTask = isMobile ? "mobile_code" : (!previewHtml && !isReactSource) ? "complex_app" : "website";
      const res = await callWithFailover({ task: aiTask, prompt: trimmed, system, projectId: id, history });
      if (res.kind !== "text") return;
      const raw = res.text ?? "";
      let html: string | null = null;
      let summary: ChatMsg["summary"] | undefined;
      const changesLine = parseChangesLine(raw);
      // Declared here so auto-retry block can always access it regardless of mode
      const updatedFiles: Record<string, string> = { ...(previewFiles ?? {}) };

      if (mode === "Build") {
        if (isMobile) {
          const code = extractCode(raw) ?? raw;
          html = `<!doctype html><html><body style="margin:0;font:13px ui-monospace,Menlo,monospace;background:#0b0f1a;color:#e6edf3;padding:14px;white-space:pre-wrap;word-break:break-word">${code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</body></html>`;
          summary = diffSummary(previewHtml || null, code);
        } else if (isReactSource) {
          // For React projects — extract updated files and merge into previewFiles
          const fileMatches = [...raw.matchAll(/```(?:tsx|ts|jsx|js|typescript)(?:\s+([\w./\-\s]+?))?\s*\n([\s\S]*?)```/g)];
          if (fileMatches.length > 0) {
            // m[1] is the filepath (may be undefined if AI didn't include it)
            // Try to match against known previewFiles paths, else use a generated name
            for (const m of fileMatches) {
              const rawPath = m[1]?.trim() ?? "";
              const code = m[2].trim();
              if (rawPath) {
                // Strip ZIP root folder prefix if present
                const cleanedPath = rawPath.includes("/") && !rawPath.startsWith("src/") && !rawPath.startsWith("public/")
                  ? rawPath.split("/").slice(1).join("/")
                  : rawPath;
                updatedFiles[cleanedPath] = code;
              } else {
                // AI returned code without a filename — use matchFileFromCode guardian from mayobuild.config
                // This reads clues inside the code itself (route path, component name, imports, prompt words)
                const knownPaths = Object.keys(previewFiles ?? {});
                const bestPath = matchFileFromCode(code, knownPaths, trimmed);
                if (bestPath) updatedFiles[bestPath] = code;
              }
            }
            // Use guardian to detect only files that actually changed — blocks empty commits
            const actuallyChanged = getActuallyChangedFiles(previewFiles ?? {}, updatedFiles);
            if (Object.keys(actuallyChanged).length === 0) {
              // AI returned same code — tell user nothing changed
              summary = { added: [], changed: ["(AI returned same code — try being more specific, e.g. 'Add a search bar to the top of the Bible page')"], removed: [] };
            }
            setPreviewFiles(updatedFiles);
            setChangedFiles(actuallyChanged); // only push files that actually changed
            setIframeKey((k) => k + 1);
            // Rebuild scaffold HTML with updated files — use guardian from mayobuild.config
            html = rebuildScaffold(previewHtml, updatedFiles);
            summary = { added: fileMatches.map(m => m[1]), changed: [], removed: [] };
          } else {
            // Fallback — AI returned HTML (only clear React files if AI explicitly gave us HTML back)
            const found = extractHtml(raw);
            if (found) { html = found; setPreviewFiles(null); summary = diffSummary(previewHtml || null, found); }
            // If AI gave a text-only reply (question/answer with no code) — keep previewFiles intact
          }
        } else {
          const found = extractHtml(raw);
          if (found) { html = found; summary = diffSummary(previewHtml || null, found); }
        }
        if (changesLine && summary) summary.changed.unshift(changesLine);
      }

      // Extract readable summary - if AI only returned code, show which files changed
      let plain = raw.replace(/```[\s\S]*?```/g, "").replace(/CHANGES:[^\n]*/i, "").trim();
      if (!plain && html && isReactSource) {
        const changedFiles = [...raw.matchAll(/```(?:tsx|ts|jsx|js|typescript)(?:\s+([\w./\-\s]+?))?\s*\n/g)]
          .map(m => m[1]?.trim().split("/").pop() ?? "file")
          .filter(Boolean);
        plain = changedFiles.length > 0
          ? `Updated: ${changedFiles.join(", ")}`
          : "Files updated.";
      } else if (!plain) {
        plain = html ? "Updated." : "";
      }
      const reply: ChatMsg = { role: "assistant", content: plain, html: html ?? undefined, summary };
      setMessages([...next, reply]);
      if (html) {
        setPreviewHtml(html); setIframeKey((k) => k + 1);
        try { await save({ data: { id, preview_html: html } }); } catch {}
      } else if (isReactSource && previewFiles && previewHtml) {
        // AI gave a text-only reply (no code changes) — re-save scaffold so files survive page reload
        try { await save({ data: { id, preview_html: previewHtml } }); } catch {}
      }
      const wantKey = detectKeyRequest(raw);
      if (wantKey && !savedKeys.find((k) => k.service === wantKey)) setKeyModal({ service: wantKey, value: "" });

      // Auto Supabase table creation — if AI output SQL, run it automatically on the server
      const sqlBlock = extractSql(raw);
      if (sqlBlock) {
        try {
          const result = await runSQL({ data: { projectId: id, sql: sqlBlock } });
          if (result.ran > 0) {
            toast.success(`Supabase: ${result.ran} table${result.ran === 1 ? "" : "s"} created automatically.`);
          }
          if (result.errors.length > 0) {
            toast.warning(`Supabase SQL: ${result.errors[0]}`);
          }
        } catch {
          // Non-fatal — user can still paste SQL manually from the AI message
          toast("Supabase tables could not be auto-created. Copy the SQL from the AI message and paste it into your Supabase SQL editor.");
        }
      }

      // Auto-retry if AI picked wrong file (returned code but nothing matched known files = 0 files changed)
      if (isReactSource && previewFiles && Object.keys(updatedFiles).length === 0 && raw.length > 100) {
        setAutoRetrying(true);
        toast("AI picked the wrong file — auto-retrying with file guidance...");
        const fileList = Object.keys(previewFiles).map((p) => `  - ${p}`).join("\n");
        const retryPrompt = `Your previous response did not match any file in this project.\nUser asked: "${trimmed}"\nYou MUST use a path from this exact list:\n${fileList}\nApply the change now using the correct path.`;
        const retryRes = await callWithFailover({ task: aiTask, prompt: retryPrompt, system, projectId: id, history });
        setAutoRetrying(false);
        if (retryRes.kind === "text" && retryRes.text) {
          for (const block of retryRes.text.matchAll(/```(?:tsx?|jsx?|css|json)\s+([^\s`]+)\s*\n([\s\S]*?)```/g)) {
            const fpath = block[1].trim();
            const code = block[2].trim();
            if (fpath && code && previewFiles[fpath] !== undefined) updatedFiles[fpath] = code;
          }
        }
      }
    } catch (e: any) {
      setErr(e.message);
      setMessages([...next, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  }, [busy, messages, mode, isMobile, isReactSource, previewFiles, previewHtml, id, chainOrder, savedKeys]);

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setPreviewHtml(prev.html);
    setPreviewFiles(prev.files);
    setIframeKey((k) => k + 1);
    toast("Undone — restored previous version.");
  }

  async function restoreFromHistory(output: string) {
    // output is the AI's saved HTML/scaffold from generations table
    setUndoStack((prev) => [...prev.slice(-4), { html: previewHtml, files: previewFiles }]);
    setPreviewHtml(output);
    const extracted = extractFilesFromScaffold(output);
    if (extracted) setPreviewFiles(extracted);
    setIframeKey((k) => k + 1);
    setShowHistory(false);
    toast("Restored version from history.");
  }

  async function handlePullFromGitHub() {
    if (!data?.project?.github_repo) { toast.error("No GitHub repo linked to this project."); return; }
    toast("Pulling latest code from GitHub...");
    try {
      const result = await pullGitHub({ data: { projectId: id } });
      if (result.ok && Object.keys(result.files).length > 0) {
        setPreviewFiles(result.files);
        setIframeKey((k) => k + 1);
        toast.success(`Pulled ${result.pulledFiles} files from GitHub. Editor updated.`);
      }
    } catch (e: any) { toast.error(e.message); }
  }

  async function handlePushToCloudflare() {
    if (!previewFiles && !previewHtml) { toast.error("Nothing to push."); return; }
    toast("Pushing to Cloudflare Pages...");
    try {
      const filesToPush = previewFiles ?? { "index.html": previewHtml ?? "" };
      const result = await pushCloudflare({ data: { projectId: id, files: filesToPush, projectName: data?.project?.name ?? "mayobuild-site" } });
      if (result.ok) toast.success(`Deployed to Cloudflare Pages!`, { description: result.url });
      else toast.error(result.reason ?? "Cloudflare push failed.");
    } catch (e: any) { toast.error(e.message); }
  }

  async function exportSiteAsApp() {
    if (!previewHtml) { setErr("Generate something first."); return; }
    setWrapBusy(true); setErr(null);
    try {
      const res = await wrapSite({ data: { projectId: id, appName: data?.project?.name ?? "MyApp", html: previewHtml } });
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Android (Capacitor) ZIP downloaded");
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
    finally { setWrapBusy(false); }
  }

  function openSnack() {
    const code = isMobile ? (() => { const last = [...messages].reverse().find((m) => m.role === "assistant"); return last ? (extractCode(last.content) ?? last.content) : `export default function App(){return null}`; })() : previewHtml;
    window.open(`https://snack.expo.dev/?platform=android&name=${encodeURIComponent(data?.project?.name ?? "Mayobuild App")}&code=${encodeURIComponent(code)}`, "_blank", "noopener");
  }

  async function doPublish() {
    if (!previewHtml) { toast.error("Generate something first, then publish."); return; }
    setPublishBusy(true); setErr(null);
    try {
      // Strip zip folder prefix from file paths (e.g. "lite-read-main/src/..." → "src/...")
      // GitHub repo structure starts from "src/", not from the zip folder name
      let cleanFiles: Record<string, string> | undefined;
      if (previewFiles) {
        // Only push files that the AI actually changed, not ALL files
        // If AI changed specific files this session, push only those
        // Otherwise push all (e.g. first push after import)
        const filesToPush = Object.keys(changedFiles).length > 0 ? changedFiles : previewFiles;
        cleanFiles = {};
        for (const [path, fileContent] of Object.entries(filesToPush)) {
          // Remove leading folder prefix (e.g. "lite-read-main/" -> "")
          const cleanPath = path.replace(/^[^/]+\//, "");
          cleanFiles[cleanPath] = fileContent;
        }
      }
      // Validate before pushing — block empty commits and bad paths
      const validation = validateFilesForPush(cleanFiles ?? {});
      if (!validation.valid) {
        throw new Error("Cannot push: " + validation.errors.join(" | ") + " — Fix this then try again.");
      }
      if (validation.warnings.length > 0) {
        toast.warning("Push warning: " + validation.warnings[0]);
      }
      const res = await publish({ data: { projectId: id, html: previewHtml, files: cleanFiles } });
      setPublishedUrl(res.url);
      toast.success(res.method === "github" ? "Pushed to GitHub! Vercel is redeploying…" : "Live!", { description: res.url });
      setChangedFiles({}); // reset after successful push

      // After GitHub push — run the FULL AUTONOMOUS VERIFICATION LOOP
      // AI checks GitHub → Vercel → Live site → auto-fixes if anything wrong
      if (res.method === "github" && data?.project?.github_repo) {
        const repo = data.project.github_repo;
        setDeployStatus("checking");
        // Start loop after 75 seconds (enough time for Vercel to begin)
        setTimeout(async () => {
          try {
            const loopResult = await runLoop({
              data: {
                projectId: id,
                github_repo: repo,
                expectedChanges: Object.keys(changedFiles),
                userPrompt: messages[messages.length - 2]?.content ?? "",
              }
            });
            if (loopResult.ok) {
              setDeployStatus("success");
              toast.success("✅ All checks passed — GitHub, Vercel, and live site confirmed.", { description: loopResult.liveUrl ?? "" });
            } else {
              setDeployStatus("fixed");
              toast.success("🔧 Issue detected and auto-fixed — redeploying.");
            }
          } catch {
            setDeployStatus("idle");
          }
        }, 75_000);
      }

      if (res.method !== "github") window.open(res.url, "_blank", "noopener");
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
    finally { setPublishBusy(false); }
  }

  function openInNewTab() {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    if (f.type.startsWith("image/")) {
      reader.onload = () => setInput((p) => (p ? p + "\n\n" : "") + `Attached image "${f.name}": ${String(reader.result ?? "")}`);
      reader.readAsDataURL(f);
    } else {
      reader.onload = () => setInput((p) => (p ? p + "\n\n" : "") + `Attached "${f.name}":\n${String(reader.result ?? "").slice(0, 8000)}`);
      reader.readAsText(f);
    }
    e.target.value = "";
  }

  async function submitKey() {
    if (!keyModal) return;
    const v = keyModal.value.trim(); if (!v) { toast.error("Enter the key"); return; }
    setKeyBusy(true);
    try {
      await saveKey({ data: { projectId: id, service: keyModal.service, keyValue: v } });
      if (previewHtml) {
        const placeholder = `__API_KEY_${keyModal.service.toUpperCase()}__`;
        if (previewHtml.includes(placeholder)) {
          const updated = previewHtml.split(placeholder).join(v);
          setPreviewHtml(updated); setIframeKey((k) => k + 1);
          try { await save({ data: { id, preview_html: updated } }); } catch {}
        }
      }
      setSavedKeys((prev) => prev.find((k) => k.service === keyModal.service) ? prev : [...prev, { service: keyModal.service }]);
      toast.success(`${keyModal.service} key saved`); setKeyModal(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setKeyBusy(false); }
  }

  const previewSrcDoc = useMemo(() => previewHtml || EMPTY_PREVIEW, [previewHtml]);

  if (loading || !data) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{err ?? "Loading…"}</div>;

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background/70 backdrop-blur shrink-0">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <Link to="/" className="mb-btn-ghost shrink-0 h-9"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Workspace</span></Link>
          <div className="flex items-center gap-2 min-w-0">
            {isMobile ? <Smartphone className="h-4 w-4 text-accent shrink-0" /> : <Globe className="h-4 w-4 text-primary shrink-0" />}
            <h1 className="font-semibold truncate text-sm sm:text-base">{data.project.name}</h1>
            {isReactSource && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">React</span>}
          </div>
          <button onClick={doPublish} disabled={publishBusy || !previewHtml}
            className="shrink-0 inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium px-3 h-9 text-sm min-w-[88px]">
            {publishBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {isReactSource ? "Push to GitHub" : "Publish"}
          </button>
        </div>
        {publishedUrl && (
          <div className="px-3 pb-2 text-xs text-emerald-400 truncate flex items-center gap-2 flex-wrap">
            ● {isReactSource ? "Pushed to GitHub → Vercel redeploying" : "Live:"} <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline">{publishedUrl}</a>
            {deployStatus === "checking" && <span className="flex items-center gap-1 text-yellow-400"><Loader2 className="h-3 w-3 animate-spin" />Checking Vercel…</span>}
            {deployStatus === "success" && <span className="text-emerald-400">✅ Live</span>}
            {deployStatus === "fixing" && <span className="flex items-center gap-1 text-orange-400"><Loader2 className="h-3 w-3 animate-spin" />AI auto-fixing error…</span>}
            {deployStatus === "fixed" && <span className="text-emerald-400">🔧 Auto-fixed — redeploying</span>}
            {deployStatus === "error" && <span className="text-red-400">❌ Auto-fix failed — check GitHub</span>}
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        <aside className="md:w-[35%] md:min-w-[320px] md:max-w-[520px] border-r border-border flex flex-col min-h-0 max-h-[55vh] md:max-h-none">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 pt-4 pb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center"><Sparkles className="h-6 w-6 text-primary" /></div>
                <div><h2 className="font-semibold">Start your {isMobile ? "app" : "website"}</h2><p className="text-sm text-muted-foreground">Pick a template or describe what you want.</p></div>
                {/* Template gallery — grouped by category */}
                {(["Website","App","Mobile","Nigerian"] as const).map((cat) => (
                  <div key={cat} className="w-full text-left">
                    <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">{cat}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STARTER_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                        <button key={t.name} onClick={() => { setInput(t.prompt); }} className="text-left text-xs px-2.5 py-2 rounded-lg border border-border hover:bg-accent/10 hover:border-primary/40 transition-colors flex items-center gap-1.5">
                          <span className="text-base">{t.icon}</span>
                          <span className="font-medium">{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="w-full text-left">
                  <div className="text-xs font-semibold text-muted-foreground mb-1 px-1">Quick Prompts</div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {suggestions.map((s) => (<button key={s} onClick={() => send(s)} className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-accent/10 transition-colors">{s}</button>))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap" : "max-w-full text-sm text-foreground whitespace-pre-wrap"}>
                    {m.content || (m.role === "assistant" ? "Build updated." : "")}
                    {m.summary && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.summary.added.map((t, j) => (<span key={`a${j}`} className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">+ {t}</span>))}
                        {m.summary.changed.map((t, j) => (<span key={`c${j}`} className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">~ {t}</span>))}
                        {m.summary.removed.map((t, j) => (<span key={`r${j}`} className="px-2 py-0.5 rounded-full text-[11px] bg-rose-500/15 text-rose-300 border border-rose-500/30">− {t}</span>))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{autoRetrying ? "Wrong file detected — auto-retrying…" : "Thinking…"}</div>}
            {err && (
              <div className="text-sm text-destructive flex items-center gap-2 flex-wrap">
                <span>{err}</span>
                <button className="inline-flex items-center gap-1 text-xs underline text-primary" onClick={() => send(`Fix this error automatically: ${err}`)}>
                  <Wrench className="h-3 w-3" /> Try to fix
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3 space-y-2 bg-background">
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={isMobile ? "Describe what to change in your app…" : isReactSource ? "Describe what to change — AI reads all React files…" : "Describe what to change on your site…"}
              className="mb-input min-h-[68px] resize-none" />
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".txt,.md,.json,.html,.csv,image/*" className="hidden" onChange={handleAttach} />
              <button className="mb-btn-ghost h-9 w-9 p-0 justify-center" title="Attach" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /></button>
              <MicButton onTranscript={(t) => setInput((p) => (p ? p + " " + t : t))} />
              <button className="mb-btn-ghost h-9 w-9 p-0 justify-center" title="Add API key" onClick={() => setKeyModal({ service: "", value: "" })}><KeyRound className="h-4 w-4" /></button>
              <div className="relative">
                <button className="mb-btn-ghost h-9 px-2 text-xs" onClick={() => setModeOpen((v) => !v)}>{mode} <ChevronDown className="h-3 w-3" /></button>
                {modeOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-popover border border-border rounded-md shadow-lg z-10 min-w-[100px]">
                    {(["Build", "Plan"] as const).map((m) => (<button key={m} onClick={() => { setMode(m); setModeOpen(false); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent/20">{m}</button>))}
                  </div>
                )}
              </div>
              <div className="flex-1" />
              <button className="mb-btn h-9 px-3 min-w-[44px]" onClick={() => send(input)} disabled={busy || !input.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-h-0 bg-muted/20">
          <div className="border-b border-border px-2 py-2 flex items-center gap-2 bg-background/70 backdrop-blur overflow-x-auto">
            {!showMobileOnly && (
              <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                <button onClick={() => setDevice("desktop")} className={`px-3 h-11 text-xs flex items-center gap-1 min-w-[44px] ${device === "desktop" ? "bg-accent/30" : ""}`}><Monitor className="h-4 w-4" /> Desktop</button>
                <button onClick={() => setDevice("mobile")} className={`px-3 h-11 text-xs flex items-center gap-1 min-w-[44px] ${device === "mobile" ? "bg-accent/30" : ""}`}><Smartphone className="h-4 w-4" /> Mobile</button>
              </div>
            )}
            <button className="mb-btn-ghost h-11 w-11 p-0 justify-center shrink-0" title="Refresh preview" onClick={() => setIframeKey((k) => k + 1)}><RefreshCw className="h-4 w-4" /></button>
            <button className="mb-btn-ghost h-11 w-11 p-0 justify-center shrink-0" title="Pull latest from GitHub" onClick={handlePullFromGitHub}><GitPullRequest className="h-4 w-4" /></button>
            <button className="mb-btn-ghost h-11 w-11 p-0 justify-center shrink-0" title="Push to Cloudflare Pages" onClick={handlePushToCloudflare}><CloudUpload className="h-4 w-4" /></button>
            <button className="mb-btn-ghost h-11 w-11 p-0 justify-center shrink-0" title="Undo last AI edit" onClick={handleUndo} disabled={undoStack.length === 0}><Undo2 className="h-4 w-4" /></button>
            <button className="mb-btn-ghost h-11 w-11 p-0 justify-center shrink-0" title="Version history" onClick={() => setShowHistory((v) => !v)}><History className="h-4 w-4" /></button>
            <button className="mb-btn-ghost h-11 w-11 p-0 justify-center shrink-0" title="Open in new tab" onClick={openInNewTab} disabled={!previewHtml}><ExternalLink className="h-4 w-4" /></button>
            <div className="flex-1" />
            {isMobile ? (
              <>
                <button className="mb-btn h-11 px-3 shrink-0" onClick={openSnack}><Smartphone className="h-4 w-4" /><span className="hidden sm:inline">Test on Phone</span></button>
                <button className="mb-btn-ghost h-11 px-3 shrink-0" onClick={exportSiteAsApp} disabled={wrapBusy}>{wrapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">.zip</span></button>
              </>
            ) : (
              <button className="mb-btn-ghost h-11 px-3 shrink-0" onClick={exportSiteAsApp} disabled={wrapBusy}>{wrapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">Download Android App</span></button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 flex items-start justify-center">
            {isReactSource && previewFiles ? (
              <WebContainerPreview files={
                Object.fromEntries(
                  Object.entries(previewFiles).map(([p, c]) => [p.replace(/^[^/]+\//, ""), c])
                )
              } iframeKey={iframeKey} liveUrl={liveUrl} />
            ) : showMobileOnly || device === "mobile" ? (
              <div className="relative" style={{ width: 390, maxWidth: "100%" }}>
                <div className="rounded-[2.2rem] border-[10px] border-foreground/80 bg-foreground/80 shadow-2xl overflow-hidden">
                  <div className="h-5 bg-foreground/80 flex items-center justify-center"><div className="h-1.5 w-16 rounded-full bg-background/40" /></div>
                  <iframe key={iframeKey} title="Preview" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals" srcDoc={previewSrcDoc} className="w-full bg-white" style={{ height: 680 }} />
                </div>
              </div>
            ) : (
              <iframe key={iframeKey} title="Preview" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals" srcDoc={previewSrcDoc} className="w-full h-full bg-white rounded-md border border-border min-h-[70vh]" />
            )}
          </div>
        </section>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="mb-card p-6 max-w-lg w-full space-y-3 relative max-h-[80vh] flex flex-col">
            <button onClick={() => setShowHistory(false)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            <h3 className="text-lg font-semibold flex items-center gap-2"><History className="h-5 w-5" /> Version History</h3>
            <p className="text-xs text-muted-foreground">Click any version to restore it. Your current version is saved first so you can undo.</p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {messages.filter((m) => m.role === "assistant" && m.html).map((m, i) => (
                <button key={i} onClick={() => restoreFromHistory(m.html!)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-accent/10 text-sm transition-colors">
                  <div className="font-medium">Version {messages.filter((x) => x.role === "assistant" && x.html).length - i}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.content || "Build updated"}</div>
                  {m.summary && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {m.summary.added.slice(0,3).map((t, j) => <span key={j} className="text-[10px] text-emerald-400">+{t}</span>)}
                      {m.summary.changed.slice(0,3).map((t, j) => <span key={j} className="text-[10px] text-amber-400">~{t}</span>)}
                    </div>
                  )}
                </button>
              )).reverse()}
              {messages.filter((m) => m.role === "assistant" && m.html).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No versions yet. Build something first.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {keyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="mb-card p-6 max-w-md w-full space-y-3 relative">
            <button onClick={() => setKeyModal(null)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            <h3 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5" /> Add API key</h3>
            <p className="text-sm text-muted-foreground">Stored securely. The AI wires it into your build automatically.</p>
            <label className="block text-xs text-muted-foreground">Service (e.g. flutterwave, paystack, stripe, mapbox)</label>
            <input className="mb-input" value={keyModal.service} onChange={(e) => setKeyModal({ ...keyModal, service: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder="flutterwave" autoFocus={!keyModal.service} />
            <label className="block text-xs text-muted-foreground">Key</label>
            <input className="mb-input font-mono text-xs" type="password" value={keyModal.value} onChange={(e) => setKeyModal({ ...keyModal, value: e.target.value })} placeholder="sk_live_…" autoFocus={!!keyModal.service} />
            {savedKeys.length > 0 && <div className="text-xs text-muted-foreground">Saved: {savedKeys.map((k) => k.service).join(", ")}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button className="mb-btn-ghost" onClick={() => setKeyModal(null)} disabled={keyBusy}>Cancel</button>
              <button className="mb-btn" onClick={submitKey} disabled={keyBusy || !keyModal.service || !keyModal.value}>{keyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save key</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_PREVIEW = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;background:linear-gradient(135deg,#0b0f1a,#1a1033);color:#cbd5e1"><div style="text-align:center;padding:2rem"><div style="font-size:42px">✨</div><div style="margin-top:8px;font-size:14px;opacity:.7">Your preview will appear here</div></div></body></html>`;
