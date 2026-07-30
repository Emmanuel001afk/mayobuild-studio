import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  listIntegrations,
  saveIntegration,
  deleteIntegration,
} from "@/lib/integrations.functions";
import { githubStatus, githubListRepos, githubImportRepo } from "@/lib/github.functions";
import { consoleChat } from "@/lib/console.functions";
import JSZip from "jszip";
import {
  ArrowLeft,
  Bot,
  Database,
  Github,
  Loader2,
  Paperclip,
  Plug,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "AI Ops Console — Mayobuild Studio" },
      {
        name: "description",
        content:
          "Talk to the Mayobuild Orchestrator: connect GitHub, your database and your deployment platform, attach files and get real engineering answers.",
      },
      { property: "og:title", content: "AI Ops Console — Mayobuild Studio" },
      {
        property: "og:description",
        content: "Connect GitHub, database and deployment, then work with the Orchestrator AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsolePage,
});

type Msg = { role: "user" | "assistant"; content: string };
type Attach = { name: string; text: string };

function ConsolePage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  const fetchIntegrations = useServerFn(listIntegrations);
  const save = useServerFn(saveIntegration);
  const remove = useServerFn(deleteIntegration);
  const ghStatus = useServerFn(githubStatus);
  const ghRepos = useServerFn(githubListRepos);
  const ghImport = useServerFn(githubImportRepo);
  const chat = useServerFn(consoleChat);

  const [conns, setConns] = useState<any[]>([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [gh, setGh] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attach[]>([]);
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/" });
      return;
    }
    void refresh();
    taRef.current?.focus();
  }, [loading, user]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function refresh() {
    try {
      const r = await fetchIntegrations();
      setConns(r.items);
      setSetupRequired(r.setupRequired);
    } catch (e: any) {
      setNote(e.message);
    }
    try {
      setGh(await ghStatus());
    } catch {
      setGh({ connected: false });
    }
  }

  function connOf(p: string) {
    return conns.find((c) => c.provider === p);
  }

  async function doSave(provider: string, payload: any) {
    setBusy(provider);
    setNote(null);
    try {
      await save({ data: { provider, ...payload } });
      await refresh();
      setNote(`${provider} connection saved.`);
    } catch (e: any) {
      setNote(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function loadRepos() {
    setBusy("repos");
    setNote(null);
    try {
      const r = await ghRepos();
      setRepos(r.repos);
    } catch (e: any) {
      setNote(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function importRepo(full: string) {
    setBusy("import");
    setNote(null);
    try {
      const r = await ghImport({ data: { repo: full } });
      const summary = Object.entries(r.files)
        .slice(0, 40)
        .map(([p, c]) => `----- ${p} -----\n${(c as string).slice(0, 4000)}`)
        .join("\n\n");
      setAttachments((a) => [
        ...a,
        { name: `${full}@${r.branch} (${r.fileCount} files)`, text: summary },
      ]);
      setNote(`Loaded ${r.fileCount} files from ${full} into the conversation context.`);
    } catch (e: any) {
      setNote(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const next: Attach[] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      const lower = f.name.toLowerCase();
      try {
        if (lower.endsWith(".zip")) {
          const zip = await JSZip.loadAsync(await f.arrayBuffer());
          const entries = Object.values(zip.files).filter((z) => !z.dir);
          const listing = entries.map((z) => z.name).join("\n");
          const textFiles = entries.filter((z) =>
            /\.(tsx?|jsx?|css|html?|json|md|txt|sql|ya?ml|ino|cpp|h|py)$/i.test(z.name),
          );
          let body = "";
          for (const t of textFiles.slice(0, 25)) {
            body += `\n----- ${t.name} -----\n${(await t.async("string")).slice(0, 4000)}`;
          }
          next.push({
            name: `${f.name} (zip, ${entries.length} files)`,
            text: `FILE LIST:\n${listing}\n${body}`,
          });
        } else if (lower.endsWith(".pdf")) {
          const pdfjs = await import("pdfjs-dist");
          (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjs as any).version}/pdf.worker.min.mjs`;
          const doc = await (pdfjs as any).getDocument({ data: await f.arrayBuffer() }).promise;
          let text = "";
          for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
            const page = await doc.getPage(i);
            const c = await page.getTextContent();
            text += c.items.map((it: any) => it.str).join(" ") + "\n";
          }
          next.push({ name: `${f.name} (pdf, ${doc.numPages}p)`, text: text.slice(0, 40000) });
        } else if (/^image\//.test(f.type)) {
          next.push({
            name: `${f.name} (image)`,
            text: `[image attached: ${f.name}, ${Math.round(f.size / 1024)} KB, ${f.type}. Describe what you need done with it.]`,
          });
        } else if (/^video\//.test(f.type)) {
          next.push({
            name: `${f.name} (video)`,
            text: `[video attached: ${f.name}, ${Math.round(f.size / 1024 / 1024)} MB, ${f.type}.]`,
          });
        } else {
          next.push({ name: f.name, text: (await f.text()).slice(0, 40000) });
        }
      } catch (e: any) {
        next.push({ name: f.name, text: `[could not read: ${e.message}]` });
      }
    }
    setAttachments((a) => [...a, ...next]);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const nextMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    setInput("");
    setSending(true);
    try {
      const r = await chat({
        data: {
          messages: nextMsgs,
          attachments: attachments.map((a) => ({ name: a.name, text: a.text })),
          scope: isAdmin ? "admin" : "user",
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: r.text }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> AI Ops Console
        </h1>
        <div className="flex gap-2">
          {isAdmin && (
            <Link to="/admin" className="mb-btn-ghost text-sm">
              Overseer
            </Link>
          )}
          <Link to="/" className="mb-btn-ghost text-sm">
            <ArrowLeft className="h-4 w-4" /> Workspace
          </Link>
        </div>
      </div>

      {setupRequired && (
        <div className="mb-card p-4 mb-4 text-sm text-amber-500">
          Connections table missing. Run the <code>user_integrations</code> block at the bottom of{" "}
          <code>db/schema.sql</code> in your database, then reload.
        </div>
      )}
      {note && <div className="mb-card p-3 mb-4 text-sm">{note}</div>}

      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        {/* Connections */}
        <div className="space-y-4">
          <ConnCard
            icon={<Github className="h-4 w-4" />}
            title="GitHub"
            status={
              gh?.connected ? `Connected as ${gh.login}` : connOf("github") ? "Token saved" : "Not connected"
            }
            fields={[
              { key: "secret", label: "Personal access token (repo scope) or GitHub App token", type: "password" },
              { key: "label", label: "Default owner/org (optional)" },
            ]}
            existing={connOf("github")}
            busy={busy === "github"}
            onSave={(v) => doSave("github", v)}
            onDelete={async () => {
              await remove({ data: { provider: "github" } });
              setRepos([]);
              await refresh();
            }}
            extra={
              <div className="space-y-2">
                <button className="mb-btn-ghost text-xs" onClick={loadRepos} disabled={busy === "repos"}>
                  {busy === "repos" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}{" "}
                  List all repositories
                </button>
                {repos.length > 0 && (
                  <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                    {repos.map((r) => (
                      <div key={r.full_name} className="flex items-center justify-between gap-2 p-2 text-xs">
                        <span className="truncate">
                          {r.full_name}
                          {r.private && <span className="text-muted-foreground"> · private</span>}
                        </span>
                        <button
                          className="mb-btn-ghost text-[11px] shrink-0"
                          onClick={() => importRepo(r.full_name)}
                          disabled={busy === "import"}
                        >
                          Import
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            }
          />

          <ConnCard
            icon={<Database className="h-4 w-4" />}
            title="Database"
            status={connOf("supabase") ? "Connected" : "Not connected"}
            fields={[
              { key: "label", label: "Project URL or connection host" },
              { key: "secret", label: "Service role key / password", type: "password" },
            ]}
            existing={connOf("supabase")}
            busy={busy === "supabase"}
            onSave={(v) => doSave("supabase", v)}
            onDelete={async () => {
              await remove({ data: { provider: "supabase" } });
              await refresh();
            }}
          />

          <ConnCard
            icon={<Rocket className="h-4 w-4" />}
            title="Deployment"
            status={connOf("deploy") ? `Connected (${connOf("deploy").label ?? "hook"})` : "Not connected"}
            fields={[
              { key: "label", label: "Platform + project (e.g. vercel/my-site)" },
              { key: "secret", label: "API token or deploy hook URL", type: "password" },
            ]}
            existing={connOf("deploy")}
            busy={busy === "deploy"}
            onSave={(v) => doSave("deploy", v)}
            onDelete={async () => {
              await remove({ data: { provider: "deploy" } });
              await refresh();
            }}
          />

          <ConnCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Your own AI key (optional)"
            status={connOf("ai") ? "Using your key" : "Using platform AI"}
            fields={[
              { key: "secret", label: "API key", type: "password" },
              { key: "base_url", label: "Base URL (default https://api.openai.com/v1)" },
              { key: "model", label: "Model (default gpt-4o-mini)" },
            ]}
            existing={connOf("ai")}
            busy={busy === "ai"}
            onSave={(v) =>
              doSave("ai", {
                secret: v.secret,
                config: { base_url: v.base_url, model: v.model },
              })
            }
            onDelete={async () => {
              await remove({ data: { provider: "ai" } });
              await refresh();
            }}
          />
        </div>

        {/* Chat */}
        <div className="mb-card flex flex-col h-[70vh] lg:h-[78vh]">
          <div ref={boxRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  This is the Orchestrator. It can see the connections on the left, read anything you
                  attach, and help you build, debug, deploy and maintain — web, games, mobile or
                  microcontroller firmware.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Review my connected repo and tell me what's broken",
                    "Why is my deployment failing?",
                    "Design the database tables for a booking app",
                    "Write ESP32 firmware that posts sensor data to my API",
                  ].map((s) => (
                    <button key={s} className="mb-btn-ghost text-xs" onClick={() => setInput(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary/10 ml-8" : "bg-muted/30 mr-8"
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="text-[11px] bg-muted/40 rounded-full px-2 py-1 flex items-center gap-1"
                >
                  {a.name}
                  <button onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-border p-3 flex items-end gap-2">
            <label className="mb-btn-ghost cursor-pointer shrink-0" title="Attach files, zips, PDFs, images">
              <Paperclip className="h-4 w-4" />
              <input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="Ask the Orchestrator anything about your stack…"
              className="flex-1 bg-transparent border border-border rounded-lg px-3 py-2 text-sm resize-none outline-none focus:border-primary"
            />
            <button className="mb-btn shrink-0" onClick={() => void send()} disabled={sending}>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnCard({
  icon,
  title,
  status,
  fields,
  existing,
  busy,
  onSave,
  onDelete,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  fields: { key: string; label: string; type?: string }[];
  existing?: any;
  busy?: boolean;
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing) {
      setValues((v) => ({
        label: existing.label ?? "",
        base_url: existing.config?.base_url ?? "",
        model: existing.config?.model ?? "",
        ...v,
      }));
    }
  }, [existing]);

  return (
    <div className="mb-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          {icon} {title}
        </div>
        <button className="mb-btn-ghost text-xs" onClick={() => setOpen((o) => !o)}>
          <Plug className="h-3 w-3" /> {open ? "Close" : existing ? "Edit" : "Connect"}
        </button>
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {status}
        {existing?.masked ? ` · ${existing.masked}` : ""}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {fields.map((f) => (
            <input
              key={f.key}
              type={f.type ?? "text"}
              placeholder={f.label}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary"
            />
          ))}
          <div className="flex gap-2">
            <button className="mb-btn text-xs" onClick={() => onSave(values)} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save
            </button>
            {existing && (
              <button className="mb-btn-ghost text-xs text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" /> Disconnect
              </button>
            )}
          </div>
        </div>
      )}

      {extra && <div className="mt-3">{extra}</div>}
    </div>
  );
}
