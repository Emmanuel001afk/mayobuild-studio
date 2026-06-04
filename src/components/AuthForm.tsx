import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { signIn, signUp, signInWithGoogle, sendPasswordReset } from "@/hooks/use-auth";

type Mode = "signin" | "signup" | "forgot";

export function AuthForm({ onAuthed }: { onAuthed?: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === "signin") { await signIn(email, password); onAuthed?.(); }
      else if (mode === "signup") {
        await signUp(email, password);
        // Auto sign-in happens inside signUp() — land straight in the dashboard.
        onAuthed?.();
      } else {
        await sendPasswordReset(email);
        setMsg("Check your inbox for a reset link.");
      }
    } catch (e: any) {
      setErr(e.message ?? "Auth failed");
    } finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setErr(null);
    try { await signInWithGoogle(); }
    catch (e: any) { setErr(e.message ?? "Google sign-in failed"); setBusy(false); }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">
        {mode === "signin" && "Welcome back"}
        {mode === "signup" && "Create your account"}
        {mode === "forgot" && "Reset your password"}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {mode === "signin" && "Sign in to your workspace"}
        {mode === "signup" && "Start building in seconds"}
        {mode === "forgot" && "We'll email you a secure reset link"}
      </p>

      {mode !== "forgot" && (
        <>
          <button type="button" onClick={google} disabled={busy}
            className="mb-btn-ghost w-full border border-border mb-3">
            <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.9 6.4 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.9 6.4 29.2 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-1.9 13.4-5l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.3l6.2 5.2c-.4.4 6.6-4.8 6.6-14.5 0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <div className="h-px flex-1 bg-border" /> or email <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        <input className="mb-input" type="email" required placeholder="you@email.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "forgot" && (
          <input className="mb-input" type="password" required minLength={8}
            placeholder="Password (min 8 chars)" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        )}
        {err && <div className="text-sm text-destructive">{err}</div>}
        {msg && <div className="text-sm text-emerald-500">{msg}</div>}
        <button className="mb-btn w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "signin" && "Sign in"}
          {mode === "signup" && "Create account"}
          {mode === "forgot" && "Send reset link"}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button className="text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
        {mode !== "forgot" ? (
          <button className="text-muted-foreground hover:text-foreground"
            onClick={() => setMode("forgot")}>Forgot password?</button>
        ) : (
          <button className="text-muted-foreground hover:text-foreground"
            onClick={() => setMode("signin")}>Back to sign in</button>
        )}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        By continuing you agree to our <Link to="/" className="underline">terms</Link>.
      </div>
    </div>
  );
}
