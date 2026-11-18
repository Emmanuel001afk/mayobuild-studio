import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Download, Home, Scissors } from "lucide-react";
import { getSupabase } from "@/integrations/mysupabase/client";

import appCss from "../styles.css?url";
import { isShellApp } from "@/lib/shell";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MAYOBUILD STUDIO" },
      { name: "description", content: "Create your website in an existing way" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "MAYOBUILD STUDIO" },
      { property: "og:description", content: "Create your website in an existing way" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "MAYOBUILD STUDIO" },
      { name: "twitter:description", content: "Create your website in an existing way" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/54806401-f8bb-4f78-aa50-8ff4be5ffaea" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/54806401-f8bb-4f78-aa50-8ff4be5ffaea" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "icon", type: "image/png", href: "/icons/icon-192.png" },
    ],
  }),
  // The document shell (<html>/<head>/<body>) is only valid for the SSR web
  // build, where the router owns the document. The native shell (APK/EXE)
  // mounts the router into <div id="root"> inside its OWN document — rendering
  // a nested <html> there breaks React's first commit (blank screen on device).
  ...(isShellApp() ? {} : { shellComponent: RootShell }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** App-style bottom navigation for the shell on phones (the editor provides
 *  its own tab bar, so it is excluded). Gives the web app the feel of the
 *  native app on small screens while keeping the full Mayobuild layout. */
function ShellMobileNav() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/mayocut")) return null; // the editor has its own tab bar
  const items = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/mayocut", icon: Scissors, label: "Editor" },
    { to: "/downloads", icon: Download, label: "Get app" },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-card/95 backdrop-blur grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
      {items.map((it) => {
        const active = pathname === it.to;
        return (
          <Link
            key={it.to}
            to={it.to}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${
              active ? "text-cyan-300" : "text-muted-foreground"
            }`}
          >
            <it.icon className="h-5 w-5" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ShellCloudNotice() {
  const { pathname } = useLocation();
  // Home explains it in place; the editor is fully on-device.
  if (pathname === "/" || pathname.startsWith("/mayocut")) return null;
  return (
    <div className="border-b border-amber-400/25 bg-amber-400/10 text-amber-200/90 px-3 py-1.5 text-[11px] sm:text-xs flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>📴 Offline app:</span>
      <span>
        cloud areas (projects, builder, console, AI providers) run on the Mayobuild server — they need a
        connection and the web app. Everything on this device (MayoCut editor, local models, downloads)
        works fully offline.
      </span>
      <Link to="/" className="underline shrink-0">
        Back to home
      </Link>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // PWA: register the offline service worker (production only, browsers only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (import.meta.env.DEV) return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  useEffect(() => {
    // Native shell (APK/EXE): there is no server endpoint providing the
    // Supabase config — the app is offline-first by design. Subscribing to
    // auth here would just produce an unhandled rejection (and a bogus
    // "failed to start" overlay) on every launch.
    if (isShellApp()) return;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const supabase = await getSupabase();
      const { data } = supabase.auth.onAuthStateChange(() => {
        void router.invalidate();
        void queryClient.invalidateQueries();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    })();

    return () => unsubscribe?.();
  }, [queryClient, router]);

  const { pathname } = useLocation();
  const navPadding =
    isShellApp() && !pathname.startsWith("/mayocut") ? "pb-14 md:pb-0" : undefined;

  return (
    <QueryClientProvider client={queryClient}>
      {isShellApp() && <ShellCloudNotice />}
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div className={navPadding}>
        <Outlet />
      </div>
      {isShellApp() && <ShellMobileNav />}
      <Toaster theme="dark" position="top-right" richColors />
    </QueryClientProvider>
  );
}
