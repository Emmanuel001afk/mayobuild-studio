import { Rnnoise } from '@shiguredo/rnnoise-wasm';
const rn = await Rnnoise.load();
console.log('frameSize', rn.frameSize);
const st = rn.createDenoiseState();
// simulate 1s of 48k sine (a "voice"-like signal) + noise
const N = 48000;
const f = new Float32Array(N);
for (let i=0;i<N;i++){ f[i] = 0.5*Math.sin(2*Math.PI*220*i/48000) + 0.2*(Math.random()*2-1); }
const fs = st.frameSize;
let outPeak=0, inPeak=0, vadSum=0, n=0;
for (let off=0; off+fs<=N; off+=fs){
  const frame = f.subarray(off, off+fs);
  for (let i=0;i<fs;i++) inPeak=Math.max(inPeak,Math.abs(frame[i]));
  const vad = st.processFrame(frame);
  for (let i=0;i<fs;i++) outPeak=Math.max(outPeak,Math.abs(frame[i]));
  vadSum+=vad; n++;
}
console.log('inPeak',inPeak.toFixed(3),'outPeak',outPeak.toFixed(3),'avgVad',(vadSum/n).toFixed(3),'frames',n);
st.destroy();
