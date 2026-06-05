import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getProject, inviteCollaborator, savePreview } from "@/lib/projects.functions";
import { callRouter } from "@/lib/router.functions";
import { generateMobileApp, wrapWebsiteAsApp } from "@/lib/mobile-gen.functions";
import { MicButton } from "@/components/MicButton";
import {
  ArrowLeft, Sparkles, Loader2, Download, Image as ImageIcon, Send, Users, Globe, Smartphone, Cpu,
} from "lucide-react";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Mayobuild Studio" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const get = useServerFn(getProject);
  const route = useServerFn(callRouter);
  const save = useServerFn(savePreview);
  const invite = useServerFn(inviteCollaborator);
  const genMobile = useServerFn(generateMobileApp);

  const [data, setData] = useState<any>(null);
  const [prompt, setPrompt] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [output, setOutput] = useState<{ kind: "text" | "image"; text?: string; dataUrl?: string; provider?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [mobileBusy, setMobileBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    get({ data: { id } }).then((d) => {
      setData(d);
      if (d.project.preview_html) setOutput({ kind: "text", text: d.project.preview_html });
    }).catch((e) => setErr(e.message));
  }, [user, id]);

  async function runWebsite() {
    if (!prompt.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await route({
        data: {
          task: "website",
          prompt,
          system: "You generate a single complete, self-contained HTML document (with embedded CSS) for a beautiful landing page based on the prompt. Return ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no commentary.",
          projectId: id,
        },
      });
      if (res.kind === "text") {
        const html = stripFence(res.text);
        setOutput({ kind: "text", text: html, provider: res.provider });
        await save({ data: { id, preview_html: html } });
      }
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function runMobile() {
    if (!prompt.trim()) return;
    setMobileBusy(true); setErr(null);
    try {
      const res = await genMobile({ data: { projectId: id, prompt, appName: data?.project?.name ?? "MyApp" } });
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
      setOutput({ kind: "text", text: res.previewCode, provider: res.provider });
      // Persist the raw generated code to the project so it survives reloads (never lose code).
      await save({ data: { id, preview_html: res.previewCode } });
    } catch (e: any) { setErr(e.message); }
    finally { setMobileBusy(false); }
  }

  async function runImage() {
    if (!imagePrompt.trim()) return;
    setImageBusy(true); setErr(null);
    try {
      const res = await route({ data: { task: "image", prompt: imagePrompt, projectId: id } });
      if (res.kind === "image") setOutput({ kind: "image", dataUrl: res.dataUrl, provider: "huggingface" });
    } catch (e: any) { setErr(e.message); }
    finally { setImageBusy(false); }
  }

  async function sendInvite() {
    if (!inviteEmail) return;
    setInviteMsg(null);
    try {
      await invite({ data: { projectId: id, email: inviteEmail, role: "editor" } });
      setInviteMsg("Invite sent ✓");
      setInviteEmail("");
      const d = await get({ data: { id } });
      setData(d);
    } catch (e: any) { setInviteMsg(e.message); }
  }

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{err ?? "Loading…"}</div>;
  }

  const isMobile = data.project.kind === "mobile";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="mb-btn-ghost"><ArrowLeft className="h-4 w-4" /> Workspace</Link>
          <div className="flex items-center gap-2">
            {isMobile ? <Smartphone className="h-4 w-4 text-accent" /> : <Globe className="h-4 w-4 text-primary" />}
            <h1 className="font-semibold">{data.project.name}</h1>
          </div>
          <span className="mb-chip"><Cpu className="h-3 w-3" /> Smart router</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        {/* Left: prompt + collaborators */}
        <aside className="space-y-4 lg:col-span-1">
          <div className="mb-card p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Prompt
            </h3>
            <textarea
              className="mb-input min-h-[140px]"
              placeholder={isMobile
                ? "e.g. Daily meditation app with morning alarms, push reminders, and 5-min sessions"
                : "e.g. Landing page for a solar panel installer with 3 plans and a contact form"}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <MicButton onTranscript={(t) => setPrompt((p) => (p ? p + " " + t : t))} />
              {isMobile ? (
                <button className="mb-btn flex-1" onClick={runMobile} disabled={mobileBusy}>
                  {mobileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Generate Expo zip
                </button>
              ) : (
                <button className="mb-btn flex-1" onClick={runWebsite} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Generate
                </button>
              )}
            </div>
          </div>

          <div className="mb-card p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-accent" /> Image (Hugging Face)
            </h3>
            <input className="mb-input" placeholder="Describe an image…" value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} />
            <div className="flex gap-2 mt-2">
              <MicButton onTranscript={(t) => setImagePrompt((p) => (p ? p + " " + t : t))} />
              <button className="mb-btn flex-1" onClick={runImage} disabled={imageBusy}>
                {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                Generate
              </button>
            </div>
          </div>

          <div className="mb-card p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Collaborators
            </h3>
            <ul className="space-y-1 text-sm mb-3">
              {data.collaborators.length === 0 && <li className="text-muted-foreground">No collaborators yet.</li>}
              {data.collaborators.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span>{c.invited_email}</span>
                  <span className="mb-chip">{c.role}{c.accepted_at ? "" : " · pending"}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input className="mb-input" placeholder="email@domain.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <button className="mb-btn-ghost" onClick={sendInvite}>Invite</button>
            </div>
            {inviteMsg && <div className="text-xs mt-2 text-muted-foreground">{inviteMsg}</div>}
          </div>
        </aside>

        {/* Right: preview */}
        <section className="lg:col-span-2 mb-card p-4 min-h-[60vh]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Preview</h3>
            {output?.provider && <span className="mb-chip"><Cpu className="h-3 w-3" /> via {output.provider}</span>}
          </div>
          {err && <div className="text-sm text-destructive mb-3">{err}</div>}
          {!output && <div className="text-muted-foreground text-sm">Generate something to see the result.</div>}
          {output?.kind === "image" && output.dataUrl && (
            <img src={output.dataUrl} className="rounded-md max-w-full mx-auto" alt="Generated" />
          )}
          {output?.kind === "text" && output.text && (
            isMobile ? (
              <pre className="text-xs whitespace-pre-wrap bg-background p-3 rounded-md border border-border overflow-auto max-h-[70vh]">{output.text}</pre>
            ) : (
              <iframe
                title="Preview"
                sandbox="allow-scripts"
                srcDoc={output.text}
                className="w-full h-[70vh] bg-white rounded-md border border-border"
              />
            )
          )}
        </section>
      </main>
    </div>
  );
}

function stripFence(s: string): string {
  const m = s.match(/```(?:html)?\n([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}
