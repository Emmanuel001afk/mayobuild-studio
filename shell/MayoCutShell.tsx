import { useState } from "react";
import { Toaster } from "sonner";
import { ProjectsHome } from "@/mayocut/components/ProjectsHome";
import { Editor } from "@/mayocut/components/Editor";

/**
 * Standalone shell for the desktop (Electron) and Android (Capacitor) builds.
 * Same components as the web platform — no router, no SSR, no network.
 */
type View = { kind: "home" } | { kind: "editor"; id: string };

export function MayoCutShell() {
  const [view, setView] = useState<View>({ kind: "home" });

  return (
    <>
      <Toaster theme="dark" position="top-right" richColors />
      {view.kind === "home" ? (
        <ProjectsHome desktop nav={{ onOpenProject: (id) => setView({ kind: "editor", id }) }} />
      ) : (
        <Editor desktop projectId={view.id} onExit={() => setView({ kind: "home" })} />
      )}
    </>
  );
}
