// Parse the ISO base media file format (MP4/MOV) far enough to ask the questions
// MayoCut actually cares about on import.
//
// This is deliberately a container reader, not a decoder: it walks the box tree
// and reads `moov`, so it can answer "what codec is this, how big, how long, and
// does it have an audio track" for a REAL file in node — where there is no
// <video> element and therefore no decoder probe. The browser's decoder is still
// authoritative; this is what lets the import policy be tested against genuine
// encodings instead of synthetic canvases.
//
// Scope: 32/64-bit box sizes, `size == 1` largesize, `moov`/`trak`/`mdia`/`minf`/
// `stbl`/`stsd`, visual + audio sample entries, and the `mvhd`/`tkhd`/`mdhd`
// timing fields. It ignores anything it does not need and reports that honestly
// rather than guessing.

import { readFileSync } from "node:fs";

const FOURCC = (buf, at) => buf.toString("latin1", at, at + 4);

/** Iterate the boxes directly inside [start, end). */
function* boxes(buf, start, end) {
  let at = start;
  while (at + 8 <= end) {
    let size = buf.readUInt32BE(at);
    const type = FOURCC(buf, at + 4);
    let header = 8;
    if (size === 1) {
      // largesize: the real size lives in the next 8 bytes (and may exceed 2^32)
      const hi = buf.readUInt32BE(at + 8);
      const lo = buf.readUInt32BE(at + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      // `size 0` means "to end of file"
      size = end - at;
    }
    if (size < header || at + size > end) break; // truncated or malformed
    yield { type, start: at, body: at + header, end: at + size };
    at += size;
  }
}

/** Find the first child box of a type, or null. */
function find(buf, parent, type) {
  for (const b of boxes(buf, parent.start + (parent.start === 0 ? 0 : 0), parent.end)) {
    if (b.type === type) return b;
  }
  return null;
}

function child(buf, parent, type) {
  const from = parent === null ? 0 : parent.body;
  const to = parent === null ? buf.length : parent.end;
  for (const b of boxes(buf, from, to)) {
    if (b.type === type) return b;
  }
  return null;
}

function kids(buf, parent, type) {
  const from = parent === null ? 0 : parent.body;
  const to = parent === null ? buf.length : parent.end;
  const out = [];
  for (const b of boxes(buf, from, to)) {
    if (!type || b.type === type) out.push(b);
  }
  return out;
}

/** Full-box payload offset: skip version (1) + flags (3). */
const fullBox = (b) => b.body + 4;

function readMvhd(buf, box) {
  const v = buf[box.body];
  if (v === 1) {
    return { timescale: buf.readUInt32BE(box.body + 20), duration: Number(buf.readBigUInt64BE(box.body + 24)) };
  }
  return { timescale: buf.readUInt32BE(box.body + 12), duration: buf.readUInt32BE(box.body + 16) };
}

function readMdhd(buf, box) {
  const v = buf[box.body];
  if (v === 1) {
    return { timescale: buf.readUInt32BE(box.body + 20), duration: Number(buf.readBigUInt64BE(box.body + 24)) };
  }
  return { timescale: buf.readUInt32BE(box.body + 12), duration: buf.readUInt32BE(box.body + 16) };
}

function readTkhd(buf, box) {
  const v = buf[box.body];
  // width/height are 16.16 fixed-point at the very end of the box
  const w = buf.readUInt32BE(box.end - 8) / 65536;
  const h = buf.readUInt32BE(box.end - 4) / 65536;
  const idOffset = v === 1 ? box.body + 4 + 8 + 8 : box.body + 4 + 4 + 4;
  return { trackId: buf.readUInt32BE(idOffset), width: Math.round(w), height: Math.round(h) };
}

/** Sample entries in `stsd`, with the codec FourCC and the entry's own fourcc. */
function sampleEntries(buf, stsd) {
  // version/flags (4), entry_count (4), then entries
  let at = stsd.body + 8;
  const count = buf.readUInt32BE(stsd.body + 4);
  const out = [];
  for (let i = 0; i < count && at + 8 <= stsd.end; i++) {
    const size = buf.readUInt32BE(at);
    if (size < 8 || at + size > stsd.end) break;
    const fourcc = FOURCC(buf, at + 4);
    const entry = { fourcc, start: at, body: at + 8, end: at + size };
    // Visual entries carry width/height as 16-bit at the end of the header.
    // Audio entries ('mp4a') instead carry channelcount/samplerate.
    if (/^(avc1|avc3|hvc1|hev1|av01|vp09|vp08|mp4v)$/.test(fourcc)) {
      entry.width = buf.readUInt16BE(entry.start + 8 + 16);
      entry.height = buf.readUInt16BE(entry.start + 8 + 18);
    } else if (fourcc === "mp4a" || fourcc === "Opus" || fourcc === "ac-3") {
      // Audio sample entry: 6 reserved, 2 data_ref_index, 2 version, 2 revision,
      // 4 vendor, then channelcount(2), samplesize(2), pre_defined(2),
      // reserved(2), samplerate(4 as 16.16 fixed-point).
      entry.channels = buf.readUInt16BE(entry.start + 8 + 16);
      entry.sampleRate = buf.readUInt32BE(entry.start + 8 + 24) / 65536;
    }
    out.push(entry);
    at += size;
  }
  return out;
}

/**
 * Probe an MP4/MOV buffer.
 *
 * Returns a plain object rather than throwing on odd files: `ok: false` plus a
 * reason is more useful to an import path than an exception, and it means a
 * malformed fixture fails the audit loudly instead of crashing it.
 */
export function probeMp4(buf) {
  const result = { ok: false, reason: "", brand: "", duration: 0, width: 0, height: 0, tracks: [], video: null, audio: null };
  const ftyp = child(buf, null, "ftyp");
  if (ftyp) result.brand = FOURCC(buf, ftyp.body);
  const moov = child(buf, null, "moov");
  if (!moov) {
    result.reason = "no moov box (fragmented or not an mp4)";
    return result;
  }
  const mvhd = child(buf, moov, "mvhd");
  if (mvhd) {
    const t = readMvhd(buf, mvhd);
    if (t.timescale > 0) result.duration = t.duration / t.timescale;
  }
  for (const trak of kids(buf, moov, "trak")) {
    const tkhd = child(buf, trak, "tkhd");
    const mdia = child(buf, trak, "mdia");
    if (!mdia) continue;
    const mdhd = child(buf, mdia, "mdhd");
    const hdlr = child(buf, mdia, "hdlr");
    const handler = hdlr ? FOURCC(buf, hdlr.body + 8) : "";
    const minf = child(buf, mdia, "minf");
    const stbl = minf ? child(buf, minf, "stbl") : null;
    const stsd = stbl ? child(buf, stbl, "stsd") : null;
    const entries = stsd ? sampleEntries(buf, stsd) : [];
    const ms = mdhd ? readMdhd(buf, mdhd) : { timescale: 0, duration: 0 };
    const track = {
      handler,
      codec: entries[0]?.fourcc ?? "",
      duration: ms.timescale > 0 ? ms.duration / ms.timescale : 0,
      ...readTkhd(buf, tkhd ?? { body: 0, end: 0, start: 0 }),
      ...(entries[0]?.width ? { width: entries[0].width, height: entries[0].height } : {}),
      ...(entries[0]?.channels ? { channels: entries[0].channels, sampleRate: entries[0].sampleRate } : {}),
    };
    result.tracks.push(track);
    if (handler === "vide" && !result.video) {
      result.video = track;
      result.width = track.width ?? 0;
      result.height = track.height ?? 0;
    }
    if (handler === "soun" && !result.audio) result.audio = track;
  }
  result.ok = !!result.video;
  if (!result.ok) result.reason = "no video track";
  return result;
}

/** Convenience for the fixture bench: probe a file on disk. */
export function probeMp4File(path) {
  return probeMp4(readFileSync(path));
}

/** Human-readable codec name for a sample-entry FourCC. */
export function codecName(fourcc) {
  if (/^(avc1|avc3)$/.test(fourcc)) return "H.264/AVC";
  if (/^(hvc1|hev1)$/.test(fourcc)) return "HEVC/H.265";
  if (fourcc === "av01") return "AV1";
  if (fourcc === "vp09") return "VP9";
  if (fourcc === "vp08") return "VP8";
  return "Unknown";
}
