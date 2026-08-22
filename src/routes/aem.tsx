// src/routes/aem.tsx
// The AEM AI Hub workspace — this is THE page where you:
//   Step 1  upload / pick your .gguf local model (it runs inside this tab)
//   Step 2  issue the AM_ API keys other websites use
//   Step 3  talk to AEM AI, which uses the local model first and falls back
//           to the hosted providers automatically
// Other sites reach the same brain at POST /api/hub with an AM_ key.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Send,
  Cpu,
  CheckCircle2,
  KeyRound,
  Copy,
  ShieldAlert,
  UploadCloud,
  Database,
  Radio,
  Terminal,
} from "lucide-react";
import { createHubKey, listHubKeys, revokeHubKey } from "@/lib/aem-key.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/aem")({
  head: () => ({
    meta: [
      { title: "AEM AI Hub — Mayobuild Studio" },
      {
        name: "description",
        content:
          "Load your own .gguf model into the browser, issue hub API keys and talk to AEM AI, the shared brain behind all your websites.",
      },
      { property: "og:title", content: "AEM AI Hub — Mayobuild Studio" },
      { property: "og:description", content: "Local GGUF model workspace, hub API keys and the AEM AI chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AemPage,
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  source?: string;
}

function AemPage() {
  const { user, loading, isAdmin } = useAuth();
  const createKeyFn = useServerFn(createHubKey);
  const listKeysFn = useServerFn(listHubKeys);
  const revokeKeyFn = useServerFn(revokeHubKey);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const [modelStatus, setModelStatus] = useState<string>("No model loaded yet");
  const [modelName, setModelName] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [dragging, setDragging] = useState(false);
  const deviceIdRef = useRef<string | null>(null);

  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<"owner" | "restricted">("restricted");
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listKeysFn().then(setKeys).catch(() => {});
  }, [isAdmin]);

  async function handleCreateKey() {
    if (!newKeyLabel.trim()) return;
    const result = await createKeyFn({ data: { label: newKeyLabel, scope: newKeyScope } });
    setJustCreatedKey(result.fullKey);
    setApiKey(result.fullKey); // pre-fill the chat below so it works instantly
    setNewKeyLabel("");
    listKeysFn().then(setKeys).catch(() => {});
  }

  async function bootModel(files: File[]) {
    setLoadingModel(true);
    try {
      const { startLocalModelTab } = await import("@/lib/local-model-tab.browser");
      setModelName(files.map((f) => f.name).join(", "));
      const { deviceId } = await startLocalModelTab(files, (status) => setModelStatus(status));
      deviceIdRef.current = deviceId;
      setModelReady(true);
    } catch (err) {
      setModelStatus(`Failed: ${(err as Error).message}`);
      setModelReady(false);
    } finally {
      setLoadingModel(false);
    }
  }

  async function handlePickModel() {
    try {
      setModelStatus("Waiting for the file picker…");
      const { pickModelFileFromDevice } = await import("@/lib/local-model-tab.browser");
      const files = await pickModelFileFromDevice();
      await bootModel(files);
    } catch (err) {
      setModelStatus(`Failed: ${(err as Error).message}`);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".gguf"));
    if (!files.length) {
      setModelStatus("That wasn't a .gguf file — try again.");
      return;
    }
    void bootModel(files);
  }

  async function handleSend() {
    if (!input.trim()) return;
    if (!apiKey.trim()) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Add or create a hub API key in Step 2 first — the chat uses it to authenticate." },
      ]);
      return;
    }
    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          message: userMsg.content,
          deviceId: deviceIdRef.current ?? undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${errText}` }]);
        return;
      }

      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.answer, source: data.source }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Request failed: ${(err as Error).message}` }]);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="mb-card p-8 max-w-md text-center">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h1 className="text-xl font-bold mb-1">Restricted area</h1>
          <p className="text-sm text-muted-foreground mb-4">
            The AEM AI hub is available to the overseer account only.
          </p>
          <Link to="/" className="mb-btn">Back to workspace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-3xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" /> AEM AI Hub
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your local GGUF model workspace + the shared brain other websites call at
              <code className="mx-1 px-1 rounded bg-muted/50 text-xs">POST /api/hub</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/setup" className="mb-btn-ghost text-sm"><Database className="h-4 w-4" /> SQL</Link>
            <Link to="/admin" className="mb-btn-ghost text-sm">Overseer</Link>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${
              modelReady ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
            }`}
          >
            <Radio className="h-3 w-3" /> {modelReady ? "Local model online" : "Local model offline"}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-muted-foreground">
            <KeyRound className="h-3 w-3" /> {keys.filter((k) => !k.revoked).length} active keys
          </span>
        </div>
      </header>

      {/* ---------- STEP 1 — GGUF upload ---------- */}
      <Step n={1} title="Upload your local model (.gguf)">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={handlePickModel}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
          }`}
        >
          {loadingModel ? (
            <Loader2 className="h-7 w-7 mx-auto mb-2 animate-spin text-primary" />
          ) : modelReady ? (
            <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-emerald-500" />
          ) : (
            <UploadCloud className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
          )}
          <div className="font-medium">
            {modelReady ? "Model running in this tab" : "Tap to choose a .gguf file (or drop it here)"}
          </div>
          {modelName && <div className="text-xs text-muted-foreground mt-1 font-mono break-all">{modelName}</div>}
          <div className="text-sm text-muted-foreground mt-1">{modelStatus}</div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          The file never leaves your device — it is loaded straight into this tab's memory. Keep the tab
          open (minimised is fine); the hub queues work to it and falls back to the hosted providers
          whenever it's closed.
        </p>
      </Step>

      {/* ---------- STEP 2 — Keys ---------- */}
      <Step n={2} title="Issue API keys for your other websites">
        {justCreatedKey && (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-sm">
            <div className="font-medium mb-1">Save this now — shown only once:</div>
            <div className="flex items-center gap-2 font-mono break-all text-xs">
              {justCreatedKey}
              <button onClick={() => navigator.clipboard.writeText(justCreatedKey)} aria-label="Copy key">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="Label (e.g. Halway production)"
            className="flex-1 border border-border bg-transparent rounded px-3 py-2 text-sm"
          />
          <select
            value={newKeyScope}
            onChange={(e) => setNewKeyScope(e.target.value as "owner" | "restricted")}
            className="border border-border bg-transparent rounded px-2 py-2 text-sm"
          >
            <option value="restricted">Restricted (testing)</option>
            <option value="owner">Owner (full tools)</option>
          </select>
          <button onClick={handleCreateKey} className="mb-btn text-sm">Create key</button>
        </div>

        <div className="text-sm space-y-1">
          {keys.length === 0 && <div className="text-muted-foreground">No keys yet.</div>}
          {keys.map((k) => (
            <div key={k.id} className="flex justify-between border-b border-border py-1 gap-2">
              <span className="truncate">
                {k.label} <span className="text-muted-foreground">({k.scope})</span>
              </span>
              <span className="flex items-center gap-2 text-muted-foreground shrink-0">
                {k.revoked ? "revoked" : "active"}
                {!k.revoked && (
                  <button
                    className="text-destructive underline"
                    onClick={async () => {
                      await revokeKeyFn({ data: { keyId: k.id } });
                      listKeysFn().then(setKeys).catch(() => {});
                    }}
                  >
                    revoke
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-sm text-muted-foreground block mb-1">Key used by the chat below</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AM_..."
            className="w-full border border-border bg-transparent rounded px-3 py-2"
          />
        </div>
      </Step>

      {/* ---------- STEP 3 — Chat ---------- */}
      <Step n={3} title="Talk to AEM AI">
        <div className="min-h-[240px] flex flex-col gap-3 mb-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <div
                className={`inline-block px-3 py-2 rounded-lg max-w-[85%] text-left whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.content}
                {m.source && <div className="text-xs opacity-60 mt-1">source: {m.source}</div>}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="text-muted-foreground text-sm">
              Nothing yet — ask anything. With a model loaded above, simple questions are answered on-device;
              anything heavier automatically goes to the hosted providers.
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask AEM AI…"
            className="flex-1 border border-border bg-transparent rounded px-3 py-2"
          />
          <button onClick={handleSend} disabled={sending} className="mb-btn">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </Step>

      {/* ---------- How other sites connect ---------- */}
      <section className="mb-card p-4">
        <div className="flex items-center gap-2 font-medium mb-2">
          <Terminal className="h-4 w-4" /> Connect another website
        </div>
        <pre className="text-xs overflow-auto rounded bg-muted/40 p-3">
{`fetch("https://mayobuild-studio.lovable.app/api/hub", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer AM_your_key_here"
  },
  body: JSON.stringify({ message: "Hello AEM" })
}).then(r => r.json())`}
        </pre>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-card p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
          {n}
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}
