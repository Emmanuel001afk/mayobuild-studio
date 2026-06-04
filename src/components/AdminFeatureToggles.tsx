import { useEffect, useState } from "react";
import { FLAGS, readFlags, writeFlags, type FlagKey } from "@/lib/feature-flags";
import { ToggleRight } from "lucide-react";

export function AdminFeatureToggles() {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => setState(readFlags()), []);

  function toggle(key: FlagKey) {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    writeFlags(next);
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <ToggleRight className="h-5 w-5 text-primary" /> Feature toggles (Overseer-only)
      </h2>
      <div className="mb-card divide-y divide-border">
        {FLAGS.map((f) => (
          <div key={f.key} className="flex items-start justify-between gap-4 p-4">
            <div>
              <div className="font-semibold">{f.label}</div>
              <div className="text-sm text-muted-foreground">{f.description}</div>
            </div>
            <button
              onClick={() => toggle(f.key)}
              aria-pressed={!!state[f.key]}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                state[f.key] ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-background transition-transform ${
                  state[f.key] ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Toggles persist locally for the Overseer account. Backend skeletons read these at request time;
        enabling AdSense/AdMob also injects a visible "Built with Mayobuild — contains ads" credit
        (required by Google publisher policy).
      </p>
    </section>
  );
}
