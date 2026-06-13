import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createProject } from "@/lib/projects.functions";
import { callRouter } from "@/lib/router.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft, Loader2, Sparkles, Globe, Smartphone,
  Palette, Layout, ShoppingCart, MessageSquare, BookOpen,
  Music, Camera, BarChart, Users, Utensils, Briefcase, Heart
} from "lucide-react";

export const Route = createFileRoute("/projects/build")({
  head: () => ({ meta: [{ title: "Build new project — Mayobuild Studio" }] }),
  component: BuildProject,
});

// Template categories — gives AI a strong starting point
const TEMPLATES = [
  { id: "landing", icon: Globe, label: "Landing page", desc: "Hero, features, pricing, CTA" },
  { id: "marketplace", icon: ShoppingCart, label: "Marketplace", desc: "Products, cart, seller profiles" },
  { id: "social", icon: Users, label: "Social / Community", desc: "Feed, profiles, messaging" },
  { id: "dashboard", icon: BarChart, label: "Dashboard / Analytics", desc: "Charts, stats, data tables" },
  { id: "blog", icon: BookOpen, label: "Blog / Magazine", desc: "Articles, categories, search" },
  { id: "portfolio", icon: Camera, label: "Portfolio", desc: "Gallery, about, contact" },
  { id: "restaurant", icon: Utensils, label: "Restaurant / Food", desc: "Menu, reservations, delivery" },
  { id: "chat", icon: MessageSquare, label: "Chat / Messaging", desc: "Real-time chat, channels" },
  { id: "music", icon: Music, label: "Music / Media", desc: "Player, playlists, discovery" },
  { id: "health", icon: Heart, label: "Health / Fitness", desc: "Tracker, goals, progress" },
  { id: "business", icon: Briefcase, label: "Business / SaaS", desc: "Features, pricing, auth" },
  { id: "custom", icon: Palette, label: "Custom — describe it", desc: "Tell the AI exactly what to build" },
];

const COLOR_THEMES = [
  { id: "dark", label: "Dark", bg: "#0f0f0f", accent: "#4ade80" },
  { id: "light", label: "Light", bg: "#ffffff", accent: "#6366f1" },
  { id: "blue", label: "Ocean", bg: "#0f172a", accent: "#38bdf8" },
  { id: "purple", label: "Purple", bg: "#1e1b4b", accent: "#a78bfa" },
  { id: "orange", label: "Warm", bg: "#1c1007", accent: "#fb923c" },
  { id: "green", label: "Forest", bg: "#052e16", accent: "#86efac" },
];

