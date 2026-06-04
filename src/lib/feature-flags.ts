// Master Overseer feature-flag registry.
// Toggle state is persisted client-side in localStorage under "mb-flags".
// Backend skeletons read the flag at request time via getFlag().

export type FlagKey =
  | "credits"
  | "adsense_web"
  | "admob_mobile"
  | "whogohost_domains"
  | "free_subdomains";

export const FLAGS: { key: FlagKey; label: string; description: string }[] = [
  {
    key: "credits",
    label: "Credit / token limits",
    description: "Cap generations per user per day. Skeleton wired; counter not enforced until enabled.",
  },
  {
    key: "adsense_web",
    label: "Google AdSense (web)",
    description: "Inject your AdSense slot + a visible 'Built with Mayobuild — contains ads' footer into generated websites.",
  },
  {
    key: "admob_mobile",
    label: "Google AdMob (mobile)",
    description: "Add AdMob banner deps + an About-screen credit to generated Expo apps. Required by AdMob policy.",
  },
  {
    key: "whogohost_domains",
    label: "Whogohost custom domains",
    description: "Use Whogohost API to register paid .com.ng / .name.ng for subscribed users.",
  },
  {
    key: "free_subdomains",
    label: "Free *.mayobuild.app subdomains",
    description: "Auto-assign a free subdomain under your brand for unsubscribed users.",
  },
];

const STORAGE_KEY = "mb-flags";

export function readFlags(): Record<FlagKey, boolean> {
  if (typeof window === "undefined") return {} as Record<FlagKey, boolean>;
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {} as Record<FlagKey, boolean>; }
}

export function writeFlags(next: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getFlag(key: FlagKey): boolean {
  return !!readFlags()[key];
}
