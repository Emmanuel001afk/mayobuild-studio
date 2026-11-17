// MayoCut Assist drawer.
// Two tabs, both strictly assistive:
//  • Tools — deterministic on-device analysis (beats, loudness, color, silence).
//    Always available, zero downloads, zero network.
//  • AI writer — optional local LLM (wllama + a GGUF model the user brings or
//    already has in Mayobuild). If no model is loaded, the tab says so and
//    everything else in the editor keeps working.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioWaveform, BrainCircuit, Copy, Music4, Palette, Scissors, Sparkles, Timer, X } from "lucide-react";
import {
  analyzeAudioBlob,
  beatSegments,
  detectBeats,
  LocalLLM,
  silenceEdges,
  smartColor,
} from "../assist";
import { db } from "../idb";
import type { Engine } from "../engine";
import { fmtTime } from "../utils";
import type { MediaItem, OverlayClip, Project } from "../types";

export function Assist({
  engine,
  project,
  media,
  onUndoable,
  onCanvas,
  onClose,
  selectedClip,
}: {
  engine: Engine;
  project: Project;
  media: MediaItem[];
  onUndoable: (fn: (eng: Engine) => void) => void;
  onCanvas: () => HTMLCanvasElement | null;
  onClose: () => void;
  selectedClip: { id: string; kind: string; mediaId?: string } | null;
}) {
  const [tab, setTab] = useState<"tools" | "ai">("tools");
  const [busy, setBusy] = useState<string | null>(null);
  const [beatMediaId, setBeatMediaId] = useState("");
  const [beatCount, setBeatCount] = useState(8);
  const [beats, setBeats] = useState<number[] | null>(null);
  const [silenceMediaId, setSilenceMediaId] = useState("");
  const [silence, setSilence] = useState<{ lead: number; trail: number } | null>(null);
  const audioMedia = media.filter((m) => m.kind === "audio" || m.kind === "video");
  const audioOnly = media.filter((m) => m.kind === "audio");

  useEffect(() => {
    if (!beatMediaId && audioMedia[0]) setBeatMediaId(audioMedia[0].id);
    if (!silenceMediaId && audioOnly[0]) setSilenceMediaId(audioOnly[0].id);
  }, [media, beatMediaId, silenceMediaId, audioMedia, audioOnly]);

  async function runBeats(apply: boolean) {
    const m = media.find((x) => x.id === beatMediaId);
    if (!m) return;
    setBusy("beats");
    try {
      const blob = await db.getBlob(m.id);
      if (!blob) throw new Error("Media data not found on this device");
      const { peaks, duration } = await analyzeAudioBlob(blob, 0.04);
      const found = detectBeats(peaks, duration, beatCount);
      if (found.length < 2) {
        toast.error("Not enough clear beats found — try a track with a stronger rhythm");
        setBeats(null);
        return;
      }
      setBeats(found);
      if (apply) {
        const segs = beatSegments(found, duration);
        onUndoable((eng) => eng.applyBeatCuts(m, segs));
        toast.success(`Cut to ${segs.length} beat segments`);
      } else {
        toast.success(`Found ${found.length} beat points`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beat analysis failed");
    } finally {
      setBusy(null);
    }
  }

  async function runNormalize() {
    const m = media.find((x) => x.id === (selectedClip?.mediaId ?? audioOnly[0]?.id));
    if (!m || m.kind === "image") {
      toast.info("Select an audio clip first, or import audio");
      return;
    }
    setBusy("norm");
    try {
      const blob = await db.getBlob(m.id);
      if (!blob) throw new Error("Media data not found on this device");
      const { rms } = await analyzeAudioBlob(blob, 0.05);
      const target = 0.22;
      const gain = Math.max(0.05, Math.min(1, target / Math.max(0.001, rms)));
      onUndoable((eng) => {
        if (selectedClip && selectedClip.id) {
          const c = eng.getClip(selectedClip.id);
          if (c) {
            if ("kind" in c) {
              if (c.kind === "audio") c.volume = gain;
            } else {
              c.volume = gain;
              c.muted = false;
            }
          }
        } else {
          for (const tr of eng.project.tracks)
            for (const c of tr.clips) if (c.kind === "audio" && c.mediaId === m.id) c.volume = gain;
        }
      });
      toast.success(gain >= 0.98 ? "Audio is already loud — nothing to boost" : `Volume set to ${Math.round(gain * 100)}% for an even level`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Normalize failed");
    } finally {
      setBusy(null);
    }
  }

  function runSmartColor(target: "selected" | "all") {
    const canvas = onCanvas();
    if (!canvas) {
      toast.error("Preview canvas not ready");
      return;
    }
    const sc = smartColor(canvas);
    onUndoable((eng) => {
      if (target === "selected" && selectedClip) {
        const c = eng.getClip(selectedClip.id);
        if (c && "adjust" in c) {
          c.adjust = { ...(c.adjust ?? { brightness: 100, contrast: 100, saturation: 100, hue: 0 }), ...sc.adjust };
          c.filter = sc.filter;
        }
      } else {
        for (const c of eng.project.main) {
          c.adjust = { ...c.adjust, ...sc.adjust };
          c.filter = sc.filter;
        }
      }
    });
    toast.success(`Look applied: ${sc.reason}`);
  }

  async function runSilence(apply: boolean) {
    const m = media.find((x) => x.id === silenceMediaId);
    if (!m || m.kind !== "audio") return;
    setBusy("sil");
    try {
      const blob = await db.getBlob(m.id);
      if (!blob) throw new Error("Media data not found on this device");
      const { peaks, duration } = await analyzeAudioBlob(blob, 0.05);
      const edges = silenceEdges(peaks, duration);
      setSilence(edges);
      if (!apply) {
        if (edges.lead + edges.trail < 0.4) toast.info("No significant leading/trailing silence found");
        return;
      }
      if (edges.lead + edges.trail < 0.4) {
        toast.info("Nothing to trim");
        return;
      }
      onUndoable((eng) => {
        const clips: OverlayClip[] = [];
        for (const tr of eng.project.tracks)
          for (const c of tr.clips) if (c.kind === "audio" && c.mediaId === m.id) clips.push(c);
        for (const c of clips) {
          c.start = Math.min(c.start + edges.lead, Math.max(0, c.start + c.duration - 0.5));
          c.duration = Math.max(0.3, c.duration - edges.lead - edges.trail);
        }
      });
      toast.success(`Trimmed ${edges.lead.toFixed(1)}s lead + ${edges.trail.toFixed(1)}s tail silence`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Silence detection failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-80 max-w-full bg-background border-l border-border shadow-2xl flex flex-col">
      <div className="h-11 border-b border-border flex items-center gap-2 px-3 shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">Assist</span>
        <span className="text-[10px] text-muted-foreground">on-device only</span>
        <button className="ml-auto mb-btn-ghost h-7 px-2" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex border-b border-border text-xs shrink-0">
        <TabBtn active={tab === "tools"} onClick={() => setTab("tools")}>
          <AudioWaveform className="h-3.5 w-3.5" /> Local tools
        </TabBtn>
        <TabBtn active={tab === "ai"} onClick={() => setTab("ai")}>
          <BrainCircuit className="h-3.5 w-3.5" /> AI writer
        </TabBtn>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {tab === "tools" ? (
          <>
            <Tool
              icon={<Music4 className="h-4 w-4" />}
              title="Beat cuts"
              desc="Detect the rhythm in a track and rebuild the main timeline as one clip per beat."
            >
              <Select value={beatMediaId} onChange={setBeatMediaId} options={audioMedia} />
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground w-14">Beats: {beatCount}</span>
                <input type="range" min={3} max={14} step={1} value={beatCount} onChange={(e) => setBeatCount(Number(e.target.value))} className="flex-1 accent-cyan-400" />
              </div>
              {beats && (
                <div className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
                  {beats.map((b) => (
                    <span key={b} className="inline-block mr-1 mb-1 border border-border rounded px-1">
                      {fmtTime(b)}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <ToolBtn busy={busy === "beats"} onClick={() => void runBeats(false)}>
                  Detect
                </ToolBtn>
                <ToolBtn busy={busy === "beats"} onClick={() => void runBeats(true)} primary>
                  Cut to beats
                </ToolBtn>
              </div>
            </Tool>

            <Tool icon={<Timer className="h-4 w-4" />} title="Even out loudness" desc="Measures a track's true level and sets clip volume so it sits evenly in the mix.">
              {selectedClip?.mediaId && selectedClip.kind !== "image" ? (
                <div className="text-[11px] text-muted-foreground">Applies to: the selected clip</div>
              ) : (
                <Select value={audioOnly.find((m) => m.id === silenceMediaId)?.id ?? ""} onChange={() => undefined} options={audioOnly} />
              )}
              <div className="mt-2">
                <ToolBtn busy={busy === "norm"} onClick={runNormalize} primary>
                  Normalize
                </ToolBtn>
              </div>
            </Tool>

            <Tool icon={<Palette className="h-4 w-4" />} title="Smart color" desc="Samples the current frame and suggests a filter + adjust that fits what's on screen.">
              <div className="grid grid-cols-1 gap-1.5">
                <ToolBtn onClick={() => runSmartColor("selected")} disabled={!selectedClip}>
                  Apply to selected clip
                </ToolBtn>
                <ToolBtn onClick={() => runSmartColor("all")}>
                  Apply to all main clips
                </ToolBtn>
              </div>
            </Tool>

            <Tool icon={<Scissors className="h-4 w-4" />} title="Trim silence" desc="Finds leading and trailing silence in an audio file and trims your clips to the music.">
              <Select value={silenceMediaId} onChange={setSilenceMediaId} options={audioOnly} />
              {silence && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Lead: <b className="text-foreground">{silence.lead.toFixed(1)}s</b> · Tail:{" "}
                  <b className="text-foreground">{silence.trail.toFixed(1)}s</b>
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <ToolBtn busy={busy === "sil"} onClick={() => void runSilence(false)}>
                  Detect
                </ToolBtn>
                <ToolBtn busy={busy === "sil"} onClick={() => void runSilence(true)} primary>
                  Trim my clips
                </ToolBtn>
              </div>
            </Tool>

            <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              These tools run entirely on this device with the WebAudio API — no model, no download, no network. They
              suggest and apply edits you can undo with <kbd className="px-1 border border-border rounded bg-slate-900">Ctrl+Z</kbd>.
            </p>
          </>
        ) : (
          <AIWriter project={project} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AIWriter({ project }: { project: Project }) {
  const llmRef = useRef<LocalLLM>(new LocalLLM());
  const [status, setStatus] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");
  const [thinking, setThinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = project.name || "my video";

  useEffect(() => () => llmRef.current.dispose(), []);

  async function loadFiles(files: File[] | null) {
    if (!files?.length) return;
    const ok = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".gguf"));
    if (!ok.length) {
      toast.error("Pick a .gguf model file");
      return;
    }
    try {
      await llmRef.current.load(ok, setStatus);
      setStatus(null);
      toast.success("Local model ready — writing now happens on this device");
    } catch (e) {
      setStatus(null);
      toast.error(e instanceof Error ? e.message : "Could not load the model");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function loadPlatformModel() {
    setStatus("Checking Mayobuild's local model…");
    try {
      const { loadActiveModel } = await import("@/lib/local-model-store.browser");
      const files = await loadActiveModel();
      if (!files?.length) {
        setStatus(null);
        toast.info("No model stored in Mayobuild yet — load one in AEM or pick a .gguf file here");
        return;
      }
      await llmRef.current.load(files, setStatus);
      setStatus(null);
      toast.success("Using Mayobuild's on-device model");
    } catch (e) {
      setStatus(null);
      toast.error(e instanceof Error ? e.message : "Could not read the stored model");
    }
  }

  async function ask(p: string) {
    if (!llmRef.current.ready) {
      toast.info("Load a local model first — or keep editing, AI is optional");
      return;
    }
    setThinking(true);
    setOut("");
    try {
      const r = await llmRef.current.ask(p, setStatus);
      setOut(r);
      setStatus(null);
    } catch (e) {
      setStatus(null);
      toast.error(e instanceof Error ? e.message : "The local model failed");
    } finally {
      setThinking(false);
    }
  }

  const chips = [
    `3 hook title ideas for a video called “${name}”`,
    `5 short caption lines for “${name}” (under 8 words each)`,
    "One-line social description, punchy and friendly",
    "A 4-line quote/lyric that fits a reflective video",
  ];

  return (
    <>
      <div className="border border-border rounded-lg p-3 space-y-2">
        <div className="text-xs font-medium flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" /> Local AI model
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Optional and private: a small language model runs <b>only on this device</b>. No model = everything in
          MayoCut still works, this tab is just idle.
        </p>
        {status && <div className="text-[11px] text-cyan-300">{status}</div>}
        {llmRef.current.ready ? (
          <div className="text-[11px] border border-emerald-400/40 bg-emerald-400/10 rounded px-2 py-1.5">
            ● ready — {llmRef.current.name}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1.5">
            <ToolBtn onClick={() => fileRef.current?.click()}>Load a .gguf file from this device…</ToolBtn>
            <ToolBtn onClick={() => void loadPlatformModel()}>Use Mayobuild's stored model</ToolBtn>
            <input
              ref={fileRef}
              type="file"
              accept=".gguf"
              multiple
              className="hidden"
              onChange={(e) => void loadFiles(Array.from(e.target.files ?? []))}
            />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Tip: small models (7–13B, Q4) are the sweet spot. Loading a 4 GB file can take a couple of minutes.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium">Quick ideas</div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              className="text-[10px] border border-border rounded-full px-2 py-1 hover:border-cyan-400 text-left"
              onClick={() => {
                setPrompt(c);
                void ask(c);
              }}
            >
              {c.slice(0, 34)}…
            </button>
          ))}
        </div>
        <textarea
          className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs h-20 resize-none"
          placeholder="Ask for anything: titles, captions, edit notes…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex gap-1.5">
          <ToolBtn primary busy={thinking} onClick={() => void ask(prompt)} disabled={!prompt.trim()}>
            Generate
          </ToolBtn>
          {out && (
            <ToolBtn
              onClick={() => {
                void navigator.clipboard?.writeText(out);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </ToolBtn>
          )}
        </div>
        {out && (
          <pre className="text-[11px] whitespace-pre-wrap bg-slate-900 border border-border rounded p-2 leading-relaxed">{out}</pre>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function Tool({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="text-xs font-medium flex items-center gap-2">
        <span className="text-primary">{icon}</span> {title}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: MediaItem[] }) {
  if (!options.length) return <div className="text-[11px] text-muted-foreground">Import audio or video first.</div>;
  return (
    <select className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-[11px]" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function ToolBtn({
  children,
  onClick,
  busy,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`text-[11px] rounded px-2 py-1.5 border flex items-center justify-center gap-1 disabled:opacity-40 ${
        primary ? "bg-primary border-primary" : "border-border hover:border-cyan-400"
      }`}
      onClick={onClick}
      disabled={busy || disabled}
    >
      {busy && <span className="inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`flex-1 h-9 flex items-center justify-center gap-1.5 border-b-2 -mb-px ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}


