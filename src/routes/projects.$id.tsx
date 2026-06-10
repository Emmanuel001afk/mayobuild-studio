import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  getProject, savePreview, publishSite, saveApiKey, listApiKeys,
} from "@/lib/projects.functions";
import { callRouter } from "@/lib/router.functions";
import { wrapWebsiteAsApp } from "@/lib/mobile-gen.functions";
import { MicButton } from "@/components/MicButton";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Send, Globe, Smartphone, Monitor, RefreshCw,
  ExternalLink, Rocket, Paperclip, ChevronDown, Download, Sparkles,
  KeyRound, X,
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

const SYSTEM_WEBSITE_BASE = [
  "You are Mayobuild AI. You improve and edit existing websites AND React/TypeScript source code. When given React or TypeScript source files, read them fully, understand all features, pages, components, and logic, then rebuild everything as a complete working single-file HTML website with all features, pages, navigation, forms, and functionality preserved.",
  "Never rewrite from scratch unless the user explicitly says 'start over completely'.",
  "Read the EXISTING CODE block fully before making any change.",
  "Only modify exactly what the user requested. Preserve all existing features, colors, layout, copy, and structure.",
  "Use rich visuals when adding new sections: Unsplash (https://images.unsplash.com/...) or Picsum (https://picsum.photos/seed/<word>/1600/900) backgrounds, CSS gradients, inline SVG icons, accessible alt text, mobile-first responsive layout.",
  "Respond in this EXACT format and nothing else:",
  "1) 2-3 plain English sentences describing what changed in this turn (NO code in this part).",
  "2) A single line: 'CHANGES: Added [x] | Modified [y] | Removed [z]'",
  "3) The complete updated HTML document inside ONE ```html ... ``` fenced block (single file, embedded CSS/JS, no external files).",
  "Never apologize. Never say you are an AI. Never mention Lovable.",
  "If a feature requires a third-party API key (e.g. Flutterwave, Paystack, Stripe, OpenAI, Mapbox), insert the literal placeholder __API_KEY_<SERVICE>__ in the code where the key goes, and in your plain English section say: 'I need your <SERVICE> API key — click the Add API key button.'",
].join(" ");

