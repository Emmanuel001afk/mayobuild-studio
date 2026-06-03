import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { updatePassword } from "@/hooks/use-auth";
import { getSupabase } from "@/integrations/mysupabase/client";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Mayobuild Studio" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase handles the recovery token in the URL and emits an event.
    (async () => {
      const sb = await getSupabase();
      sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
      });
      // Also accept manual entry if a session already exists.
      const { data } = await sb.auth.getSession();
      if (data.session) setReady(true);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await updatePassword(password);
      setOk(true);
      setTimeout(() => navigate({ to: "/" }), 1500);
    } catch (e: any) { setErr(e.message ?? "Failed to update"); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="mb-card p-8 w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold mb-gradient-text">Mayobuild Studio</span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {ready ? "Choose a strong password (min 8 characters)." : "Validating reset link…"}
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input className="mb-input" type="password" required minLength={8}
            placeholder="New password" value={password}
            onChange={(e) => setPassword(e.target.value)} disabled={!ready || ok} />
          {err && <div className="text-sm text-destructive">{err}</div>}
          {ok && <div className="text-sm text-emerald-500">Password updated. Redirecting…</div>}
          <button className="mb-btn w-full" disabled={!ready || busy || ok}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </form>
      </div>
    </div>
  );
}
