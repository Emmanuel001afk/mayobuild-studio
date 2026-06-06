import { useEffect, useState } from "react";
import { Globe, Check } from "lucide-react";

const KEY = "mb_custom_domain";

export function AdminCustomDomain() {
  const [domain, setDomain] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (v) { setDomain(v); setSaved(v); }
  }, []);

  function save() {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!clean) return;
    localStorage.setItem(KEY, clean);
    setSaved(clean);
  }
  function clear() {
    localStorage.removeItem(KEY);
    setDomain("");
    setSaved(null);
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" /> Custom brand domain
      </h2>
      <div className="mb-card p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Add your own domain (e.g. <code className="text-foreground">mayobuild.com</code>) to use as the
          default subdomain root for new projects. Until you point DNS to our IP, this is a display
          label — published sites still serve from the public Storage URL.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourdomain.com"
            className="mb-input flex-1"
          />
          <button onClick={save} className="mb-btn">Save</button>
          {saved && <button onClick={clear} className="mb-btn-ghost">Remove</button>}
        </div>
        {saved && (
          <div className="text-xs text-emerald-400 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Saved: {saved}
          </div>
        )}
        <div className="text-xs text-muted-foreground border-t border-border pt-3">
          <strong>DNS instructions (manual):</strong> at your registrar create an A record for
          <code className="mx-1 text-foreground">@</code> and <code className="text-foreground">www</code>
          pointing to your CDN / proxy IP, then enable HTTPS. We will pick this label up automatically
          once DNS resolves.
        </div>
      </div>
    </section>
  );
}