const SYSTEM_MOBILE_BASE = [
  "You are Mayobuild AI. You improve an existing Expo React Native App.tsx (TypeScript) only.",
  "Read EXISTING CODE before changing it. Only modify what the user asked for. Preserve everything else.",
  "Use only standard Expo SDK on Snack: react, react-native, expo-status-bar. No external native modules.",
  "Respond in this EXACT format: 2-3 plain English sentences, then 'CHANGES: Added [x] | Modified [y] | Removed [z]', then ONE ```tsx``` fenced block with the complete updated App.tsx.",
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

const PROVIDER_ORDER_WEB = ["openrouter", "mistral", "huggingface", "cerebras"];
const PROVIDER_ORDER_MOBILE = ["deepseek", "openai", "groq", "gemini"];

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
  const tags = (s: string) =>
    new Set((s.match(/<([a-z][a-z0-9-]*)/gi) ?? []).map((t) => t.slice(1).toLowerCase()));
  const a = tags(prev), b = tags(next);
  const added = [...b].filter((x) => !a.has(x)).slice(0, 6).map((t) => `<${t}>`);
  const removed = [...a].filter((x) => !b.has(x)).slice(0, 6).map((t) => `<${t}>`);
  const sizeDelta = next.length - prev.length;
  const changed: string[] = [];
  if (Math.abs(sizeDelta) > 50)
    changed.push(`${sizeDelta > 0 ? "Expanded" : "Trimmed"} (${Math.abs(sizeDelta)} chars)`);
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

  const [data, setData] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"Build" | "Plan">("Build");
  const [modeOpen, setModeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [iframeKey, setIframeKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [wrapBusy, setWrapBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [keyModal, setKeyModal] = useState<{ service: string; value: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [savedKeys, setSavedKeys] = useState<{ service: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      setIsPhone(mq.matches);
      if (mq.matches) setDevice("mobile");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!user) return;
    get({ data: { id } })
      .then((d) => {
        setData(d);
        if (d.project.preview_html) {
          setPreviewHtml(d.project.preview_html);
          setMessages([
            { role: "assistant", content: "Restored your last build. Tell me what to change." },
          ]);
        }
      })
      .catch((e) => setErr(e.message));
    listKeys({ data: { projectId: id } }).then(setSavedKeys).catch(() => {});
  }, [user, id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const isMobile = data?.project?.kind === "mobile";
  const suggestions = isMobile ? MOBILE_SUGGESTIONS : WEBSITE_SUGGESTIONS;
  const chainOrder = isMobile ? PROVIDER_ORDER_MOBILE : PROVIDER_ORDER_WEB;
  const showMobileOnly = isPhone || isMobile;

  async function callWithFailover(payload: any): Promise<{ kind: string; text?: string; provider?: string; dataUrl?: string }> {
    let lastErr: any;
    for (let i = 0; i < chainOrder.length; i++) {
      const provider = chainOrder[i];
      try {
        const res = await Promise.race([
          route({ data: { ...payload, preferProvider: provider } }),
          new Promise((_, rj) => setTimeout(() => rj(new Error("timeout 15s")), 15000)),
        ]);
        if (i > 0) toast(`Switched to ${provider}`, { description: "Previous provider was slow or unavailable." });
        return res as any;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("All providers failed");
  }

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
      const changeContext = messages
        .filter((m) => m.role === "assistant" && m.summary)
        .slice(-10)
        .map((m, i) =>
          `Turn ${i + 1}: +${m.summary!.added.join(",")} ~${m.summary!.changed.join(",")} -${m.summary!.removed.join(",")}`,
        )
        .join("\n");
      const sysBase = mode === "Plan" ? PLAN_SYSTEM : isMobile ? SYSTEM_MOBILE_BASE : SYSTEM_WEBSITE_BASE;
      const isReactSource = previewHtml?.includes('type="text/plain"') && previewHtml?.includes('react-source');
      const codeBlock = previewHtml ? `\n\nEXISTING CODE (modify this, do not rewrite):\n\`\`\`${isReactSource ? "tsx" : isMobile ? "tsx" : "html"}\n${previewHtml}\n\`\`\`` : "";
      const historyBlock = changeContext ? `\n\nRECENT CHANGES SUMMARY:\n${changeContext}` : "";
      const system = `${sysBase}${codeBlock}${historyBlock}\n\nMODE: ${mode.toUpperCase()}`;

      const res = await callWithFailover({
        task: isMobile ? "mobile_code" : "website",
        prompt: trimmed,
        system,
        projectId: id,
        history,
      });
      if (res.kind !== "text") return;
      const raw = res.text ?? "";
      let html: string | null = null;
      let summary: ChatMsg["summary"] | undefined;
      const changesLine = parseChangesLine(raw);
      if (mode === "Build") {
        if (isMobile) {
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
        if (changesLine && summary) summary.changed.unshift(changesLine);
      }
      const plain = raw
        .replace(/```[\s\S]*?```/g, "")
        .replace(/CHANGES:[^\n]*/i, "")
        .trim() || (html ? "Updated your build." : "");
      const reply: ChatMsg = { role: "assistant", content: plain, html: html ?? undefined, summary };
      setMessages([...next, reply]);
      if (html) {
        setPreviewHtml(html);
        setIframeKey((k) => k + 1);
        try { await save({ data: { id, preview_html: html } }); } catch {}
      }
      const wantKey = detectKeyRequest(raw);
      if (wantKey && !savedKeys.find((k) => k.service === wantKey)) {
        setKeyModal({ service: wantKey, value: "" });
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
      toast.success("Android (Capacitor) ZIP downloaded");
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
    finally { setWrapBusy(false); }
  }

  function openSnack() {
    const code = isMobile
      ? (() => {
          const last = [...messages].reverse().find((m) => m.role === "assistant");
          return last ? (extractCode(last.content) ?? last.content) : `export default function App(){return null}`;
        })()
      : previewHtml;
    const url = `https://snack.expo.dev/?platform=android&name=${encodeURIComponent(
      data?.project?.name ?? "Mayobuild App"
    )}&code=${encodeURIComponent(code)}`;
    window.open(url, "_blank", "noopener");
  }

  async function doPublish() {
    if (!previewHtml) { toast.error("Generate something first, then publish."); return; }
    setPublishBusy(true); setErr(null);
    try {
      const res = await publish({ data: { projectId: id, html: previewHtml } });
      setPublishedUrl(res.url);
      toast.success("Live!", { description: res.url });
      window.open(res.url, "_blank", "noopener");
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

  async function submitKey() {
    if (!keyModal) return;
    const v = keyModal.value.trim();
    if (!v) { toast.error("Enter the key"); return; }
    setKeyBusy(true);
    try {
      await saveKey({ data: { projectId: id, service: keyModal.service, keyValue: v } });
      if (previewHtml) {
        const placeholder = `__API_KEY_${keyModal.service.toUpperCase()}__`;
        if (previewHtml.includes(placeholder)) {
          const updated = previewHtml.split(placeholder).join(v);
          setPreviewHtml(updated);
          setIframeKey((k) => k + 1);
          try { await save({ data: { id, preview_html: updated } }); } catch {}
        }
      }
      setSavedKeys((prev) => prev.find((k) => k.service === keyModal.service) ? prev : [...prev, { service: keyModal.service }]);
      toast.success(`${keyModal.service} key saved`);
      setKeyModal(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setKeyBusy(false);
    }
  }

  const previewSrcDoc = useMemo(() => previewHtml || EMPTY_PREVIEW, [previewHtml]);

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{err ?? "Loading…"}</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-background/70 backdrop-blur shrink-0">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <Link to="/" className="mb-btn-ghost shrink-0 h-9"><ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Workspace</span></Link>
          <div className="flex items-center gap-2 min-w-0">
            {isMobile ? <Smartphone className="h-4 w-4 text-accent shrink-0" /> : <Globe className="h-4 w-4 text-primary shrink-0" />}
            <h1 className="font-semibold truncate text-sm sm:text-base">{data.project.name}</h1>
          </div>
          <button
            onClick={doPublish}
            disabled={publishBusy || !previewHtml}
            className="shrink-0 inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium px-3 h-9 text-sm min-w-[88px]"
            title="Publish live"
          >
            {publishBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publish
          </button>
        </div>
        {publishedUrl && (
          <div className="px-3 pb-2 text-xs text-emerald-400 truncate">
            ● Live: <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline">{publishedUrl}</a>
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        <aside className="md:w-[35%] md:min-w-[320px] md:max-w-[520px] border-r border-border flex flex-col min-h-0 max-h-[55vh] md:max-h-none">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 pt-6">
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
                    {m.content || (m.role === "assistant" ? "Build updated." : "")}
                    {m.summary && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.summary.added.map((t, j) => (
                          <span key={`a${j}`} className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">+ {t}</span>
                        ))}
                   