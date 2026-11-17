import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectsHome } from "@/mayocut/components/ProjectsHome";
import { isShellApp } from "@/lib/shell";

export const Route = createFileRoute("/mayocut/")({
  head: () => ({
    meta: [
      { title: "MayoCut — Video Studio · Mayobuild" },
      {
        name: "description",
        content:
          "CapCut-style video editor that runs 100% offline on your device. Multi-track timeline, templates, filters, text, transitions and export — no account, no cloud database.",
      },
    ],
  }),
  component: MayoCutHome,
});

function MayoCutHome() {
  const navigate = useNavigate();
  const shell = isShellApp();
  return (
    <ProjectsHome
      desktop={shell || undefined}
      nav={{
        onOpenProject: (id) => navigate({ to: "/mayocut/editor", search: { p: id } }),
        // web-only affordances are hidden in the native shell
        onGetApp: shell ? undefined : () => navigate({ to: "/downloads" }),
        onBackToPlatform: shell ? undefined : () => navigate({ to: "/" }),
      }}
    />
  );
}
