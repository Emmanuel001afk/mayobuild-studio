import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getProject, savePreview } from "@/lib/projects.functions";
import { callRouter } from "@/lib/router.functions";
import { wrapWebsiteAsApp } from "@/lib/mobile-gen.functions";
import { MicButton } from "@/components/MicButton";
import {
  ArrowLeft, Loader2, Send, Globe, Smartphone, Monitor, RefreshCw,
  ExternalLink, Rocket, Paperclip, ChevronDown, Download, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Editor — Mayobuild Studio" }] }),
  component: ProjectPage,
});

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  html?: string;
  summary?: { added: string[]; changed: string[]; removed: string[] };
};

const SYSTEM_WEBSITE =
  'You are Mayobuild AI. Generate complete single-file HTML with embedded CSS and JS. Always add features the user didn\'t ask for but needs. Output code in html tags.';
const SYSTEM_MOBILE =
  'You are Mayobuild AI. Generate a complete single-file Expo React Native App.tsx (TypeScript). Always add features the user didn\'t ask for but needs (permissions, error states, empty states). Output code in ```tsx``` tags.';

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
function diffSummary(prev: string | null, next: string): { added: string[]; changed: string[]; removed: string[] } {
  if (!prev) return { added: ["Initial generation"], changed: [], removed: [] };
  const tags = (s: string) =>
    new Set((s.match(/<([a-z][a-z0-9-]*)/gi) ?? []).map((t) => t.slice(1).toLowerCase()));
  const a = tags(prev), b = tags(next);
  const added = [...b].filter((x) => !a.has(x)).slice(0, 6).map((t) => `<${t}> elements`);
  const removed = [...a].filter((x) => !b.has(x)).slice(0, 6).map((t) => `<${t}> elements`);
  const sizeDelta = next.length - prev.length;
  const changed: string[] = [];
  if (Math.abs(sizeDelta) > 50)
    changed.push(`${sizeDelta > 0 ? "Expanded" : "Trimmed"} content (${Math.abs(sizeDelta)} chars)`);
  if (!added.length && !removed.length && !changed.length) changed.push("Refined existing markup");
  return { added, changed, removed };
}

function ProjectPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const get = useServerFn(getProject);
  const route = useServerFn(callRouter);
  const save = useServerFn(savePreview);
  const wrapSite = useServerFn(wrapWebsiteAsApp);

  const [data, setData] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"Build" | "Plan">("Build");
  const [modeOpen, setModeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [iframeKey, setIframeKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [wrapBusy, setWrapBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    get({ data: { id } })
      .then((d) => {
        setData(d);
        if (d.project.preview_html) {
          setPreviewHtml(d.project.preview_html);
          setMessages([
            {
              role: "assistant",
              content: "Restored your last build. Send a message to iterate.",
              html: d.project.preview_html,
            },
          ]);
        }
      })
      .catch((e) => setErr(e.message));
  }, [user, id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const isMobile = data?.project?.kind === "mobile";
  const suggestions = isMobile ? MOBILE_SUGGESTIONS : WEBSITE_SUGGESTIONS;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setErr(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const system =
        mode === "Plan"
          ? "You are Mayobuild AI. Outline a short plan in markdown with numbered steps. Do not write code yet."
          : isMobile
            ? SYSTEM_MOBILE
            : SYSTEM_WEBSITE;
      const res = await route({
        data: {
          task: isMobile ? "mobile_code" : "website",
          prompt: trimmed,
          system,
          projectId: id,
          history,
        },
      });
      if (res.kind !== "text") return;
      const raw = res.text;
      let html: string | null = null;
      let summary: ChatMsg["summary"] | undefined;
      if (mode === "Build") {
        if (isMobile) {
          // Mobile: keep code, render in preview as <pre>
          const code = extractCode(raw) ?? raw;
          html = `<!doctype html><html><body style="margin:0;font:13px ui-monospace,Menlo,monospace;background:#0b0f1a;color:#e6edf3;padding:14px;white-space:pre-wrap;word-break:break-word">${
            code.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
          }</body></html>`;
          summary = diffSummary(previewHtml || null, code);
        } else {
          const found = extractHtml(raw);
          if (found) {
            html = found;
            summary = diffSummary(previewHtml || null, found);
          }
        }
      }
      const reply: ChatMsg = {
        role: "assistant",
        content: mode === "Plan" || !html ? raw : "Here's your updated build.",
        html: html ?? undefined,
        summary,
      };
      setMessages([...next, reply]);
      if (html) {
        setPreviewHtml(html);
        setIframeKey((k) => k + 1);
        try { await save({ data: { id, preview_html: html } }); } catch {}
      }
    } catch (e: any) {
      setErr(e.message);
      setMessages([...next, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
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
    } catch (e: any) { setErr(e.message); }
    finally { setWrapBusy(false); }
  }

  function openSnack() {
    // Extract latest App.tsx-ish code from messages
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    const code = last ? (extractCode(last.content) ?? last.content) : `export default function App(){return null}`;
    const url = `https://snack.expo.dev/?platform=android&name=${encodeURIComponent(
      data?.project?.name ?? "Mayobuild App"
    )}&code=${encodeURIComponent(code)}`;
    window.open(url, "_blank", "noopener");
  }

  function openInNewTab() {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "").slice(0, 8000);
      setInput((p) => (p ? p + "\n\n" : "") + `Attached "${f.name}":\n${text}`);
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  const previewSrcDoc = useMemo(() => previewHtml || EMPTY_PREVIEW, [previewHtml]);

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{err ?? "Loading…"}</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background/70 backdrop-blur shrink-0">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <Link to="/" className="mb-btn-ghost shrink-0"><ArrowLeft className="h-4 w-4" /> Workspace</Link>
          <div className="flex items-center gap-2 min-w-0">
            {isMobile ? <Smartphone className="h-4 w-4 text-accent shrink-0" /> : <Globe className="h-4 w-4 text-primary shrink-0" />}
            <h1 className="font-semibold truncate">{data.project.name}</h1>
          </div>
          <div className="shrink-0" />
        </div>
      </header>

      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        {/* LEFT: chat 35% */}
        <aside className="md:w-[35%] md:min-w-[320px] md:max-w-[520px] border-r border-border flex flex-col min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 pt-10">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Start your {isMobile ? "app" : "website"}</h2>
                  <p className="text-sm text-muted-foreground">Pick a starter or describe what you want.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-accent/10 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                        : "max-w-full text-sm text-foreground whitespace-pre-wrap"
                    }
                  >
                    {m.role === "assistant" ? renderAssistant(m.content) : m.content}
                    {m.summary && (
                      <div className="mt-2 rounded-lg border border-border bg-card/60 p-2 text-xs space-y-1">
                        {m.summary.added.length > 0 && (
                          <div><span className="text-emerald-400 font-medium">+ Added:</span> {m.summary.added.join(", ")}</div>
                        )}
                        {m.summary.changed.length > 0 && (
                          <div><span className="text-amber-400 font-medium">~ Changed:</span> {m.summary.changed.join(", ")}</div>
                        )}
                        {m.summary.removed.length > 0 && (
                          <div><span className="text-rose-400 font-medium">− Removed:</span> {m.summary.removed.join(", ")}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
            {err && <div className="text-sm text-destructive">{err}</div>}
          </div>

          {/* composer */}
          <div className="border-t border-border p-3 space-y-2 bg-background">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder={isMobile ? "Describe your app…" : "Describe your website…"}
              className="mb-input min-h-[72px] resize-none"
            />
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".txt,.md,.json,.html,.csv" className="hidden" onChange={handleAttach} />
              <button className="mb-btn-ghost h-8 w-8 p-0 justify-center" title="Attach" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
              </button>
              <MicButton onTranscript={(t) => setInput((p) => (p ? p + " " + t : t))} />
              <div className="relative">
                <button className="mb-btn-ghost h-8 px-2 text-xs" onClick={() => setModeOpen((v) => !v)}>
                  {mode} <ChevronDown className="h-3 w-3" />
                </button>
                {modeOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-popover border border-border rounded-md shadow-lg z-10 min-w-[100px]">
                    {(["Build", "Plan"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setModeOpen(false); }}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent/20"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1" />
              <button className="mb-btn h-8 px-3" onClick={() => send(input)} disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </aside>

        {/* RIGHT: preview 65% */}
        <section className="flex-1 flex flex-col min-h-0 bg-muted/20">
          <div className="border-b border-border px-3 py-2 flex items-center gap-2 bg-background/70 backdrop-blur">
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setDevice("desktop")}
                className={`px-2 py-1 text-xs flex items-center gap-1 ${device === "desktop" ? "bg-accent/30" : ""}`}
              >
                <Monitor className="h-3.5 w-3.5" /> Desktop
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={`px-2 py-1 text-xs flex items-center gap-1 ${device === "mobile" ? "bg-accent/30" : ""}`}
              >
                <Smartphone className="h-3.5 w-3.5" /> Mobile
              </button>
            </div>
            <button className="mb-btn-ghost h-8 px-2" title="Refresh" onClick={() => setIframeKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="mb-btn-ghost h-8 px-2" title="Open in new tab" onClick={openInNewTab} disabled={!previewHtml}>
              <ExternalLink className="h-4 w-4" />
            </button>
            <div className="flex-1" />
            {isMobile ? (
              <>
                <button className="mb-btn h-8 px-3" onClick={openSnack} title="Preview on a real phone via Expo Snack">
                  <Smartphone className="h-4 w-4" /> Preview on Phone
                </button>
                <button className="mb-btn-ghost h-8 px-3" onClick={exportSiteAsApp} disabled={wrapBusy} title="Download Expo .zip">
                  {wrapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  .zip
                </button>
              </>
            ) : (
              <>
                <button className="mb-btn-ghost h-8 px-3" onClick={exportSiteAsApp} disabled={wrapBusy} title="Wrap as Android Expo app">
                  {wrapBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  Export app
                </button>
                <a
                  href="https://docs.lovable.dev/features/publishing"
                  target="_blank"
                  rel="noreferrer"
                  className="mb-btn h-8 px-3"
                >
                  <Rocket className="h-4 w-4" /> Publish
                </a>
              </>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
            {isMobile || device === "mobile" ? (
              <div className="relative" style={{ width: 360, maxWidth: "100%" }}>
                <div className="rounded-[2.2rem] border-[10px] border-foreground/80 bg-foreground/80 shadow-2xl overflow-hidden">
                  <div className="h-5 bg-foreground/80 flex items-center justify-center">
                    <div className="h-1.5 w-16 rounded-full bg-background/40" />
                  </div>
                  <iframe
                    key={iframeKey}
                    title="Preview"
                    sandbox="allow-scripts allow-forms"
                    srcDoc={previewSrcDoc}
                    className="w-full bg-white"
                    style={{ height: 640 }}
                  />
                </div>
              </div>
            ) : (
              <iframe
                key={iframeKey}
                title="Preview"
                sandbox="allow-scripts allow-forms"
                srcDoc={previewSrcDoc}
                className="w-full h-full bg-white rounded-md border border-border min-h-[70vh]"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const EMPTY_PREVIEW = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui;background:linear-gradient(135deg,#0b0f1a,#1a1033);color:#cbd5e1"><div style="text-align:center;padding:2rem"><div style="font-size:42px">✨</div><div style="margin-top:8px;font-size:14px;opacity:.7">Your preview will appear here</div></div></body></html>`;

function renderAssistant(text: string) {
  // strip code fences from inline display (the iframe shows the build)
  const cleaned = text.replace(/```[\s\S]*?```/g, "").trim();
  return cleaned || "Build updated.";
}
