// MayoCut Assist drawer.
// Two tabs, both strictly assistive:
//  • Tools — deterministic on-device analysis (beats, loudness, color, silence).
//    Always available, zero downloads, zero network.
//  • AI writer — optional local LLM (wllama + a GGUF model the user brings or
//    already has in Mayobuild). If no model is loaded, the tab says so and
//    everything else in the editor keeps working.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AudioWaveform,
  BrainCircuit,
  Copy,
  Cpu,
  Mic,
  Music4,
  Palette,
  Scissors,
  Sparkles,
  Globe,
  Subtitles,
  Timer,
  X,
} from "lucide-react";
import { AI_PROVIDERS, aiKeys, cloudChat, testKey } from "@/lib/ai-keys";
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
import { uid } from "../types";
import {
  CAPTION_LANGUAGES,
  WHISPER_MODELS,
  captionSourceLabel,
  captionsToTextClips,
  projectAudio16k,
  whisper,
  type CaptionSegment,
  type WhisperModelId,
} from "../captions";
import { tts, TTS_MODEL_BYTES, type TtsAudio } from "../tts";
import {
  HEAVY_FEATURES,
  can,
  device,
  getFeaturePrefs,
  setFeaturePref,
  type FeaturePrefs,
} from "../device";

export function Assist({
  engine,
  project,
  media,
  onUndoable,
  onCanvas,
  onClose,
  selectedClip,
  onAddTts,
}: {
  engine: Engine;
  project: Project;
  media: MediaItem[];
  onUndoable: (fn: (eng: Engine) => void) => void;
  onCanvas: () => HTMLCanvasElement | null;
  onClose: () => void;
  selectedClip: { id: string; kind: string; mediaId?: string } | null;
  onAddTts: (audio: TtsAudio, name: string) => void;
}) {
  const [tab, setTab] = useState<"tools" | "ai" | "cloud" | "captions" | "voice">("tools");
  const [busy, setBusy] = useState<string | null>(null);
  const [beatMediaId, setBeatMediaId] = useState("");
  const [beatCount, setBeatCount] = useState(8);
  const [beats, setBeats] = useState<number[] | null>(null);
  const [silenceMediaId, setSilenceMediaId] = useState("");
  const [silence, setSilence] = useState<{ lead: number; trail: number } | null>(null);
  const audioMedia = media.filter((m) => m.kind === "audio" || m.kind === "video");
  const audioOnly = media.filter((m) => m.kind === "audio");

  // --- local captions (Whisper) ---
  const [capModel, setCapModel] = useState<WhisperModelId>("Xenova/whisper-tiny");
  const [capLang, setCapLang] = useState("auto");
  const [capStatus, setCapStatus] = useState<{ msg: string; pct?: number } | null>(null);
  const [capBusy, setCapBusy] = useState<"load" | "gen" | null>(null);
  const [capSegs, setCapSegs] = useState<CaptionSegment[] | null>(null);

  // --- local text-to-speech (sherpa-onnx VITS) ---
  const [ttsStatus, setTtsStatus] = useState<{ msg: string; pct?: number } | null>(null);
  const [ttsBusy, setTtsBusy] = useState<"load" | "gen" | null>(null);
  const [ttsText, setTtsText] = useState("");
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const [ttsResult, setTtsResult] = useState<{ audio: TtsAudio; url: string; name: string } | null>(null);

  async function loadCapModel(files?: File[]) {
    setCapBusy("load");
    setCapStatus({ msg: files ? "Loading model from files…" : "Preparing model…" });
    try {
      await whisper.load(capModel, (msg, pct) => setCapStatus({ msg, pct }), files);
      toast.success("Whisper ready — captions will run fully on this device");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the Whisper model");
    } finally {
      setCapBusy(null);
      setCapStatus(null);
    }
  }

  async function generateCaptions() {
    if (!whisper.ready) {
      toast.info("Get the model first (one-time download) — or keep editing, captions are optional");
      return;
    }
    setCapBusy("gen");
    setCapSegs(null);
    setCapStatus({ msg: "Reading audio from the timeline…" });
    try {
      const audio = await projectAudio16k(engine, (m) => setCapStatus({ msg: m }));
      if (!audio) {
        toast.error("No audio found on the main track");
        return;
      }
      const segs = await whisper.transcribe(audio.samples, capLang, (m) => setCapStatus({ msg: m }));
      if (segs.length === 0) {
        toast.info("No speech detected in that audio");
        return;
      }
      setCapSegs(segs);
      toast.success(`${segs.length} caption lines ready`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setCapBusy(null);
      setCapStatus(null);
    }
  }

  function addCaptions(karaoke: boolean) {
    if (!capSegs) return;
    const clips = captionsToTextClips(capSegs, { karaoke });
    onUndoable((eng) => {
      const tr = eng.project.tracks.find((x) => x.id === "t_text");
      if (!tr) return;
      for (const c of clips) tr.clips.push({ ...c, id: uid("cap") } as OverlayClip);
    });
    setCapSegs(null);
    toast.success(karaoke ? "Karaoke captions added — tweak them on the Text track" : "Captions added — tweak them on the Text track");
  }

  // --- TTS handlers ---
  async function loadTtsModel() {
    setTtsBusy("load");
    try {
      await tts.ensure((msg, pct) => setTtsStatus({ msg, pct }));
      toast.success("Voice model ready — cached on this device, works offline");
    } catch (e) {
      toast.error(`Voice model failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTtsBusy(null);
      setTtsStatus(null);
    }
  }

  async function genTts() {
    const text = ttsText.trim();
    if (!text) {
      toast.info("Type something to narrate first");
      return;
    }
    setTtsBusy("gen");
    try {
      setTtsStatus({ msg: "Generating speech… (single CPU thread in a worker)" });
      const a = await tts.generate(text, ttsSpeed);
      setTtsResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        const url = URL.createObjectURL(a.wav);
        const name = text.length > 28 ? text.slice(0, 28) + "…" : text;
        return { audio: a, url, name };
      });
      setTtsStatus(null);
    } catch (e) {
      setTtsStatus(null);
      toast.error(`Speech failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTtsBusy(null);
    }
  }

  function addTtsToTimeline() {
    if (!ttsResult) return;
    onAddTts(ttsResult.audio, ttsResult.name);
    setTtsResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }



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
        <TabBtn active={tab === "cloud"} onClick={() => setTab("cloud")}>
          <Globe className="h-3.5 w-3.5" /> Cloud AI
        </TabBtn>
        <TabBtn active={tab === "captions"} onClick={() => setTab("captions")}>
          <Subtitles className="h-3.5 w-3.5" /> Captions
        </TabBtn>
        <TabBtn active={tab === "voice"} onClick={() => setTab("voice")}>
          <Mic className="h-3.5 w-3.5" /> Voice (TTS)
        </TabBtn>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {tab === "tools" ? (
          <>
            <DevicePanel />
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
        ) : tab === "captions" ? (
          <FeatureGate gate={can("captions")} label="Auto captions (Whisper)">
            <Tool
              icon={<Subtitles className="h-4 w-4" />}
              title="Auto captions — local Whisper"
              desc="Transcribes the main-track audio on this device (OpenAI's public Whisper model, ONNX in WebAssembly). One-time model download, then fully offline — or bring the model files yourself. Output lands on the Text track as editable clips."
            >
              <div className="flex gap-1.5">
                <select
                  className="flex-1 bg-slate-900 border border-border rounded px-2 py-1.5 text-[11px]"
                  value={capModel}
                  onChange={(e) => setCapModel(e.target.value as WhisperModelId)}
                >
                  {WHISPER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.size}
                    </option>
                  ))}
                </select>
                <select
                  className="w-28 bg-slate-900 border border-border rounded px-2 py-1.5 text-[11px]"
                  value={capLang}
                  onChange={(e) => setCapLang(e.target.value)}
                >
                  {CAPTION_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                <ToolBtn busy={capBusy === "load"} onClick={() => void loadCapModel()}>
                  Get model (one-time)
                </ToolBtn>
                <label className="text-[11px] rounded px-2 py-1.5 border border-border hover:border-cyan-400 cursor-pointer flex items-center gap-1">
                  Load model files…
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      if (fs.length) void loadCapModel(fs);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {whisper.ready && <span className="text-[10px] text-emerald-300">● ready — {whisper.model}</span>}
              </div>
              {capStatus && (
                <div className="text-[10px] text-muted-foreground">
                  {capStatus.msg}
                  {typeof capStatus.pct === "number" && (
                    <div className="h-1 bg-slate-800 rounded mt-1 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.round(capStatus.pct * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
              <ToolBtn primary busy={capBusy === "gen"} disabled={!whisper.ready} onClick={() => void generateCaptions()}>
                Generate captions · {captionSourceLabel(engine)}
              </ToolBtn>
              {capSegs && (
                <div className="mt-1">
                  <div className="max-h-40 overflow-y-auto border border-border rounded p-2 space-y-1">
                    {capSegs.slice(0, 40).map((sg, i) => (
                      <div key={i} className="text-[10px] leading-snug">
                        <span className="text-muted-foreground tabular-nums">
                          {fmtTime(sg.start)}–{fmtTime(sg.end)}
                        </span>{" "}
                        {sg.text}
                      </div>
                    ))}
                    {capSegs.length > 40 && (
                      <div className="text-[10px] text-muted-foreground">…and {capSegs.length - 40} more lines</div>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <ToolBtn primary onClick={() => addCaptions(false)}>
                      Add subtitles ({capSegs.length})
                    </ToolBtn>
                    <ToolBtn onClick={() => addCaptions(true)}>Add karaoke (word-by-word)</ToolBtn>
                  </div>
                </div>
              )}
            </Tool>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Assistive only: nothing touches your timeline until you press a button, and every caption is a normal text
              clip you can edit, restyle, delete or keyframe. No audio ever leaves this device.
            </p>
          </FeatureGate>
        ) : tab === "voice" ? (
          <FeatureGate gate={can("tts")} label="Text-to-speech">
            <Tool
              icon={<Mic className="h-4 w-4" />}
              title="Text to speech — fully local"
              desc="Speaks your text with a neural voice (piper 'amy' via sherpa-onnx VITS, ONNX in WebAssembly). One-time model download of ~70 MB, then everything runs offline on this device. The result is a normal audio clip on the Audio track."
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">Voice:</span>
                <span className="font-medium">{tts.modelLabel}</span>
                {tts.ready && <span className="text-emerald-300 text-[10px]">● ready</span>}
              </div>
              {!tts.ready ? (
                <div className="flex gap-1.5 flex-wrap items-center">
                  <ToolBtn busy={ttsBusy === "load"} onClick={() => void loadTtsModel()}>
                    Get voice model (one-time, {(TTS_MODEL_BYTES / 1048576).toFixed(0)} MB)
                  </ToolBtn>
                </div>
              ) : (
                <>
                  <textarea
                    className="w-full h-24 bg-slate-900 border border-border rounded p-2 text-xs resize-y"
                    placeholder="Type what the voice should say… (English)"
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                  />
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground w-12">Speed</span>
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={ttsSpeed}
                      onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                      className="flex-1 accent-cyan-400"
                    />
                    <span className="tabular-nums w-8">{ttsSpeed.toFixed(1)}×</span>
                  </div>
                  <ToolBtn primary busy={ttsBusy === "gen"} onClick={() => void genTts()}>
                    Generate speech
                  </ToolBtn>
                </>
              )}
              {ttsStatus && (
                <div className="text-[10px] text-muted-foreground">
                  {ttsStatus.msg}
                  {typeof ttsStatus.pct === "number" && ttsStatus.pct < 1 && (
                    <div className="h-1 bg-slate-800 rounded mt-1 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.round(ttsStatus.pct * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
              {ttsResult && (
                <div className="mt-1 space-y-2">
                  <audio controls src={ttsResult.url} className="w-full h-9" />
                  <div className="text-[10px] text-muted-foreground">
                    {ttsResult.audio.duration.toFixed(1)} s · {ttsResult.audio.sampleRate} Hz · “{ttsResult.name}”
                  </div>
                  <div className="flex gap-1.5">
                    <ToolBtn primary onClick={addTtsToTimeline}>
                      Add to Audio track
                    </ToolBtn>
                    <ToolBtn
                      onClick={() => {
                        setTtsResult((prev) => {
                          if (prev) URL.revokeObjectURL(prev.url);
                          return null;
                        });
                      }}
                    >
                      Discard
                    </ToolBtn>
                  </div>
                </div>
              )}
            </Tool>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Assistive only: the clip is added at the playhead — you can move, trim, fade, denoise or FX it like any
              audio. Generation is single-threaded CPU: a few seconds per 10 s of speech on desktop, slower on phones.
              Nothing leaves this device.
            </p>
          </FeatureGate>
        ) : tab === "cloud" ? (
          <CloudAiPanel />
        ) : (
          <FeatureGate gate={can("ai")} label="Local AI writer">
            <AIWriter project={project} />
          </FeatureGate>
        )}
      </div>
    </div>
  );
}

/**
 * Cloud AI — the user's own provider keys, used straight from the device.
 * The installed app has no server behind it, so the web build's env-based
 * router is unreachable here; instead the device talks to the provider
 * directly (OpenAI-compatible endpoints). Keys live only in this device's
 * localStorage. Without a key, everything in MayoCut still works offline.
 */
function CloudAiPanel() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(aiKeys.all()).map((k) => [k, true])));
  const [res, setRes] = useState<Record<string, { ok: boolean; message: string; busy?: boolean }>>({});

  function save(id: string) {
    const v = (drafts[id] ?? "").trim();
    if (!v) return;
    aiKeys.set(id, v);
    setSaved((s) => ({ ...s, [id]: true }));
    setDrafts((d) => ({ ...d, [id]: "" }));
    toast.success("Key stored on this device");
    void testKey(id).then((r) => setRes((x) => ({ ...x, [id]: { ok: r.ok, message: r.message } })));
  }

  async function test(id: string) {
    setRes((x) => ({ ...x, [id]: { ok: false, message: "Testing…", busy: true } }));
    const r = await testKey(id, drafts[id]?.trim() || undefined);
    setRes((x) => ({ ...x, [id]: { ok: r.ok, message: r.message } }));
  }

  function clear(id: string) {
    aiKeys.set(id, "");
    setSaved((s) => ({ ...s, [id]: false }));
    setRes((x) => {
      const n = { ...x };
      delete n[id];
      return n;
    });
    toast.info("Key removed");
  }

  return (
    <>
      <div className="border border-border rounded-lg p-3 space-y-1.5">
        <div className="text-xs font-medium flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" /> Cloud AI — your own keys
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          MayoCut's AI is on-device by default. For anything that needs a cloud model (longer context, better writing),
          paste one of <b>your</b> provider keys below. It is stored <b>only on this device</b> and sent only to that
          provider — no Mayobuild server is in the loop. The rest of the editor works with no key at all.
        </p>
        <p className="text-[10px] text-muted-foreground">
          The AI writer uses the first working key automatically (failover). Free tiers: Gemini, Groq, Cerebras,
          DeepSeek, OpenRouter.
        </p>
      </div>
      {AI_PROVIDERS.map((p) => (
        <div key={p.id} className="border border-border rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-medium">{p.name}</span>
            <span className="text-muted-foreground text-[10px] truncate">{p.model}</span>
            {saved[p.id] && <span className="ml-auto shrink-0 text-[10px] text-emerald-400">● stored</span>}
          </div>
          <div className="flex gap-1">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-slate-900 border border-border rounded px-2 py-1 text-[11px]"
              placeholder="Paste your key…"
              value={drafts[p.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
            />
            <ToolBtn onClick={() => save(p.id)} disabled={!(drafts[p.id] ?? "").trim()}>
              Save
            </ToolBtn>
            <ToolBtn busy={!!res[p.id]?.busy} onClick={() => void test(p.id)} disabled={!saved[p.id] && !(drafts[p.id] ?? "").trim()}>
              Test
            </ToolBtn>
            {saved[p.id] && (
              <ToolBtn onClick={() => clear(p.id)} title="Remove this key">
                <X className="h-3 w-3" />
              </ToolBtn>
            )}
          </div>
          {res[p.id] && (
            <div className={`text-[10px] ${res[p.id].ok ? "text-emerald-400" : "text-amber-300/90"}`}>
              {res[p.id].message}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">{p.hint}</div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

/** Wraps a heavy feature: if the device/profile says "no", show the reason
 *  instead of a UI that would hang or OOM. Otherwise render the real feature. */
function FeatureGate({
  gate,
  label,
  children,
}: {
  gate: { ok: boolean; reason?: string };
  label: string;
  children: ReactNode;
}) {
  if (gate.ok) return <>{children}</>;
  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 text-center">
      <Cpu className="h-6 w-6 mx-auto text-amber-300/80 mb-2" />
      <div className="text-sm font-medium">{label} isn't available here</div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{gate.reason}</p>
    </div>
  );
}

/** Device profile card + manual off-switches for the heavy engines. */
function DevicePanel() {
  const dev = device();
  const [prefs, setPrefs] = useState<FeaturePrefs>(() => getFeaturePrefs());
  const tier = dev.tier;
  const badge =
    tier === "high"
      ? { cls: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10", label: "High performance" }
      : tier === "medium"
        ? { cls: "border-amber-400/40 text-amber-300 bg-amber-400/10", label: "Balanced" }
        : { cls: "border-red-400/40 text-red-300 bg-red-400/10", label: "Low power" };
  const mem = dev.memoryGB === null ? "RAM n/a" : `${dev.memoryGB} GB RAM`;
  const toggle = (id: (typeof HEAVY_FEATURES)[number]["id"], on: boolean) =>
    setPrefs(setFeaturePref(id, on));

  return (
    <Tool icon={<Cpu className="h-4 w-4" />} title="This device" desc="How much muscle was detected — and which heavy engines are allowed to run.">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-muted-foreground">{dev.cores} cores</span>
        <span className="text-muted-foreground">· {mem}</span>
        <span className="text-muted-foreground">· {dev.gpu}</span>
        <span className="text-muted-foreground">· {dev.platform}</span>
      </div>

      {tier === "low" ? (
        <p className="text-[11px] text-amber-300/90 mt-2 leading-relaxed">
          This device is running the <b>low-power profile</b>. Text-to-speech, audio denoise, local AI and auto
          captions are switched off so the editor stays smooth. On a faster device (4+ cores, 4 GB+ RAM) they turn on
          automatically.
        </p>
      ) : (
        <>
          <div className="text-[10px] text-muted-foreground mt-2 mb-1">
            You can also switch any of these off here (they start {tier === "medium" ? "on" : "on"} for this profile).
          </div>
          <div className="space-y-1">
            {HEAVY_FEATURES.map((f) => {
              const deviceOk = dev.limits.features[f.id].ok;
              const on = deviceOk && prefs[f.id] !== false;
              return (
                <label
                  key={f.id}
                  className={`flex items-center gap-2 text-[11px] rounded px-2 py-1 border border-border ${
                    deviceOk ? "cursor-pointer hover:border-cyan-400/60" : "opacity-40 cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-cyan-400"
                    disabled={!deviceOk}
                    checked={on}
                    onChange={(e) => toggle(f.id, e.target.checked)}
                  />
                  <span className="flex-1">{f.label}</span>
                  {!deviceOk && <span className="text-[10px] text-amber-300/80">off (device)</span>}
                </label>
              );
            })}
          </div>
        </>
      )}
    </Tool>
  );
}

// ---------------------------------------------------------------------------

function AIWriter({ project }: { project: Project }) {
  const llmRef = useRef<LocalLLM>(new LocalLLM());
  const [status, setStatus] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");
  const [thinking, setThinking] = useState(false);
  const [useCloud, setUseCloud] = useState(false);
  const [keysPresent, setKeysPresent] = useState(aiKeys.hasAny());
  const fileRef = useRef<HTMLInputElement>(null);
  const name = project.name || "my video";

  useEffect(() => () => llmRef.current.dispose(), []);

  // Cloud keys can be added/removed in the Cloud AI tab while this one is open.
  useEffect(() => {
    const iv = window.setInterval(() => setKeysPresent(aiKeys.hasAny()), 1500);
    return () => window.clearInterval(iv);
  }, []);

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
    const localReady = llmRef.current.ready;
    const cloudReady = keysPresent;
    if (!localReady && !cloudReady) {
      toast.info("No local model and no cloud key — AI is optional, keep editing (see Cloud AI tab)");
      return;
    }
    setThinking(true);
    setOut("");
    try {
      if (!localReady || useCloud) {
        const r = await cloudChat(
          [
            {
              role: "system",
              content:
                "You are the writing assistant inside MayoCut, an offline video editor. Be concise and practical. " +
                "For lists, use one idea per line, no numbering, max 80 words total.",
            },
            { role: "user", content: p },
          ],
          { onTry: (n) => setStatus(`Asking ${n}…`) },
        );
        setOut(r.text);
        setStatus(`via ${r.provider} (${r.model})`);
      } else {
        const r = await llmRef.current.ask(p, setStatus);
        setOut(r);
        setStatus(null);
      }
    } catch (e) {
      setStatus(null);
      toast.error(e instanceof Error ? e.message : "AI request failed");
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

      <div className="border border-border rounded-lg p-2.5 space-y-1">
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            className="accent-cyan-400"
            checked={useCloud}
            onChange={(e) => setUseCloud(e.target.checked)}
          />
          Prefer cloud AI (your keys from the Cloud AI tab)
        </label>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {keysPresent
            ? "Cloud keys available — requests go straight from this device to the provider with automatic failover. Uncheck to use the local model when one is loaded."
            : "No cloud keys stored yet — add one in the Cloud AI tab. Without keys (and without a local model) this tab simply stays idle; the editor itself never needs AI."}
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
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      className={`text-[11px] rounded px-2 py-1.5 border flex items-center justify-center gap-1 disabled:opacity-40 ${
        primary ? "bg-primary border-primary" : "border-border hover:border-cyan-400"
      }`}
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
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


