// Experimental desktop-only proxy encoder. Not wired to IPC or preview.
// Accepts bytes, not paths or commands from a renderer; all paths are temporary.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const MAX_INPUT = 512 * 1024 * 1024;
const MAX_OUTPUT = 512 * 1024 * 1024;
const MAX_DURATION = 1800;

async function probe(file, ffprobe, signal) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
    { timeout: 30000, maxBuffer: 1024 * 1024, signal, windowsHide: true });
  const info = JSON.parse(stdout);
  const video = info.streams?.filter(s => s.codec_type === 'video') ?? [];
  const audio = info.streams?.filter(s => s.codec_type === 'audio') ?? [];
  const duration = Number(info.format?.duration);
  if (video.length !== 1 || audio.length > 1 || !Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION)
    throw new Error('Proxy supports one video, at most one audio stream and a known duration of up to 30 minutes');
  if (!Number.isFinite(Number(video[0].width)) || !Number.isFinite(Number(video[0].height)) || video[0].width < 2 || video[0].height < 2)
    throw new Error('Invalid video dimensions');
  if (audio[0] && (![1, 2].includes(audio[0].channels) || !Number(audio[0].sample_rate)))
    throw new Error('Unsupported audio format');
  return { video: video[0], audio: audio[0], duration };
}

function validate(source, output) {
  const tolerance = 0.12;
  if (Math.abs(source.duration - output.duration) > tolerance) throw new Error('Proxy duration differs from source');
  if (!!source.audio !== !!output.audio) throw new Error('Proxy audio stream differs from source');
  if (source.audio && (source.audio.channels !== output.audio.channels || source.audio.sample_rate !== output.audio.sample_rate))
    throw new Error('Proxy audio format differs from source');
  // Reject unknown or non-zero source offsets rather than silently changing sync.
  for (const [a, b] of [[source.video, output.video], ...(source.audio ? [[source.audio, output.audio]] : [])]) {
    const aStart = Number(a.start_time), bStart = Number(b.start_time);
    if (!Number.isFinite(aStart) || !Number.isFinite(bStart) || Math.abs(aStart - bStart) > tolerance)
      throw new Error('Proxy stream start differs from source');
    const aDuration = Number(a.duration), bDuration = Number(b.duration);
    if (!Number.isFinite(aDuration) || !Number.isFinite(bDuration) || aDuration <= 0 || bDuration <= 0 || Math.abs(aDuration - bDuration) > tolerance)
      throw new Error('Proxy stream duration differs or is unavailable');
  }
}

async function buildNativeProxy({ input, ffmpeg, ffprobe, signal }) {
  if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > MAX_INPUT)
    throw new Error('Proxy input must be a non-empty video under 512 MB');
  if (typeof ffmpeg !== 'string' || typeof ffprobe !== 'string') throw new Error('Media tools unavailable');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mayocut-proxy-'));
  const sourcePath = path.join(dir, 'source');
  const outputPath = path.join(dir, 'proxy.mp4');
  try {
    await fs.writeFile(sourcePath, input, { signal });
    const source = await probe(sourcePath, ffprobe, signal);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', sourcePath,
      '-map', '0:v:0', ...(source.audio ? ['-map', '0:a:0'] : ['-an']),
      '-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p',
      '-threads', '2', ...(source.audio ? ['-c:a', 'aac', '-b:a', '160k', '-ar', source.audio.sample_rate, '-ac', String(source.audio.channels)] : []),
      '-movflags', '+faststart', outputPath];
    await run(ffmpeg, args, { timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024, signal, windowsHide: true });
    const output = await probe(outputPath, ffprobe, signal);
    validate(source, output);
    const stat = await fs.stat(outputPath);
    if (stat.size < 1024 || stat.size > MAX_OUTPUT) throw new Error('Proxy output has an invalid size');
    const data = await fs.readFile(outputPath, { signal });
    return { data, source, output };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
module.exports = { buildNativeProxy, validate };
