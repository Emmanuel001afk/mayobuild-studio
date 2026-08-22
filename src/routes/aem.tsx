// src/routes/aem.tsx
// The AEM AI workspace page — a real page you open and click, tying
// together everything built tonight: chat (calls /api/hub), and a button
// to load your own downloaded model into THIS tab (via file picker +
// wllama), connecting it to the hub over the WebSocket relay so the hub
// can use it automatically when available.

import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Cpu, CheckCircle2, KeyRound, Copy } from "lucide-react";
import { createHubKey, listHubKeys, revokeHubKey } from "@/lib/aem-key.functions";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/aem")({
  head: () => ({ meta: [{ title: "AEM AI Workspace" }] }),
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

  const [modelStatus, setModelStatus] = useState<string>("Not loaded");
  const [modelReady, setModelReady] = useState(false);
  const deviceIdRef = useRef<string | null>(null);

  // --- Key management ---
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
    setNewKeyLabel("");
    listKeysFn().then(setKeys).catch(() => {});
  }

  async function handleLoadModel() {
    try {
      setModelStatus("Waiting for file picker...");
      const { pickModelFileFromDevice, startLocalModelTab } = await import("@/lib/local-model-tab.browser");
      const files = await pickModelFileFromDevice();
      const { deviceId } = await startLocalModelTab(files, (status) => setModelStatus(status));
      deviceIdRef.current = deviceId;
      setModelReady(true);
    } catch (err) {
      setModelStatus(`Failed: ${(err as Error).message}`);
      setModelReady(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !apiKey.trim()) return;
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
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">AEM AI Workspace</h1>
        <Link to="/admin" className="mb-btn-ghost text-sm">Overseer</Link>
      </div>

      {/* --- Key management --- */}
      <div className="mb-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="h-5 w-5" />
          <span className="font-medium">API Keys</span>
        </div>

        {justCreatedKey && (
          <div className="mb-3 p-3 rounded bg-yellow-50 border border-yellow-300 text-sm">
            <div className="font-medium mb-1">Save this now — shown only once:</div>
            <div className="flex items-center gap-2 font-mono break-all">
              {justCreatedKey}
              <button onClick={() => navigator.clipboard.writeText(justCreatedKey)}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="Label (e.g. Halway production)"
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <select
            value={newKeyScope}
            onChange={(e) => setNewKeyScope(e.target.value as "owner" | "restricted")}
            className="border rounded px-2 py-2 text-sm"
          >
            <option value="restricted">Restricted (testing)</option>
            <option value="owner">Owner (my own site)</option>
          </select>
          <button onClick={handleCreateKey} className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm">
            Create
          </button>
        </div>

        <div className="text-sm space-y-1">
          {keys.map((k) => (
            <div key={k.id} className="flex justify-between border-b py-1">
              <span>{k.label} <span className="text-muted-foreground">({k.scope})</span></span>
              <span className="flex items-center gap-2 text-muted-foreground">
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
      </div>

      {/* --- API key input (paste an owner-scope key generated earlier) --- */}
      <div className="mb-card p-4 mb-4">
        <label className="text-sm text-muted-foreground block mb-1">API key (AM_...)</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AM_..."
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* --- Local model loader --- */}
      <div className="mb-card p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          <div>
            <div className="font-medium">Local model (this tab)</div>
            <div className="text-sm text-muted-foreground">{modelStatus}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Pick the .gguf file already saved on this phone — it stays on the device,
              nothing is uploaded. Keep this tab open (it can be minimised) and the hub
              will send it work automatically.
            </div>
          </div>
        </div>
        <button
          onClick={handleLoadModel}
          className="px-4 py-2 rounded bg-primary text-primary-foreground"
        >
          {modelReady ? <CheckCircle2 className="h-4 w-4" /> : "Load model from phone"}
        </button>
      </div>

      {/* --- Chat --- */}
      <div className="mb-card p-4 min-h-[300px] flex flex-col gap-3 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block px-3 py-2 rounded-lg ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {m.content}
              {m.source && <div className="text-xs opacity-60 mt-1">source: {m.source}</div>}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-muted-foreground text-sm">No messages yet — try asking something below.</div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask AEM AI..."
          className="flex-1 border rounded px-3 py-2"
        />
        <button onClick={handleSend} disabled={sending} className="px-4 py-2 rounded bg-primary text-primary-foreground">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
