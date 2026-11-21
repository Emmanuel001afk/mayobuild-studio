const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const native = require("../desktop/native-export.cjs");

const ffmpeg = process.env.MAYOCUT_TEST_FFMPEG;
const ffprobe = process.env.MAYOCUT_TEST_FFPROBE;
const adjust = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
const clip = (id, start, end, muted = false) => ({
  id: `${id}${start}`,
  mediaId: id,
  in: start,
  out: end,
  speed: 1,
  reverse: false,
  filter: "none",
  adjust,
  volume: 1,
  muted,
  transitionIn: "none",
  transitionDur: 0,
});
const project = () => ({
  main: [clip("red", 1, 2), clip("blue", 0, 1)],
  tracks: [{ clips: [] }, { clips: [] }],
});

test("native project validation rejects edits it cannot render", () => {
  assert.equal(native.validateProject(project()), 2);
  for (const change of [
    (p) => {
      p.main[0].filter = "bw";
    },
    (p) => {
      p.main[0].speed = 2;
    },
    (p) => {
      p.main[1].transitionIn = "crossfade";
    },
    (p) => {
      p.tracks[0].clips.push({ kind: "text" });
    },
    (p) => {
      p.main[0].adjust.brightness = 50;
    },
  ]) {
    // Each test must have its own adjustment object.
    const p = JSON.parse(JSON.stringify(project()));
    change(p);
    assert.throws(() => native.validateProject(p));
  }
});

