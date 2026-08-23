import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/mysupabase/client";
import { checkIsAdmin } from "@/lib/admin.functions";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const refreshAdmin = async (u: User | null) => {
      if (!u) { setIsAdmin(false); return; }
      try {
        const r = await checkIsAdmin();
        if (!cancelled) setIsAdmin(!!r.isAdmin);
      } catch { if (!cancelled) setIsAdmin(false); }
    };

    void (async () => {
      try {
        const sb = await getSupabase();
        const { data: { session } } = await sb.auth.getSession();
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        setError(null);
        void refreshAdmin(session?.user ?? null);

        const { data } = sb.auth.onAuthStateChange((_e, s) => {
          setSession(s);
          setUser(s?.user ?? null);
          setLoading(false);
          void refreshAdmin(s?.user ?? null);
        });
        unsub = () => data.subscription.unsubscribe();
      } catch (err) {
        console.error("Auth initialization failed", err);
        if (cancelled) return;
        setSession(null);
        setUser(null);
        setLoading(false);
        setError((err as Error).message || "Could not connect. Check your network and try again.");
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return { session, user, loading, isAdmin, error };
}

export async function signIn(email: string, password: string) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
  });
  if (error) throw error;
  if (!data.session) {
    const { error: siErr } = await sb.auth.signInWithPassword({ email, password });
    if (siErr) throw siErr;
  }
}

export async function signInWithGoogle() {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const sb = await getSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const sb = await getSupabase();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}
