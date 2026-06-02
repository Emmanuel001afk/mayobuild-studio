import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

type Props = {
  onTranscript: (text: string) => void;
  className?: string;
};

/** Voice button — uses Web Speech API when available, falls back to Groq Whisper. */
export function MicButton({ onTranscript, className }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<any>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const hasWebSpeech =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  async function startWebSpeech() {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(" ");
      onTranscript(t);
    };
    r.onend = () => setRecording(false);
    r.onerror = () => setRecording(false);
    recRef.current = r;
    r.start();
    setRecording(true);
  }

  async function startWhisper() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setBusy(true);
      try {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("file", blob, "voice.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        const j = await res.json();
        if (j.text) onTranscript(j.text);
      } finally {
        setBusy(false);
      }
    };
    mediaRef.current = mr;
    mr.start();
    setRecording(true);
  }

  async function start() {
    try {
      if (hasWebSpeech) await startWebSpeech();
      else await startWhisper();
    } catch (e) {
      console.error(e);
      setRecording(false);
    }
  }

  function stop() {
    if (recRef.current) { recRef.current.stop(); recRef.current = null; }
    if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
    setRecording(false);
  }

  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={busy}
      className={`mb-btn-ghost ${className ?? ""}`}
      title={recording ? "Stop recording" : "Voice prompt"}
      aria-label="Voice prompt"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4" />}
      <span className="hidden sm:inline">{recording ? "Stop" : busy ? "Transcribing…" : "Voice"}</span>
    </button>
  );
}
