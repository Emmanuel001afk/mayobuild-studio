import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { signIn, signUp, useAuth } from "@/hooks/use-auth";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Mayobuild Studio" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  if (!loading && user) {
    navigate({ to: "/" });
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password);
      navigate({ to: "/" });
    } catch (e: any) {
      setErr(e.message ?? "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="mb-card p-8 w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold mb--gradient-text">Mayobuild Studio</span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "signin" ? "Sign in to your workspace" : "Start building websites & native apps"}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input className="mb-input" type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="mb-input" type="password" required minLength={6} placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <div className="text-sm text-destructive">{err}</div>}
          <button className="mb-btn w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          className="mt-4 text-sm text-muted-foreground hover:text-foreground w-full text-center"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
