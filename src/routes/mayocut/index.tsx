import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectsHome } from "@/mayocut/components/ProjectsHome";

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
  return (
    <ProjectsHome
      nav={{
        onOpenProject: (id) => navigate({ to: "/mayocut/editor", search: { p: id } }),
        onGetApp: () => navigate({ to: "/downloads" }),
        onBackToPlatform: () => navigate({ to: "/" }),
      }}
    />
  );
}
