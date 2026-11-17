import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Editor } from "@/mayocut/components/Editor";
import { isShellApp } from "@/lib/shell";

export const Route = createFileRoute("/mayocut/editor")({
  validateSearch: (s: Record<string, unknown>) => ({ p: String(s.p ?? "") }),
  head: () => ({
    meta: [{ title: "Editor · MayoCut" }],
  }),
  component: MayoCutEditorRoute,
});

function MayoCutEditorRoute() {
  const { p } = Route.useSearch();
  const navigate = useNavigate();
  if (!p) {
    // no project id — send the user home
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        No project selected — <button className="underline" onClick={() => navigate({ to: "/mayocut" })}>go to MayoCut</button>
      </div>
    );
  }
  return <Editor desktop={isShellApp() || undefined} projectId={p} onExit={() => navigate({ to: "/mayocut" })} />;
}
