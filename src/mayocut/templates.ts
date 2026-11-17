// MayoCut built-in templates.
// A template is a recipe that turns the user's local media into a project.
// No downloads, no database — the library on this device feeds the template.

import {
  ASPECTS,
  DEFAULT_ADJUST,
  newProject,
  uid,
  type MainClip,
  type MediaItem,
  type MediaKind,
  type OverlayClip,
  type Project,
} from "./types";

export interface BuiltInTemplate {
  id: string;
  name: string;
  desc: string;
  aspect: Project["aspect"];
  needs: MediaKind[];
  swatch: string; // css gradient for the gallery card
  build: (media: MediaItem[]) => Project | null;
}

function clip(
  media: MediaItem,
  patch: Partial<MainClip> = {},
): MainClip {
  const dur = media.kind === "video" ? media.duration ?? 5 : 3;
  return {
    id: uid("mc"),
    mediaId: media.id,
    in: 0,
    out: media.kind === "image" ? 3 : Math.min(dur, Math.max(1.5, dur)),
    speed: 1,
    reverse: false,
    filter: "none",
    adjust: { ...DEFAULT_ADJUST },
    volume: 1,
    muted: false,
    transitionIn: "crossfade",
    transitionDur: 0.5,
    ...patch,
  };
}

function base(name: string, aspect: Project["aspect"], templateName: string): Project {
  const p = newProject(name, aspect);
  p.sourceTemplate = templateName;
  return p;
}

