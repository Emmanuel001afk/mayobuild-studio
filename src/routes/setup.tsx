// src/routes/setup.tsx
// One place to get every SQL file this platform needs, plus a plain-English
// map of what each page in Mayobuild Studio is actually for.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import mainSql from "../../db/schema.sql?raw";
import hubSql from "../../db/hub-schema.sql?raw";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  Check,
  Copy,
  Database,
  Download,
  ShieldAlert,
  Bot,
  Cpu,
  LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Setup & SQL — Mayobuild Studio" },
      {
        name: "description",
        content:
          "Copy or download the database SQL for Mayobuild Studio and see what every page of the platform does.",
      },
      { property: "og:title", content: "Setup & SQL — Mayobuild Studio" },
      { property: "og:description", content: "Database SQL files and a plain-English map of the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="mb-card p-8 max-w-md text-center">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h1 className="text-xl font-bold mb-1">Restricted area</h1>
          <p className="text-sm text-muted-foreground mb-4">Setup is for the overseer account only.</p>
          <Link to="/" className="mb-btn">Back to workspace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" /> Setup &amp; SQL
        </h1>
        <div className="flex gap-2">
          <Link to="/admin" className="mb-btn-ghost text-sm">Overseer</Link>
          <Link to="/" className="mb-btn-ghost text-sm"><ArrowLeft className="h-4 w-4" /> Workspace</Link>
        </div>
      </div>

      <div className="mb-card p-4 mb-6 text-sm text-muted-foreground">
        <p className="mb-2 text-foreground font-medium">How to run these</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Open your Supabase project → <strong>SQL Editor</strong> → <strong>New query</strong>.</li>
          <li>Press <strong>Copy</strong> below, paste the whole thing in, and click <strong>Run</strong>.</li>
          <li>Both files are safe to re-run — nothing is deleted or overwritten.</li>
        </ol>
      </div>

      <SqlBlock
        title="1. Main platform schema"
        filename="schema.sql"
        description="Users, projects, generations, collaboration, integrations, API keys. Run this first."
        sql={mainSql}
      />

      <SqlBlock
        title="2. AEM AI Hub schema"
        filename="hub-schema.sql"
        description="Hub API keys, usage log, AI memory (RAG), connected sites and the local-model bridge. Run this second."
        sql={hubSql}
      />

      <h2 className="text-lg font-bold mt-10 mb-3">What each page is for</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <PageCard
          icon={<LayoutDashboard className="h-4 w-4" />}
          to="/"
          name="Workspace (home)"
          text="Your project grid: create websites and mobile apps, open the split-panel editor, publish, invite collaborators, download Android builds."
        />
        <PageCard
          icon={<Bot className="h-4 w-4" />}
          to="/console"
          name="AI Ops Console"
          text="Connect GitHub, a database and a deployment platform, then talk to the Orchestrator about any codebase — including other websites you own."
        />
        <PageCard
          icon={<Cpu className="h-4 w-4" />}
          to="/aem"
          name="AEM AI Hub (local model)"
          text="Upload your .gguf model into this tab, issue API keys, and let other sites call your brain at /api/hub."
        />
        <PageCard
          icon={<ShieldAlert className="h-4 w-4" />}
          to="/admin"
          name="Overseer dashboard"
          text="Global stats, all users and projects, feature toggles (credits, ads, domains) and custom domain settings."
        />
      </div>
    </div>
  );
}

function SqlBlock({
  title,
  filename,
  description,
  sql,
}: {
  title: string;
  filename: string;
  description: string;
  sql: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function copy() {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function download() {
    const url = URL.createObjectURL(new Blob([sql], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mb-card p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{filename}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="mb-btn text-sm">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={download} className="mb-btn-ghost text-sm">
            <Download className="h-4 w-4" /> Download
          </button>
        </div>
      </div>

      <button onClick={() => setOpen((v) => !v)} className="text-sm underline mt-3 text-muted-foreground">
        {open ? "Hide SQL" : "Show SQL"}
      </button>
      {open && (
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
          {sql}
        </pre>
      )}
    </section>
  );
}

function PageCard({
  icon,
  to,
  name,
  text,
}: {
  icon: React.ReactNode;
  to: string;
  name: string;
  text: string;
}) {
  return (
    <Link to={to} className="mb-card p-4 block hover:border-primary transition-colors">
      <div className="flex items-center gap-2 font-medium mb-1">{icon}{name}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </Link>
  );
}
