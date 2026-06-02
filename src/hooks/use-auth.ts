import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/mysupabase/client";

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

  return { session, user, loading };
}

export async function signIn(email: string, password: string) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const sb = await getSupabase();
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}
