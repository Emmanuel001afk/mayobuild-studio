import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AuthForm } from "@/components/AuthForm";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Mayobuild Studio" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="mb-card p-8 w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-6">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold mb-gradient-text">Mayobuild Studio</span>
        </Link>
        <AuthForm onAuthed={() => navigate({ to: "/" })} />
      </div>
    </div>
  );
}