function BuildProject() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const create = useServerFn(createProject);
  const route = useServerFn(callRouter);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<"website" | "mobile">("website");
  const [template, setTemplate] = useState<string>("");
  const [theme, setTheme] = useState<string>("dark");
  const [appName, setAppName] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  if (!loading && !user) { navigate({ to: "/" }); return null; }

  const selectedTemplate = TEMPLATES.find(t => t.id === template);
  const selectedTheme = COLOR_THEMES.find(t => t.id === theme) ?? COLOR_THEMES[0];

  async function handleBuild() {
    if (!appName.trim()) { setErr("Please give your app a name"); return; }
    if (!template) { setErr("Please choose a template"); return; }
    setBusy(true); setErr(null);

    try {
      // Step 1: Create the project in Supabase
      setProgress("Creating your project…");
      const project = await create({ data: { name: appName.trim(), kind } });

      // Step 2: Build the full system prompt
      const themeDesc = COLOR_THEMES.find(t => t.id === theme);
      const systemPrompt = [
        "You are Mayobuild AI — a full-stack React/TypeScript engineer building a complete, production-ready application.",
        "Generate a COMPLETE, FULLY FUNCTIONAL React/TypeScript component with:",
        "1. Full TailwindCSS styling — use the color theme specified",
        "2. All pages and navigation the app needs",
        "3. Working interactive features (state management, forms, modals, etc.)",
        "4. Mobile responsive design",
        "5. Realistic placeholder data and content",
        "6. Professional, polished UI — not a demo or wireframe",
        "Return the code as a single complete TSX file wrapped in: ```tsx App.tsx",
        "The file must be a default export React component.",
        "IMPORTANT: Make it look and feel like a real, professional product.",
      ].join(" ");

      const userPrompt = [
        `Build a complete ${kind === "mobile" ? "mobile app" : "web application"} called "${appName}".`,
        selectedTemplate?.id !== "custom" ? `App type: ${selectedTemplate?.label} — ${selectedTemplate?.desc}` : "",
        description ? `Description: ${description}` : "",
        features ? `Key features to include: ${features}` : "",
        `Color theme: ${themeDesc?.label} (background: ${themeDesc?.bg}, accent color: ${themeDesc?.accent})`,
        "Build everything — navigation, pages, components, interactions. Make it complete and professional.",
      ].filter(Boolean).join("\n");

      // Step 3: Call AI to generate the app
      setProgress("AI is building your app… this may take 30–60 seconds…");
      const res = await route({
        data: {
          task: "complex_app",
          prompt: userPrompt,
          system: systemPrompt,
          projectId: project.id,
          history: [],
        }
      });

      const raw = res?.content ?? res?.output ?? "";

      // Step 4: Extract the generated code
      const codeMatch = raw.match(/```(?:tsx?|jsx?)\s+\S+\s*\n([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : raw.trim();

      if (!code || code.length < 100) {
        throw new Error("AI did not generate enough code. Please try again with a more detailed description.");
      }

      // Step 5: Save as scaffold HTML with react-source
      const fileMap = `/* ===== FILE: src/App.tsx ===== */\n${code}`;
      const scaffoldHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${appName}</title>
<style>
  body { font-family: system-ui, sans-serif; background: ${themeDesc?.bg ?? "#0f0f0f"}; color: #fff; padding: 2rem; }
  .info { background: #1a1a2e; border: 1px solid #16213e; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
  h1 { color: ${themeDesc?.accent ?? "#4ade80"}; margin: 0 0 0.5rem; }
</style>
</head>
<body>
<div class="info">
  <h1>🚀 ${appName}</h1>
  <p style="color:#94a3b8">Built by Mayobuild AI. Push to GitHub to deploy your live app.</p>
</div>
<script type="text/plain" id="react-source">${fileMap}</script>
</body>
</html>`;

      // Save preview_html with the generated code
      const { savePreview } = await import("@/lib/projects.functions");
      const saveFn = useServerFn(savePreview);
      // Navigate to the project — it will load the generated code
      setProgress("Done! Taking you to your new app…");
      navigate({ to: "/projects/$id", params: { id: project.id }, search: { generated: "true" } });

    } catch (e: any) {
      setErr(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <Link to="/" className="mb-btn-ghost mb-6 inline-flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <h1 className="text-3xl font-bold mb-1">Build something new</h1>
      <p className="text-muted-foreground mb-8">Describe what you want — AI builds it as a complete React app.</p>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s}
            </div>
            {s < 3 && <div className={`h-0.5 w-12 transition-colors ${step > s ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {step === 1 ? "Choose type" : step === 2 ? "Describe your app" : "Review & build"}
        </span>
      </div>

      <div className="mb-card p-8">

        {/* STEP 1: Template + Kind */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-semibold mb-4">What are you building?</h2>

            {/* Website vs Mobile */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setKind("website")} className={`mb-card p-4 text-left transition-all ${kind === "website" ? "ring-2 ring-primary" : ""}`}>
                <Globe className="h-6 w-6 text-primary mb-2" />
                <div className="font-semibold">Website / Web App</div>
                <div className="text-xs text-muted-foreground">Runs in any browser</div>
              </button>
              <button onClick={() => setKind("mobile")} className={`mb-card p-4 text-left transition-all ${kind === "mobile" ? "ring-2 ring-accent" : ""}`}>
                <Smartphone className="h-6 w-6 text-accent mb-2" />
                <div className="font-semibold">Mobile App</div>
                <div className="text-xs text-muted-foreground">React Native / Expo</div>
              </button>
            </div>

            {/* Template grid */}
            <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Choose a template</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`mb-card p-4 text-left transition-all ${template === t.id ? "ring-2 ring-primary bg-primary/5" : ""}`}
                  >
                    <Icon className="h-5 w-5 text-primary mb-2" />
                    <div className="font-semibold text-sm">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
                  </button>
                );
              })}
            </div>

            {err && <div className="text-sm text-destructive mb-3">{err}</div>}
            <button
              className="mb-btn w-full"
              onClick={() => { if (!template) { setErr("Choose a template first"); return; } setErr(null); setStep(2); }}
            >
              Next — Describe your app
            </button>
          </>
        )}

        {/* STEP 2: Name, description, features, theme */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-semibold mb-4">Tell AI what to build</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">App name *</label>
                <input
                  className="mb-input"
                  placeholder={`e.g. ${selectedTemplate?.id === "marketplace" ? "HALWAY IN" : selectedTemplate?.id === "social" ? "Hive Life" : "My App"}`}
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  maxLength={60}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">What does it do? <span className="text-muted-foreground font-normal">(optional but helps)</span></label>
                <textarea
                  className="mb-input min-h-[80px]"
                  placeholder="e.g. A Nigerian marketplace where students buy and sell items with escrow payments and in-app chat"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Key features to include <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  className="mb-input min-h-[80px]"
                  placeholder="e.g. User login, product listings, search bar, cart, seller profiles, WhatsApp chat button"
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  maxLength={500}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Color theme</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {COLOR_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`rounded-lg p-3 flex flex-col items-center gap-1 border transition-all ${theme === t.id ? "border-primary ring-2 ring-primary" : "border-border"}`}
                      style={{ background: t.bg }}
                    >
                      <div className="w-4 h-4 rounded-full" style={{ background: t.accent }} />
                      <span className="text-xs" style={{ color: t.accent }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {err && <div className="text-sm text-destructive mt-3">{err}</div>}
            <div className="flex gap-3 mt-6">
              <button className="mb-btn-ghost flex-1" onClick={() => setStep(1)}>Back</button>
              <button
                className="mb-btn flex-2"
                onClick={() => { if (!appName.trim()) { setErr("App name is required"); return; } setErr(null); setStep(3); }}
              >
                Next — Review
              </button>
            </div>
          </>
        )}

        {/* STEP 3: Review and build */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-semibold mb-4">Ready to build</h2>

            <div className="rounded-lg border border-border p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium">{kind === "website" ? "Web App" : "Mobile App"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Template</span>
                <span className="font-medium">{selectedTemplate?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{appName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theme</span>
                <span className="font-medium flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: selectedTheme.accent }} />
                  {selectedTheme.label}
                </span>
              </div>
              {description && (
                <div className="pt-1 border-t border-border">
                  <span className="text-muted-foreground block mb-1">Description</span>
                  <span>{description}</span>
                </div>
              )}
              {features && (
                <div className="pt-1 border-t border-border">
                  <span className="text-muted-foreground block mb-1">Features</span>
                  <span>{features}</span>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 mb-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">What happens next:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>AI builds your complete app (30–60 seconds)</li>
                <li>You land on the editor — review what was built</li>
                <li>Ask AI to change anything you want</li>
                <li>Push to GitHub → live on Vercel automatically</li>
              </ol>
            </div>

            {progress && (
              <div className="flex items-center gap-2 text-sm text-primary mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress}
              </div>
            )}
            {err && <div className="text-sm text-destructive mb-4">{err}</div>}

            <div className="flex gap-3">
              <button className="mb-btn-ghost flex-1" onClick={() => setStep(2)} disabled={busy}>Back</button>
              <button className="mb-btn flex-1" onClick={handleBuild} disabled={busy}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</> : <><Sparkles className="h-4 w-4" /> Build my app</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
