import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Cpu,
  Download,
  Film,
  Globe,
  Info,
  Monitor,
  Scissors,
  Smartphone,
  WifiOff,
} from "lucide-react";

const REPO = "Emmanuel001afk/mayobuild-studio";
const VERSION = "0.2.0";
const LATEST = `https://github.com/${REPO}/releases/latest/download`;
const EXE_URL = `${LATEST}/mayocut-setup-${VERSION}.exe`;
const APK_URL = `${LATEST}/mayocut-android-${VERSION}.apk`;

export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "Download MayoCut · Mayobuild Studio" },
      {
        name: "description",
        content:
          "Download the MayoCut video editor for Windows (.exe installer) and Android (.apk). 100% offline video editing — no account, no cloud database.",
      },
    ],
  }),
  component: DownloadsPage,
});

function DownloadsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <Scissors className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">
            MayoCut
          </span>
          <span className="text-xs text-muted-foreground">by Mayobuild Studio</span>
          <div className="ml-auto">
            <Link to="/mayocut" className="mb-btn-ghost text-sm">
              <Globe className="h-4 w-4" /> Open in browser
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="text-center max-w-2xl mx-auto">
          <div className="mb-chip inline-flex mb-4">
            <WifiOff className="h-3 w-3" /> works 100% offline · no account · your device is the database
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold">
            Get <span className="mb-gradient-text">MayoCut</span>
          </h1>
          <p className="text-muted-foreground mt-3">
            A CapCut-style video editor built into the Mayobuild platform: multi-track timeline, templates, filters,
            text &amp; captions, transitions, speed control and export — everything runs on your device.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 mt-10 max-w-3xl mx-auto">
          <DownloadCard
            icon={<Monitor className="h-7 w-7" />}
            title="Windows"
            version={`v${VERSION} · NSIS installer (.exe)`}
            desc="Full-featured desktop app: MP4 + WebM export, keyframes, green screen, template packs, on-device assist tools and optional local AI."
            url={EXE_URL}
            badge="Recommended for long timelines"
          />
          <DownloadCard
            icon={<Smartphone className="h-7 w-7" />}
            title="Android"
            version={`v${VERSION} · APK (install directly)`}
            desc="Native-feel wrapper around the same engine. Import from your gallery, edit offline, export straight to your phone."
            url={APK_URL}
            badge="Side-load: enable “Install unknown apps”"
          />
        </div>

        <div className="max-w-3xl mx-auto mt-5 mb-card p-6">
          <h2 className="font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Or use it right now in your browser
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            <Link to="/mayocut" className="text-cyan-300 underline">
              /mayocut
            </Link>{" "}
            runs the full editor in Chrome, Edge or Android Chrome. On a phone you can “Add to Home screen” to get a
            launch-icon that opens full-screen and keeps working offline.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Feature ok label="Multi-track timeline (video / text / overlay / audio)" />
            <Feature ok label="Trim, split, speed, reverse, filters, transitions" />
            <Feature ok label="Keyframes (motion & opacity over time)" />
            <Feature ok label="Green screen (chroma key) overlays" />
            <Feature ok label="Audio studio: waveforms, fades, mic recording" />
            <Feature ok label="Built-in + downloadable packs + shareable .json templates" />
            <Feature ok label="Projects & media stored on-device (IndexedDB)" />
            <Feature ok label="Export MP4 + WebM at 24/30/60 fps, saved locally" />
            <Feature ok label="On-device assist tools + optional local AI (always private)" />
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-6 mb-card p-6">
          <h2 className="font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" /> How the APK &amp; EXE are built
          </h2>
          <ul className="text-sm text-muted-foreground mt-3 space-y-2 list-disc pl-5">
            <li>
              One codebase: the editor lives in the Mayobuild web app. The Windows build wraps it with Electron +
              electron-builder (NSIS installer). The Android build wraps the same static bundle with Capacitor.
            </li>
            <li>
              Releases are built by GitHub Actions (<code className="text-xs bg-slate-900 px-1 rounded">.github/workflows/distribute.yml</code>)
              and attached to the <a className="text-cyan-300 underline" href={`https://github.com/${REPO}/releases`} target="_blank" rel="noreferrer">GitHub Releases</a> — no
              server, no database, no paywall.
            </li>
            <li>
              To build locally: <code className="text-xs bg-slate-900 px-1 rounded">npm run dist:win</code> (Windows) or{" "}
              <code className="text-xs bg-slate-900 px-1 rounded">npm run dist:android</code> (needs Android SDK / JDK 21).
            </li>
            <li>
              If a button below 404s, the next release hasn't been published yet — trigger the <b>distribute</b> workflow
              from the Actions tab, or merge the branch and tag it.
            </li>
          </ul>
        </div>

        <footer className="text-center text-xs text-muted-foreground py-10">
          <div className="flex items-center justify-center gap-2">
            <Cpu className="h-3 w-3" />
            <Film className="h-3 w-3" />
            <span>MayoCut · Mayobuild Studio · v{VERSION}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function DownloadCard({
  icon,
  title,
  version,
  desc,
  url,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  version: string;
  desc: string;
  url: string;
  badge: string;
}) {
  return (
    <div className="mb-card p-6 flex flex-col">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center text-primary">{icon}</div>
        <div>
          <div className="font-bold">{title}</div>
          <div className="text-xs text-muted-foreground">{version}</div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-3 flex-1">{desc}</p>
      <a
        href={url}
        className="mb-btn w-full mt-4 bg-primary"
        download
        target="_blank"
        rel="noreferrer"
      >
        <Download className="h-4 w-4" /> Download
      </a>
      <div className="text-[11px] text-muted-foreground mt-2 text-center">{badge}</div>
    </div>
  );
}

function Feature({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span
      className={`mb-chip ${ok ? "" : "opacity-60 border-dashed"}`}
      title={ok ? "In v0.1" : "Roadmap"}
    >
      {ok ? <Check className="h-3 w-3 text-emerald-400" /> : <span className="text-[9px]">SOON</span>} {label}
    </span>
  );
}
