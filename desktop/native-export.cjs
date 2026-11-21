// Limited, local-only native export for simple MayoCut timelines.
// No shell is used and input paths are created by this module, never the renderer.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_BYTES = 512 * 1024 * 1024;
const MAX_CLIPS = 64;
const MAX_DURATION = 60 * 60;

function validateProject(project) {
  if (!project || !Array.isArray(project.main) || !Array.isArray(project.tracks))
    throw new Error("Invalid project");
  if (!project.main.length || project.main.length > MAX_CLIPS)
    throw new Error("Native export supports 1–64 video clips");
  if (project.tracks.some((t) => !t || !Array.isArray(t.clips))) throw new Error("Invalid tracks");
  const master = project.masterGain ?? 1;
  if (!Number.isFinite(master) || master < 0 || master > 2) throw new Error("Invalid master gain");
  let total = 0;
  for (const c of project.main) {
    if (
      !c ||
      typeof c.mediaId !== "string" ||
      c.mediaId.length > 200 ||
      !c.mediaId ||
      !Number.isFinite(c.in) ||
      !Number.isFinite(c.out) ||
      c.in < 0 ||
      c.out <= c.in
    )
      throw new Error("Invalid clip times or source");
    total += c.out - c.in;
    if (
      c.speed !== 1 ||
      c.rampTo != null ||
      c.curve?.length ||
      c.reverse ||
      c.freeze ||
      (c.transitionIn && c.transitionIn !== "none") ||
      c.lut ||
      (c.filter && c.filter !== "none") ||
      (c.effect && c.effect !== "none") ||
      c.keyframes?.length ||
      c.flipX ||
      c.flipY ||
      c.voice ||
      (c.fit && c.fit !== "cover")
    )
      throw new Error(
        "Native export currently supports only normal-speed cuts without effects, transitions or framing changes. Use the standard exporter.",
      );
    const allowed = new Set([
      "id",
      "mediaId",
      "in",
      "out",
      "speed",
      "rampTo",
      "curve",
      "reverse",
      "freeze",
      "filter",
      "lut",
      "effect",
      "adjust",
      "volume",
      "muted",
      "transitionIn",
      "transitionDur",
      "keyframes",
      "fit",
      "flipX",
      "flipY",
      "voice",
    ]);
    if (Object.keys(c).some((k) => !allowed.has(k)))
      throw new Error(
        "Native export encountered unsupported clip properties. Use the standard exporter.",
      );
    const a = c.adjust;
    if (
      a &&
      Object.keys(a).some(
        (k) =>
          ![
            "brightness",
            "contrast",
            "saturation",
            "hue",
            "temperature",
            "tint",
            "fade",
            "sharpen",
            "vignette",
            "splitTone",
          ].includes(k),
      )
    )
      throw new Error("Native export encountered unsupported color adjustments.");
    if (
      !a ||
      a.brightness !== 100 ||
      a.contrast !== 100 ||
      a.saturation !== 100 ||
      a.hue !== 0 ||
      ["temperature", "tint", "fade", "sharpen", "vignette", "splitTone"].some(
        (k) => (a[k] ?? 0) !== 0,
      )
    )
      throw new Error(
        "Native export does not yet support color adjustments. Use the standard exporter.",
      );
    if (!Number.isFinite(c.volume) || c.volume < 0 || c.volume > 1 || typeof c.muted !== "boolean")
      throw new Error("Invalid clip volume");
  }
  if (total > MAX_DURATION) throw new Error("Native export is limited to one hour");
  let audioCount = 0;
  const audioKeys = new Set([
    "id",
    "kind",
    "mediaId",
    "start",
    "duration",
    "sourceOffset",
    "volume",
    "fadeIn",
    "fadeOut",
    "fx",
    "duck",
  ]);
  for (const track of project.tracks)
    for (const c of track.clips) {
      if (!c || c.kind !== "audio")
        throw new Error(
          "Native export does not yet support text or visual overlays. Use the standard exporter.",
        );
      if (++audioCount > MAX_CLIPS) throw new Error("Native export supports up to 64 audio clips");
      if (
        Object.keys(c).some((k) => !audioKeys.has(k)) ||
        (c.duck ?? 0) !== 0 ||
        (c.fx && Object.values(c.fx).some((v) => v !== 0 && v != null))
      )
        throw new Error(
          "Native export does not yet support audio effects or ducking. Use the standard exporter.",
        );
      if (
        typeof c.mediaId !== "string" ||
        !c.mediaId ||
        c.mediaId.length > 200 ||
        !Number.isFinite(c.start) ||
        c.start < 0 ||
        !Number.isFinite(c.duration) ||
        c.duration <= 0 ||
        !Number.isFinite(c.sourceOffset ?? 0) ||
        (c.sourceOffset ?? 0) < 0 ||
        !Number.isFinite(c.volume ?? 1) ||
        (c.volume ?? 1) < 0 ||
        (c.volume ?? 1) > 1 ||
        !Number.isFinite(c.fadeIn ?? 0.15) ||
        (c.fadeIn ?? 0.15) < 0 ||
        !Number.isFinite(c.fadeOut ?? 0.15) ||
        (c.fadeOut ?? 0.15) < 0
      )
        throw new Error("Invalid audio clip settings");
      if (c.start + c.duration > total + 1e-6)
        throw new Error(
          "Native export does not yet support audio extending beyond the video. Trim the audio or use the standard exporter.",
        );
    }
  return total;
}

