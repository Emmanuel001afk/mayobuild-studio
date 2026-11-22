const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildNativeProxy, validate } = require('../desktop/native-proxy.cjs');
const ffmpeg = process.env.MAYOCUT_TEST_FFMPEG;
const ffprobe = process.env.MAYOCUT_TEST_FFPROBE;

test('proxy validation rejects missing audio, changed formats and time shifts', () => {
  const source = { duration: 2, video: { start_time: '0', duration: '2' }, audio: { start_time: '0', duration: '2', channels: 2, sample_rate: '48000' } };
  assert.doesNotThrow(() => validate(source, source));
  assert.throws(() => validate(source, { ...source, audio: undefined }), /audio/);
  assert.throws(() => validate(source, { ...source, duration: 1.5 }), /duration/);
  assert.throws(() => validate(source, { ...source, audio: { ...source.audio, start_time: '0.5' } }), /start/);
  assert.throws(() => validate(source, { ...source, audio: { ...source.audio, channels: 1 } }), /format/);
  assert.throws(() => validate(source, { ...source, audio: { ...source.audio, duration: '0.4' } }), /duration/);
});

test('native proxy preserves video duration and delayed audio, including silent video', { skip: !ffmpeg || !ffprobe, timeout: 120000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mayocut-proxy-test-'));
  try {
    const source = path.join(dir, 'source.mp4');
    execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-y', '-f','lavfi','-i','color=c=red:s=320x240:r=25:d=1', '-f','lavfi','-i','color=c=blue:s=320x240:r=25:d=1', '-f','lavfi','-i','sine=frequency=1000:sample_rate=48000:duration=1.5', '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a]adelay=500|500[a]', '-map','[v]','-map','[a]', '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-t','2', source]);
    const result = await buildNativeProxy({ input: await fs.readFile(source), ffmpeg, ffprobe });
    const proxy = path.join(dir, 'proxy.mp4');
    await fs.writeFile(proxy, result.data);
    const pixel = (time) => {
      const frame = execFileSync(ffmpeg, ['-v','error','-ss',String(time),'-i',proxy,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
      assert.ok(frame.length >= 3, 'video frame exists');
      return frame.subarray(0, 3);
    };
    const early = pixel(0.3), late = pixel(1.4);
    assert.ok(early[0] > early[2] + 100, 'first shot remains red');
    assert.ok(late[2] > late[0] + 100, 'second shot remains blue');
    const pcm = execFileSync(ffmpeg, ['-v','error','-i',proxy,'-map','0:a:0','-f','s16le','-ac','1','-ar','48000','-']);
    const rms = (start, end) => {
      let sum = 0, n = 0;
      for (let i = start * 48000; i < end * 48000 && i * 2 + 1 < pcm.length; i++) { const v = pcm.readInt16LE(i * 2) / 32768; sum += v * v; n++; }
      return Math.sqrt(sum / n);
    };
    assert.ok(rms(0.1, 0.35) < 0.005, 'audio begins silent');
    assert.ok(rms(0.7, 1.3) > 0.02, 'tone remains audible after delay');
    assert.ok(Math.abs(result.output.duration - 2) < 0.12);
    const silent = path.join(dir, 'silent.mp4');
    execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=320x240:r=25:d=1','-c:v','libx264','-pix_fmt','yuv420p',silent]);
    const noAudio = await buildNativeProxy({ input: await fs.readFile(silent), ffmpeg, ffprobe });
    assert.equal(noAudio.output.audio, undefined);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('proxy input validation and cancellation fail closed', async () => {
  await assert.rejects(buildNativeProxy({ input: Buffer.alloc(0), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }), /non-empty/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(buildNativeProxy({ input: Buffer.from('not video'), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', signal: controller.signal }), { name: 'AbortError' });
});
