import type { OverlayClip } from "./types";

/** The timer is deterministic timeline time, never the device's wall clock. */
export function stickerText(clip: OverlayClip, localTime: number): string {
  if (clip.sticker !== "timecode") return clip.text ?? "";
  const seconds = Math.floor(
    Math.max(0, Number.isFinite(localTime) ? clip.start + localTime : clip.start),
  );
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainder).padStart(2, "0");
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const FEATURED_STICKERS: {
  id: string;
  name: string;
  label: string;
  description: string;
  patch: Partial<OverlayClip>;
}[] = [
  {
    id: "timecode",
    name: "Video time",
    label: "00:00",
    description: "Follows the project playhead",
    patch: {
      sticker: "timecode",
      anim: "none",
      size: 72,
      pos: "tr",
      color: "#ffffff",
      bg: "#111827",
      radius: 12,
      bold: true,
    },
  },
  {
    id: "cat",
    name: "Waving cat",
    label: "🐱",
    description: "Animated emoji sticker",
    patch: { anim: "wave", size: 150, pos: "mc", bg: "" },
  },
];