function validateOptions(opts) {
  if (
    !opts ||
    !Number.isInteger(opts.width) ||
    !Number.isInteger(opts.height) ||
    opts.width < 16 ||
    opts.height < 16 ||
    opts.width > 4096 ||
    opts.height > 4096 ||
    opts.width % 2 ||
    opts.height % 2 ||
    ![24, 30, 60].includes(opts.fps) ||
    !Number.isInteger(opts.kbps) ||
    opts.kbps < 500 ||
    opts.kbps > 50000
  )
    throw new Error("Invalid native export settings");
}

function run(command, args, { timeout = 30000, maxOutput = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      finished = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Native media process timed out"));
    }, timeout);
    const finish = (err, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(result);
    };
    child.stdout.on("data", (data) => {
      stdout = (stdout + data).slice(-maxOutput);
    });
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-maxOutput);
    });
    child.on("error", (err) =>
      finish(new Error(`Could not start ${path.basename(command)}: ${err.message}`)),
    );
    child.on("close", (code) =>
      code === 0
        ? finish(null, stdout)
        : finish(new Error(`Native media process failed (${code}): ${stderr.slice(-1200)}`)),
    );
  });
}

async function available(ffmpeg = "ffmpeg", ffprobe = "ffprobe") {
  try {
    await Promise.all([
      run(ffmpeg, ["-version"], { timeout: 5000 }),
      run(ffprobe, ["-version"], { timeout: 5000 }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function render({
  project,
  options,
  sources,
  destination,
  ffmpeg = "ffmpeg",
  ffprobe = "ffprobe",
}) {
  const duration = validateProject(project);
  validateOptions(options);
  if (!Array.isArray(sources) || typeof destination !== "string" || !destination)
    throw new Error("Invalid export request");
  const audioClips = project.tracks.flatMap((track) =>
    track.clips.map((clip) => ({ track, clip })),
  );
  const required = new Set([
    ...project.main.map((c) => c.mediaId),
    ...audioClips.map(({ clip }) => clip.mediaId),
  ]);
  if (sources.length !== required.size) throw new Error("Missing or duplicate source media");
  const map = new Map();
  let bytes = 0;
  for (const source of sources) {
    if (
      !source ||
      !required.has(source.id) ||
      map.has(source.id) ||
      !(source.data instanceof Uint8Array)
    )
      throw new Error("Invalid source media");
    bytes += source.data.byteLength;
    if (!source.data.byteLength || bytes > MAX_BYTES)
      throw new Error("Native export supports up to 512 MB of imported source media");
    map.set(source.id, source.data);
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mayocut-native-"));
  try {
    const files = new Map(),
      probes = new Map();
    let i = 0;
    for (const [id, data] of map) {
      const file = path.join(dir, `source-${i++}.bin`);
      await fs.writeFile(file, data, { mode: 0o600 });
      const raw = await run(ffprobe, [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration:stream=codec_type,duration",
        "-of",
        "json",
        file,
      ]);
      let probe;
      try {
        probe = JSON.parse(raw);
      } catch {
        throw new Error("Could not inspect the imported video");
      }
      const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
      const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
      if (project.main.some((clip) => clip.mediaId === id) && !videoStream)
        throw new Error("A main-track source has no video stream");
      if (audioClips.some(({ clip }) => clip.mediaId === id) && !audioStream)
        throw new Error("An audio-track source has no audio stream");
      const sourceDuration = Number(videoStream?.duration || probe.format?.duration);
      if (videoStream && (!Number.isFinite(sourceDuration) || sourceDuration <= 0))
        throw new Error("Could not determine video duration");
      files.set(id, file);
      const audioDuration = Number(audioStream?.duration || probe.format?.duration);
      probes.set(id, { audio: !!audioStream, duration: sourceDuration, audioDuration });
    }
    const args = ["-hide_banner", "-loglevel", "error", "-y"];
    for (const c of project.main) {
      if (c.out > probes.get(c.mediaId).duration + 0.1)
        throw new Error("A clip extends beyond its source video");
      args.push("-protocol_whitelist", "file,pipe", "-i", files.get(c.mediaId));
    }
    for (const { clip } of audioClips) {
      const length = probes.get(clip.mediaId).audioDuration;
      if (Number.isFinite(length) && length > 0 && (clip.sourceOffset ?? 0) >= length)
        throw new Error(
          "An audio clip starts past the end of its source. Adjust the trim or use the standard exporter.",
        );
      args.push("-protocol_whitelist", "file,pipe", "-i", files.get(clip.mediaId));
    }
    const filters = [];
    const anySolo = project.tracks.some((track) => track.solo);
    const muteMain = project.tracks.some((track) => track.solo && track.clips.length > 0);
    project.main.forEach((c, index) => {
      const len = c.out - c.in;
      const { width, height } = options;
      filters.push(
        `[${index}:v:0]trim=start=${c.in}:end=${c.out},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p[v${index}]`,
      );
      const source = probes.get(c.mediaId);
      const hasAudioAtCut = !Number.isFinite(source.audioDuration) || c.in < source.audioDuration;
      if (source.audio && hasAudioAtCut && !c.muted && c.volume > 0 && !muteMain) {
        filters.push(
          `[${index}:a:0]atrim=start=${c.in}:end=${c.out},asetpts=PTS-${c.in}/TB,aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${c.volume},apad,atrim=duration=${len}[a${index}]`,
        );
      } else {
        filters.push(
          `anullsrc=r=48000:cl=stereo,atrim=duration=${len},asetpts=PTS-STARTPTS[a${index}]`,
        );
      }
    });
    filters.push(
      `${project.main.map((_, index) => `[v${index}][a${index}]`).join("")}concat=n=${project.main.length}:v=1:a=1[vout][mainaudio]`,
    );
    // The old FFmpeg shipped in some distributions has no amix normalize=0.
    // Pad each stream to the full output duration and undo the mixer's fixed
    // normalization. This preserves gains even while individual clips end.
    const audible = audioClips.filter(
      ({ track, clip }) => !track.muted && (!anySolo || track.solo) && (clip.volume ?? 1) > 0,
    );
    const mixLabels = ["[mainaudio]"];
    audioClips.forEach(({ track, clip: c }, index) => {
      if (!audible.some((a) => a.track === track && a.clip === c)) return;
      const offset = c.sourceOffset ?? 0;
      const input = project.main.length + index;
      const fadeIn = c.fadeIn ?? 0.15,
        fadeOut = c.fadeOut ?? 0.15;
      const fadeOutDuration = Math.min(fadeOut, c.duration);
      const fadeOutGain = fadeOut > c.duration ? c.duration / fadeOut : 1;
      const fades =
        (fadeIn > 0 ? `,afade=t=in:st=0:d=${fadeIn}` : "") +
        (fadeOut > 0
          ? `,afade=t=out:st=${Math.max(0, c.duration - fadeOut)}:d=${fadeOutDuration}`
          : "");
      const delay = Math.round(c.start * 1000);
      filters.push(
        `[${input}:a:0]atrim=start=${offset}:end=${offset + c.duration},asetpts=PTS-${offset}/TB,aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${c.duration}${fades},volume=${(c.volume ?? 1) * fadeOutGain},adelay=${delay}|${delay},apad,atrim=duration=${duration}[mix${index}]`,
      );
      mixLabels.push(`[mix${index}]`);
    });
    if (mixLabels.length > 1) {
      filters.push(
        `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,volume=${mixLabels.length * (project.masterGain ?? 1)}[aout]`,
      );
    } else filters.push(`[mainaudio]volume=${project.masterGain ?? 1}[aout]`);
    const output = path.join(dir, "result.mp4");
    args.push(
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-r",
      String(options.fps),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      `${options.kbps}k`,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      output,
    );
    await run(ffmpeg, args, { timeout: Math.max(120000, Math.min(7200000, duration * 10000)) });
    const st = await fs.stat(output);
    if (st.size < 1000) throw new Error("Native export produced no video");
    // No partial destination on rendering failure. Copy only after success.
    await fs.copyFile(output, destination);
    return { size: st.size, duration };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { available, render, validateProject, validateOptions };
