// MayoCut TTS worker — sherpa-onnx (k2-fsa/sherpa-onnx, MIT) offline VITS TTS.
//
// Mirrors k2-fsa's own browser demo (wasm/tts/sherpa-onnx-tts.worker.js):
//   - wasm.js  = the emscripten runtime (global `Module` = module factory)
//   - glue.js  = the TTS glue (global `createOfflineTts(Module, config)`)
// The main thread fetches + caches the model files itself (IndexedDB) and
// hands the bytes over; this worker writes them into the runtime's MEMFS and
// runs the VITS model (piper en_US-amy-low, lexicon frontend) fully offline.
//
// Protocol:
//   -> {type:"hello", files: [[path, ArrayBuffer, size], ...]}
//   <- {type:"status", status: string}
//   <- {type:"ready", sampleRate, numSpeakers}
//   -> {type:"generate", seq, text, speed}
//   <- {type:"audio", seq, samples, sampleRate}   (samples transferred)
//   <- {type:"error", seq?, message}

let rt = null;
let tts = null;
let bootPromise = null;

function fail(message, seq) {
  self.postMessage({ type: "error", seq, message });
}

function ensureRuntime() {
  if (!bootPromise) {
    bootPromise = (async () => {
      const hooks = {
        setStatus: (s) => {
          if (typeof s === "string" && s) self.postMessage({ type: "status", status: s });
        },
      };
      // The factory (global `Module` after importScripts) takes the user
      // Module object, exactly like the npm index.js does:
      //   require('./sherpa-onnx-wasm-nodejs.js')(wasmModule)
      const m = await Module(hooks);
      rt = m;
      return m;
    })();
  }
  return bootPromise;
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === "hello") {
      self.postMessage({ type: "status", status: "Warming up the TTS runtime…" });
      await ensureRuntime();
      self.postMessage({ type: "status", status: "Writing model files…" });
      rt.FS.mkdirPaths("/tts");
      for (const [path, source, size] of m.files) {
        if (!source) throw new Error("missing bytes for " + path);
        const bytes = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
        if (size && bytes.byteLength !== size) {
          throw new Error(
            "size mismatch for " + path + ": got " + bytes.byteLength + " want " + size,
          );
        }
        rt.FS.writeFile(path, bytes);
        self.postMessage({ type: "status", status: "Loaded " + path.split("/").pop() });
      }
      self.postMessage({ type: "status", status: "Initializing the VITS model…" });
      // Explicit config (same shape as k2-fsa's nodejs-examples): VITS +
      // lexicon frontend, single-threaded CPU. Paths point into MEMFS.
      tts = createOfflineTts(rt, {
        offlineTtsModelConfig: {
          offlineTtsVitsModelConfig: {
            model: "/tts/en_US-amy-low.onnx",
            lexicon: "/tts/lexicon-en-us.txt",
            tokens: "/tts/tokens.txt",
            noiseScale: 0.667,
            noiseScaleW: 0.8,
            lengthScale: 1.0,
          },
          numThreads: 1,
          debug: 0,
          provider: "cpu",
        },
        maxNumSentences: 8,
      });
      if (!tts) throw new Error("TTS model init returned nothing");
      self.postMessage({
        type: "ready",
        sampleRate: tts.sampleRate,
        numSpeakers: tts.numSpeakers,
      });
      return;
    }

    if (m.type === "generate") {
      if (!tts) throw new Error("model not loaded (send hello first)");
      const { seq, text, speed } = m;
      if (!text || !text.trim()) throw new Error("empty text");
      self.postMessage({ type: "status", status: "Generating speech…" });
      const audio = tts.generate({
        text: text,
        sid: 0,
        speed: typeof speed === "number" && speed > 0 ? speed : 1.0,
      });
      if (!audio || !audio.samples || audio.samples.length === 0) {
        throw new Error("generation produced no audio");
      }
      self.postMessage(
        { type: "audio", seq, samples: audio.samples, sampleRate: audio.sampleRate },
        [audio.samples.buffer],
      );
      return;
    }

    throw new Error("unknown message type: " + m.type);
  } catch (err) {
    fail(err && err.message ? err.message : String(err), m.seq);
  }
};
