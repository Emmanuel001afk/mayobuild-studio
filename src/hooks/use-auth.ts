import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/mysupabase/client";

export const ADMIN_EMAIL = "akintundeemmanuel14@gmail.com";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const sb = await getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      const { data } = sb.auth.onAuthStateChange((_e, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      });
      unsub = () => data.subscription.unsubscribe();
    })();
    return () => unsub?.();
  }, []);

  const isAdmin = !!user?.email && user.email.toLowerCase() === ADMIN_EMAIL;
  return { session, user, loading, isAdmin };
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
  // Email confirmation is disabled — auto sign in so the user lands in the dashboard immediately.
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
