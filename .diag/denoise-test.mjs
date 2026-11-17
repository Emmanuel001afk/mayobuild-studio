import { encodeWavMono, analyzeMono } from './denoise.bundle.mjs';
import assert from 'node:assert';

// --- WAV encoder checks ---
const rate = 44100;
const n = 96000; // 2 s
const s = new Float32Array(n);
for (let i = 0; i < n; i++) s[i] = Math.sin(2 * Math.PI * 440 * i / rate) * 0.8;
const wav = encodeWavMono(s, rate);
assert.equal(wav.size, 44 + n * 2, 'wav size');
const ab = await wav.arrayBuffer();
const v = new DataView(ab);
const u32 = (o) => v.getUint32(o, true);
const u16 = (o) => v.getUint16(o, true);
const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o+1), v.getUint8(o+2), v.getUint8(o+3));
assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
assert.equal(u32(4), 36 + n*2); assert.equal(u16(20), 1); assert.equal(u16(22), 1);
assert.equal(u32(24), rate); assert.equal(u32(28), rate*2); assert.equal(u16(32), 2); assert.equal(u16(34), 16);
assert.equal(u32(40), n*2);
// sample 1: 0.8*sin(0)=0 -> 0
assert.equal(v.getInt16(44, true), 0);
// sample at t=1/(4*440) quarter wave: sin=1 -> 0.8 -> 26213
const q = Math.round(rate/1760);
const expected = Math.round(0.8*Math.sin(2*Math.PI*440*q/rate)*32767);
assert.ok(Math.abs(v.getInt16(44+2*q, true) - expected) <= 1, `sample value: got ${v.getInt16(44+2*q,true)} want ${expected}`);
// clipping: input > 1 clamps
const c = encodeWavMono(new Float32Array([2.5, -3, 0.5]), 8000);
const cv = new DataView(await c.arrayBuffer());
assert.equal(cv.getInt16(44, true), 32767);
assert.equal(cv.getInt16(46, true), -32767);
assert.ok(Math.abs(cv.getInt16(48, true) - Math.round(0.5*32767)) <= 1);

// --- analyze checks ---
const a = analyzeMono(s);
assert.equal(a.wave.length, 128);
assert.ok(Math.max(...a.wave) > 0.99, 'peak bin normalized ~1');
assert.ok(a.rms > 0.3 && a.rms < 0.7, `rms sane: ${a.rms}`);
const silent = analyzeMono(new Float32Array(1000));
assert.ok(silent.rms === 0, 'silent rms 0');

console.log('denoise pure-logic: ALL PASS');