const SLIDESHOW_FILTERS = ["none", "warm", "vivid", "cinema", "soft", "bw", "vintage", "cool"];

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "tpl_slideshow",
    name: "Photo Slideshow",
    desc: "Up to 8 photos, gentle crossfades, a title card and a closing card.",
    aspect: "9:16",
    needs: ["image"],
    swatch: "linear-gradient(135deg,#f59e0b 0%,#ec4899 55%,#8b5cf6 100%)",
    build: (media) => {
      const imgs = media.filter((m) => m.kind === "image").slice(0, 8);
      if (imgs.length < 2) return null;
      const p = base("Slideshow", "9:16", "Photo Slideshow");
      const title: OverlayClip = {
        id: uid("tc"),
        kind: "text",
        start: 0.3,
        duration: 2.5,
        text: "MOMENTS",
        size: 110,
        color: "#ffffff",
        bg: "",
        bold: true,
        pos: "tc",
        anim: "fade",
      };
      const outro: OverlayClip = {
        id: uid("tc"),
        kind: "text",
        start: Math.max(0, imgs.length * 3 - 2.4),
        duration: 2.4,
        text: "· 2026 ·",
        size: 64,
        color: "#ffffff",
        bg: "",
        bold: false,
        pos: "bc",
        anim: "fade",
      };
      p.main = imgs.map((m, i) =>
        clip(m, { filter: SLIDESHOW_FILTERS[i % SLIDESHOW_FILTERS.length] }),
      );
      p.tracks[0].clips.push(title, outro);
      return p;
    },
  },
  {
    id: "tpl_intro",
    name: "Cinematic Intro",
    desc: "One video clip with a cinematic filter, a big title and a lower third.",
    aspect: "16:9",
    needs: ["video"],
    swatch: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 55%,#0f172a 100%)",
    build: (media) => {
      const vids = media.filter((m) => m.kind === "video");
      if (vids.length < 1) return null;
      const v = vids[0];
      const p = base("Cinematic Intro", "16:9", "Cinematic Intro");
      const dur = Math.min(v.duration ?? 8, 8);
      p.main = [clip(v, { filter: "cinema", out: dur })];
      p.tracks[0].clips.push(
        {
          id: uid("tc"),
          kind: "text",
          start: 0.4,
          duration: 2.8,
          text: "YOUR STORY\nSTARTS HERE",
          size: 96,
          color: "#ffffff",
          bg: "",
          bold: true,
          pos: "tc",
          anim: "slideup",
        },
        {
          id: uid("tc"),
          kind: "text",
          start: 3.6,
          duration: Math.max(1, dur - 3.8),
          text: "A MAYOCUT PRODUCTION",
          size: 40,
          color: "#e2e8f0",
          bg: "#000000aa",
          bold: false,
          pos: "bl",
          anim: "fade",
        },
      );
      return p;
    },
  },
  {
    id: "tpl_beat",
    name: "Beat Cut",
    desc: "Fast-paced cut of one video with punchy filter flips and speed pops.",
    aspect: "9:16",
    needs: ["video"],
    swatch: "linear-gradient(135deg,#ef4444 0%,#f97316 50%,#facc15 100%)",
    build: (media) => {
      const vids = media.filter((m) => m.kind === "video");
      if (vids.length < 1) return null;
      const v = vids[0];
      const total = v.duration ?? 10;
      const p = base("Beat Cut", "9:16", "Beat Cut");
      const segs = Math.min(6, Math.max(2, Math.floor(total / 1.2)));
      const segLen = Math.min(1.4, total / segs);
      const filters = ["punch", "vivid", "noir", "cinema", "bw", "punch"];
      const main: MainClip[] = [];
      let t = 0;
      for (let i = 0; i < segs; i++) {
        const in0 = Math.min(t, Math.max(0, total - 0.4));
        main.push(
          clip(v, {
            in: in0,
            out: Math.min(total, in0 + segLen),
            speed: i % 2 === 1 ? 1.5 : 1,
            filter: filters[i % filters.length],
            transitionIn: i === 0 ? "none" : "fadeblack",
            transitionDur: 0.2,
          }),
        );
        t = Math.min(total, t + segLen);
        if (t >= total - 0.3) break;
      }
      p.main = main;
      p.tracks[0].clips.push({
        id: uid("tc"),
        kind: "text",
        start: 0.2,
        duration: 1.6,
        text: "LET'S GO",
        size: 120,
        color: "#ffffff",
        bg: "",
        bold: true,
        pos: "tc",
        anim: "slideup",
      });
      return p;
    },
  },
  {
    id: "tpl_lyric",
    name: "Lyric Box",
    desc: "Your audio with a synced-style lyric title in the center frame.",
    aspect: "1:1",
    needs: ["audio"],
    swatch: "linear-gradient(135deg,#8b5cf6 0%,#d946ef 55%,#f43f5e 100%)",
    build: (media) => {
      const auds = media.filter((m) => m.kind === "audio");
      if (auds.length < 1) return null;
      const a = auds[0];
      const p = base("Lyric Box", "1:1", "Lyric Box");
      const dur = Math.min(a.duration ?? 20, 20);
      // silent base: audio drives the timeline; we add a black main clip so
      // the timeline has length even with pure audio.
      const black = media.find((m) => m.kind === "image");
      if (black) {
        p.main = [clip(black, { out: dur, muted: true, filter: "noir" })];
      }
      p.tracks[2].clips.push({
        id: uid("ac"),
        kind: "audio",
        mediaId: a.id,
        start: 0,
        duration: dur,
        volume: 1,
      });
      const line1: OverlayClip = {
        id: uid("tc"),
        kind: "text",
        start: 0.5,
        duration: dur / 2 - 0.6,
        text: "every note is a memory",
        size: 64,
        color: "#ffffff",
        bg: "",
        bold: true,
        pos: "tc",
        anim: "fade",
      };
      const line2: OverlayClip = {
        id: uid("tc"),
        kind: "text",
        start: dur / 2,
        duration: dur / 2 - 0.6,
        text: "every memory a song",
        size: 64,
        color: "#fde68a",
        bg: "",
        bold: true,
        pos: "tc",
        anim: "fade",
      };
      p.tracks[0].clips.push(line1, line2);
      return p;
    },
  },
];

export function templateAspectSize(id: string): { w: number; h: number } {
  const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === id);
  const a = tpl ? ASPECTS[tpl.aspect] : ASPECTS["9:16"];
  return { w: a.w, h: a.h };
}