test(
  "native export renders real video cuts and synchronized sound",
  { skip: !ffmpeg || !ffprobe, timeout: 120000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mayocut-native-test-"));
    const red = path.join(dir, "red.mp4");
    const blue = path.join(dir, "blue.mp4");
    const out = path.join(dir, "output.mp4");
    try {
      execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=160x90:r=30:d=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        red,
      ]);
      execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:r=30:d=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        blue,
      ]);
      await native.render({
        project: project(),
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [
          { id: "red", data: await fs.readFile(red) },
          { id: "blue", data: await fs.readFile(blue) },
        ],
        destination: out,
        ffmpeg,
        ffprobe,
      });
      const metadata = JSON.parse(
        execFileSync(
          ffprobe,
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,duration,start_time",
            "-of",
            "json",
            out,
          ],
          { encoding: "utf8" },
        ),
      );
      assert.ok(Math.abs(Number(metadata.format.duration) - 2) < 0.12, JSON.stringify(metadata));
      assert.ok(metadata.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264"));
      assert.ok(metadata.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac"));
      const pixel = (at) =>
        execFileSync(ffmpeg, [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          String(at),
          "-i",
          out,
          "-frames:v",
          "1",
          "-vf",
          "scale=2:2",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ]);
      const first = pixel(0.4),
        second = pixel(1.4);
      assert.ok(first[0] > first[2] + 100, `first frame is not red: ${first}`);
      assert.ok(second[2] > second[0] + 100, `second frame is not blue: ${second}`);
      const pcm = execFileSync(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          out,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "48000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { maxBuffer: 1024 * 1024 },
      );
      const rms = (from, to) => {
        let sum = 0,
          n = 0;
        for (let i = Math.floor(from * 48000); i < Math.floor(to * 48000); i++) {
          const v = pcm.readInt16LE(i * 2);
          sum += v * v;
          n++;
        }
        return Math.sqrt(sum / n);
      };
      assert.ok(rms(0.2, 0.8) > 500, "first clip should have audible tone");
      assert.ok(rms(1.2, 1.8) < 25, "silent source should stay silent");
      const mutedPath = path.join(dir, "muted.mp4");
      const muted = { main: [clip("red", 0.5, 1.5, true)], tracks: [{ clips: [] }] };
      await native.render({
        project: muted,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "red", data: await fs.readFile(red) }],
        destination: mutedPath,
        ffmpeg,
        ffprobe,
      });
      const silentPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        mutedPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      let peak = 0;
      for (let i = 0; i + 1 < silentPcm.length; i += 2)
        peak = Math.max(peak, Math.abs(silentPcm.readInt16LE(i)));
      assert.ok(peak < 25, `muted original audio should be silent, peak ${peak}`);
      const delayed = path.join(dir, "delayed.mp4");
      const delayedOut = path.join(dir, "delayed-out.mp4");
      execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=160x90:r=30:d=2",
        "-itsoffset",
        "0.5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=1.5",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        delayed,
      ]);
      await native.render({
        project: { main: [clip("delayed", 0, 1.5)], tracks: [{ clips: [] }] },
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "delayed", data: await fs.readFile(delayed) }],
        destination: delayedOut,
        ffmpeg,
        ffprobe,
      });
      const delayedPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        delayedOut,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      const audioRms = (data, from, to) => {
        let sum = 0,
          count = 0;
        for (let i = Math.floor(from * 48000); i < Math.floor(to * 48000); i++) {
          const v = data.readInt16LE(i * 2);
          sum += v * v;
          count++;
        }
        return Math.sqrt(sum / count);
      };
      assert.ok(
        audioRms(delayedPcm, 0.1, 0.3) < 25,
        "delayed audio should not shift to the beginning",
      );
      assert.ok(
        audioRms(delayedPcm, 0.7, 1.1) > 500,
        "delayed audio should play at the correct time",
      );
      // A separately extracted audio source can use the same input as the
      // video but must be independently seeked and mixed at its timeline start.
      const mixedPath = path.join(dir, "mixed.mp4");
      const mix = {
        main: [clip("red", 0, 2, true)],
        tracks: [
          {
            id: "t_audio",
            clips: [
              {
                id: "detached",
                kind: "audio",
                mediaId: "red",
                start: 0.5,
                duration: 1,
                sourceOffset: 1,
                fadeIn: 0,
                fadeOut: 0,
                volume: 1,
              },
            ],
          },
        ],
      };
      await native.render({
        project: mix,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "red", data: await fs.readFile(red) }],
        destination: mixedPath,
        ffmpeg,
        ffprobe,
      });
      const mixedPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        mixedPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      assert.ok(audioRms(mixedPcm, 0.1, 0.3) < 25, "detached sound must not start early");
      assert.ok(audioRms(mixedPcm, 0.7, 1.2) > 500, "detached sound should play during its clip");
      assert.ok(audioRms(mixedPcm, 1.7, 1.9) < 25, "detached sound must stop at the clip end");

      // A separate audio file with a quiet first second checks that sourceOffset
      // is applied to the audio, not just to its timeline position.
      const markedAudio = path.join(dir, "marked.wav");
      execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=3",
        "-af",
        "volume=0:enable='lt(t,1)'",
        markedAudio,
      ]);
      const markedOut = path.join(dir, "marked-out.mp4");
      const markedProject = {
        main: [clip("blue", 0, 2)],
        tracks: [
          {
            id: "t_audio",
            clips: [
              {
                id: "marked",
                kind: "audio",
                mediaId: "marked",
                start: 0.5,
                duration: 1,
                sourceOffset: 1,
                fadeIn: 0,
                fadeOut: 0,
                volume: 1,
              },
            ],
          },
        ],
      };
      await native.render({
        project: markedProject,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [
          { id: "blue", data: await fs.readFile(blue) },
          { id: "marked", data: await fs.readFile(markedAudio) },
        ],
        destination: markedOut,
        ffmpeg,
        ffprobe,
      });
      const markedPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        markedOut,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      assert.ok(
        audioRms(markedPcm, 0.1, 0.3) < 25,
        "separate audio starts at its timeline position",
      );
      assert.ok(
        audioRms(markedPcm, 0.8, 1.3) > 500,
        "trimmed audio uses its selected source offset",
      );

      // Muting the detached track must not unmute the original sound.
      mix.tracks[0].muted = true;
      const trackMutedPath = path.join(dir, "track-muted.mp4");
      await native.render({
        project: mix,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "red", data: await fs.readFile(red) }],
        destination: trackMutedPath,
        ffmpeg,
        ffprobe,
      });
      const trackMutedPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        trackMutedPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      assert.ok(
        audioRms(trackMutedPcm, 0.7, 1.2) < 25,
        "muted track and original must both stay silent",
      );

      // Solo makes the original track silent while the soloed track plays.
      mix.main[0].muted = false;
      mix.tracks[0].muted = false;
      mix.tracks[0].solo = true;
      const soloPath = path.join(dir, "solo.mp4");
      await native.render({
        project: mix,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "red", data: await fs.readFile(red) }],
        destination: soloPath,
        ffmpeg,
        ffprobe,
      });
      const soloPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        soloPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      assert.ok(audioRms(soloPcm, 0.1, 0.3) < 25, "solo should mute original audio");
      assert.ok(audioRms(soloPcm, 0.7, 1.2) > 500, "soloed track should remain audible");
      mix.tracks[0].solo = false;

      // Fade lengths longer than the clip still use the specified slope.
      mix.main[0].muted = true;
      mix.tracks[0].clips[0].fadeOut = 2;
      const fadePath = path.join(dir, "long-fade.mp4");
      await native.render({
        project: mix,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "red", data: await fs.readFile(red) }],
        destination: fadePath,
        ffmpeg,
        ffprobe,
      });
      const fadePcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        fadePath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      const baseline = audioRms(mixedPcm, 0.7, 1.2);
      const fadeStart = audioRms(fadePcm, 0.55, 0.65);
      assert.ok(
        fadeStart / baseline > 0.38 && fadeStart / baseline < 0.52,
        `long fade has wrong gain: ${fadeStart / baseline}`,
      );
      mix.tracks[0].clips[0].fadeOut = 0;

      // When an overlay ends, amix must not change the remaining main gain.
      const gainPath = path.join(dir, "gain.mp4");
      mix.main[0].muted = false;
      mix.tracks[0].muted = false;
      mix.tracks[0].clips[0].volume = 0.5;
      await native.render({
        project: mix,
        options: { width: 160, height: 90, fps: 30, kbps: 1000 },
        sources: [{ id: "red", data: await fs.readFile(red) }],
        destination: gainPath,
        ffmpeg,
        ffprobe,
      });
      const gainPcm = execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        gainPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ]);
      const before = audioRms(gainPcm, 0.1, 0.3),
        after = audioRms(gainPcm, 1.7, 1.9);
      assert.ok(
        Math.abs(before - after) / before < 0.08,
        `main gain changed after overlay: ${before} vs ${after}`,
      );

      const invalidOutput = path.join(dir, "invalid.mp4");
      const bad = JSON.parse(JSON.stringify(project()));
      bad.main[0].effect = "shake";
      await assert.rejects(
        native.render({
          project: bad,
          options: { width: 160, height: 90, fps: 30, kbps: 1000 },
          sources: [],
          destination: invalidOutput,
          ffmpeg,
          ffprobe,
        }),
      );
      await assert.rejects(fs.stat(invalidOutput), { code: "ENOENT" });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
