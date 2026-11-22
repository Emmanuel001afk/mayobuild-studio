var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/omggif/omggif.js
var require_omggif = __commonJS({
  "node_modules/omggif/omggif.js"(exports) {
    "use strict";
    function GifWriter(buf, width, height, gopts) {
      var p = 0;
      var gopts = gopts === void 0 ? {} : gopts;
      var loop_count = gopts.loop === void 0 ? null : gopts.loop;
      var global_palette = gopts.palette === void 0 ? null : gopts.palette;
      if (width <= 0 || height <= 0 || width > 65535 || height > 65535)
        throw new Error("Width/Height invalid.");
      function check_palette_and_num_colors(palette) {
        var num_colors = palette.length;
        if (num_colors < 2 || num_colors > 256 || num_colors & num_colors - 1) {
          throw new Error(
            "Invalid code/color length, must be power of 2 and 2 .. 256."
          );
        }
        return num_colors;
      }
      buf[p++] = 71;
      buf[p++] = 73;
      buf[p++] = 70;
      buf[p++] = 56;
      buf[p++] = 57;
      buf[p++] = 97;
      var gp_num_colors_pow2 = 0;
      var background = 0;
      if (global_palette !== null) {
        var gp_num_colors = check_palette_and_num_colors(global_palette);
        while (gp_num_colors >>= 1) ++gp_num_colors_pow2;
        gp_num_colors = 1 << gp_num_colors_pow2;
        --gp_num_colors_pow2;
        if (gopts.background !== void 0) {
          background = gopts.background;
          if (background >= gp_num_colors)
            throw new Error("Background index out of range.");
          if (background === 0)
            throw new Error("Background index explicitly passed as 0.");
        }
      }
      buf[p++] = width & 255;
      buf[p++] = width >> 8 & 255;
      buf[p++] = height & 255;
      buf[p++] = height >> 8 & 255;
      buf[p++] = (global_palette !== null ? 128 : 0) | // Global Color Table Flag.
      gp_num_colors_pow2;
      buf[p++] = background;
      buf[p++] = 0;
      if (global_palette !== null) {
        for (var i = 0, il = global_palette.length; i < il; ++i) {
          var rgb = global_palette[i];
          buf[p++] = rgb >> 16 & 255;
          buf[p++] = rgb >> 8 & 255;
          buf[p++] = rgb & 255;
        }
      }
      if (loop_count !== null) {
        if (loop_count < 0 || loop_count > 65535)
          throw new Error("Loop count invalid.");
        buf[p++] = 33;
        buf[p++] = 255;
        buf[p++] = 11;
        buf[p++] = 78;
        buf[p++] = 69;
        buf[p++] = 84;
        buf[p++] = 83;
        buf[p++] = 67;
        buf[p++] = 65;
        buf[p++] = 80;
        buf[p++] = 69;
        buf[p++] = 50;
        buf[p++] = 46;
        buf[p++] = 48;
        buf[p++] = 3;
        buf[p++] = 1;
        buf[p++] = loop_count & 255;
        buf[p++] = loop_count >> 8 & 255;
        buf[p++] = 0;
      }
      var ended = false;
      this.addFrame = function(x, y, w, h, indexed_pixels, opts) {
        if (ended === true) {
          --p;
          ended = false;
        }
        opts = opts === void 0 ? {} : opts;
        if (x < 0 || y < 0 || x > 65535 || y > 65535)
          throw new Error("x/y invalid.");
        if (w <= 0 || h <= 0 || w > 65535 || h > 65535)
          throw new Error("Width/Height invalid.");
        if (indexed_pixels.length < w * h)
          throw new Error("Not enough pixels for the frame size.");
        var using_local_palette = true;
        var palette = opts.palette;
        if (palette === void 0 || palette === null) {
          using_local_palette = false;
          palette = global_palette;
        }
        if (palette === void 0 || palette === null)
          throw new Error("Must supply either a local or global palette.");
        var num_colors = check_palette_and_num_colors(palette);
        var min_code_size = 0;
        while (num_colors >>= 1) ++min_code_size;
        num_colors = 1 << min_code_size;
        var delay = opts.delay === void 0 ? 0 : opts.delay;
        var disposal = opts.disposal === void 0 ? 0 : opts.disposal;
        if (disposal < 0 || disposal > 3)
          throw new Error("Disposal out of range.");
        var use_transparency = false;
        var transparent_index = 0;
        if (opts.transparent !== void 0 && opts.transparent !== null) {
          use_transparency = true;
          transparent_index = opts.transparent;
          if (transparent_index < 0 || transparent_index >= num_colors)
            throw new Error("Transparent color index.");
        }
        if (disposal !== 0 || use_transparency || delay !== 0) {
          buf[p++] = 33;
          buf[p++] = 249;
          buf[p++] = 4;
          buf[p++] = disposal << 2 | (use_transparency === true ? 1 : 0);
          buf[p++] = delay & 255;
          buf[p++] = delay >> 8 & 255;
          buf[p++] = transparent_index;
          buf[p++] = 0;
        }
        buf[p++] = 44;
        buf[p++] = x & 255;
        buf[p++] = x >> 8 & 255;
        buf[p++] = y & 255;
        buf[p++] = y >> 8 & 255;
        buf[p++] = w & 255;
        buf[p++] = w >> 8 & 255;
        buf[p++] = h & 255;
        buf[p++] = h >> 8 & 255;
        buf[p++] = using_local_palette === true ? 128 | min_code_size - 1 : 0;
        if (using_local_palette === true) {
          for (var i2 = 0, il2 = palette.length; i2 < il2; ++i2) {
            var rgb2 = palette[i2];
            buf[p++] = rgb2 >> 16 & 255;
            buf[p++] = rgb2 >> 8 & 255;
            buf[p++] = rgb2 & 255;
          }
        }
        p = GifWriterOutputLZWCodeStream(
          buf,
          p,
          min_code_size < 2 ? 2 : min_code_size,
          indexed_pixels
        );
        return p;
      };
      this.end = function() {
        if (ended === false) {
          buf[p++] = 59;
          ended = true;
        }
        return p;
      };
      this.getOutputBuffer = function() {
        return buf;
      };
      this.setOutputBuffer = function(v) {
        buf = v;
      };
      this.getOutputBufferPosition = function() {
        return p;
      };
      this.setOutputBufferPosition = function(v) {
        p = v;
      };
    }
    function GifWriterOutputLZWCodeStream(buf, p, min_code_size, index_stream) {
      buf[p++] = min_code_size;
      var cur_subblock = p++;
      var clear_code = 1 << min_code_size;
      var code_mask = clear_code - 1;
      var eoi_code = clear_code + 1;
      var next_code = eoi_code + 1;
      var cur_code_size = min_code_size + 1;
      var cur_shift = 0;
      var cur = 0;
      function emit_bytes_to_buffer(bit_block_size) {
        while (cur_shift >= bit_block_size) {
          buf[p++] = cur & 255;
          cur >>= 8;
          cur_shift -= 8;
          if (p === cur_subblock + 256) {
            buf[cur_subblock] = 255;
            cur_subblock = p++;
          }
        }
      }
      function emit_code(c) {
        cur |= c << cur_shift;
        cur_shift += cur_code_size;
        emit_bytes_to_buffer(8);
      }
      var ib_code = index_stream[0] & code_mask;
      var code_table = {};
      emit_code(clear_code);
      for (var i = 1, il = index_stream.length; i < il; ++i) {
        var k = index_stream[i] & code_mask;
        var cur_key = ib_code << 8 | k;
        var cur_code = code_table[cur_key];
        if (cur_code === void 0) {
          cur |= ib_code << cur_shift;
          cur_shift += cur_code_size;
          while (cur_shift >= 8) {
            buf[p++] = cur & 255;
            cur >>= 8;
            cur_shift -= 8;
            if (p === cur_subblock + 256) {
              buf[cur_subblock] = 255;
              cur_subblock = p++;
            }
          }
          if (next_code === 4096) {
            emit_code(clear_code);
            next_code = eoi_code + 1;
            cur_code_size = min_code_size + 1;
            code_table = {};
          } else {
            if (next_code >= 1 << cur_code_size) ++cur_code_size;
            code_table[cur_key] = next_code++;
          }
          ib_code = k;
        } else {
          ib_code = cur_code;
        }
      }
      emit_code(ib_code);
      emit_code(eoi_code);
      emit_bytes_to_buffer(1);
      if (cur_subblock + 1 === p) {
        buf[cur_subblock] = 0;
      } else {
        buf[cur_subblock] = p - cur_subblock - 1;
        buf[p++] = 0;
      }
      return p;
    }
    function GifReader2(buf) {
      var p = 0;
      if (buf[p++] !== 71 || buf[p++] !== 73 || buf[p++] !== 70 || buf[p++] !== 56 || (buf[p++] + 1 & 253) !== 56 || buf[p++] !== 97) {
        throw new Error("Invalid GIF 87a/89a header.");
      }
      var width = buf[p++] | buf[p++] << 8;
      var height = buf[p++] | buf[p++] << 8;
      var pf0 = buf[p++];
      var global_palette_flag = pf0 >> 7;
      var num_global_colors_pow2 = pf0 & 7;
      var num_global_colors = 1 << num_global_colors_pow2 + 1;
      var background = buf[p++];
      buf[p++];
      var global_palette_offset = null;
      var global_palette_size = null;
      if (global_palette_flag) {
        global_palette_offset = p;
        global_palette_size = num_global_colors;
        p += num_global_colors * 3;
      }
      var no_eof = true;
      var frames = [];
      var delay = 0;
      var transparent_index = null;
      var disposal = 0;
      var loop_count = null;
      this.width = width;
      this.height = height;
      while (no_eof && p < buf.length) {
        switch (buf[p++]) {
          case 33:
            switch (buf[p++]) {
              case 255:
                if (buf[p] !== 11 || // 21 FF already read, check block size.
                // NETSCAPE2.0
                buf[p + 1] == 78 && buf[p + 2] == 69 && buf[p + 3] == 84 && buf[p + 4] == 83 && buf[p + 5] == 67 && buf[p + 6] == 65 && buf[p + 7] == 80 && buf[p + 8] == 69 && buf[p + 9] == 50 && buf[p + 10] == 46 && buf[p + 11] == 48 && // Sub-block
                buf[p + 12] == 3 && buf[p + 13] == 1 && buf[p + 16] == 0) {
                  p += 14;
                  loop_count = buf[p++] | buf[p++] << 8;
                  p++;
                } else {
                  p += 12;
                  while (true) {
                    var block_size = buf[p++];
                    if (!(block_size >= 0)) throw Error("Invalid block size");
                    if (block_size === 0) break;
                    p += block_size;
                  }
                }
                break;
              case 249:
                if (buf[p++] !== 4 || buf[p + 4] !== 0)
                  throw new Error("Invalid graphics extension block.");
                var pf1 = buf[p++];
                delay = buf[p++] | buf[p++] << 8;
                transparent_index = buf[p++];
                if ((pf1 & 1) === 0) transparent_index = null;
                disposal = pf1 >> 2 & 7;
                p++;
                break;
              case 254:
                while (true) {
                  var block_size = buf[p++];
                  if (!(block_size >= 0)) throw Error("Invalid block size");
                  if (block_size === 0) break;
                  p += block_size;
                }
                break;
              default:
                throw new Error(
                  "Unknown graphic control label: 0x" + buf[p - 1].toString(16)
                );
            }
            break;
          case 44:
            var x = buf[p++] | buf[p++] << 8;
            var y = buf[p++] | buf[p++] << 8;
            var w = buf[p++] | buf[p++] << 8;
            var h = buf[p++] | buf[p++] << 8;
            var pf2 = buf[p++];
            var local_palette_flag = pf2 >> 7;
            var interlace_flag = pf2 >> 6 & 1;
            var num_local_colors_pow2 = pf2 & 7;
            var num_local_colors = 1 << num_local_colors_pow2 + 1;
            var palette_offset = global_palette_offset;
            var palette_size = global_palette_size;
            var has_local_palette = false;
            if (local_palette_flag) {
              var has_local_palette = true;
              palette_offset = p;
              palette_size = num_local_colors;
              p += num_local_colors * 3;
            }
            var data_offset = p;
            p++;
            while (true) {
              var block_size = buf[p++];
              if (!(block_size >= 0)) throw Error("Invalid block size");
              if (block_size === 0) break;
              p += block_size;
            }
            frames.push({
              x,
              y,
              width: w,
              height: h,
              has_local_palette,
              palette_offset,
              palette_size,
              data_offset,
              data_length: p - data_offset,
              transparent_index,
              interlaced: !!interlace_flag,
              delay,
              disposal
            });
            break;
          case 59:
            no_eof = false;
            break;
          default:
            throw new Error("Unknown gif block: 0x" + buf[p - 1].toString(16));
            break;
        }
      }
      this.numFrames = function() {
        return frames.length;
      };
      this.loopCount = function() {
        return loop_count;
      };
      this.frameInfo = function(frame_num) {
        if (frame_num < 0 || frame_num >= frames.length)
          throw new Error("Frame index out of range.");
        return frames[frame_num];
      };
      this.decodeAndBlitFrameBGRA = function(frame_num, pixels) {
        var frame = this.frameInfo(frame_num);
        var num_pixels = frame.width * frame.height;
        var index_stream = new Uint8Array(num_pixels);
        GifReaderLZWOutputIndexStream(
          buf,
          frame.data_offset,
          index_stream,
          num_pixels
        );
        var palette_offset2 = frame.palette_offset;
        var trans = frame.transparent_index;
        if (trans === null) trans = 256;
        var framewidth = frame.width;
        var framestride = width - framewidth;
        var xleft = framewidth;
        var opbeg = (frame.y * width + frame.x) * 4;
        var opend = ((frame.y + frame.height) * width + frame.x) * 4;
        var op = opbeg;
        var scanstride = framestride * 4;
        if (frame.interlaced === true) {
          scanstride += width * 4 * 7;
        }
        var interlaceskip = 8;
        for (var i = 0, il = index_stream.length; i < il; ++i) {
          var index = index_stream[i];
          if (xleft === 0) {
            op += scanstride;
            xleft = framewidth;
            if (op >= opend) {
              scanstride = framestride * 4 + width * 4 * (interlaceskip - 1);
              op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
              interlaceskip >>= 1;
            }
          }
          if (index === trans) {
            op += 4;
          } else {
            var r = buf[palette_offset2 + index * 3];
            var g = buf[palette_offset2 + index * 3 + 1];
            var b = buf[palette_offset2 + index * 3 + 2];
            pixels[op++] = b;
            pixels[op++] = g;
            pixels[op++] = r;
            pixels[op++] = 255;
          }
          --xleft;
        }
      };
      this.decodeAndBlitFrameRGBA = function(frame_num, pixels) {
        var frame = this.frameInfo(frame_num);
        var num_pixels = frame.width * frame.height;
        var index_stream = new Uint8Array(num_pixels);
        GifReaderLZWOutputIndexStream(
          buf,
          frame.data_offset,
          index_stream,
          num_pixels
        );
        var palette_offset2 = frame.palette_offset;
        var trans = frame.transparent_index;
        if (trans === null) trans = 256;
        var framewidth = frame.width;
        var framestride = width - framewidth;
        var xleft = framewidth;
        var opbeg = (frame.y * width + frame.x) * 4;
        var opend = ((frame.y + frame.height) * width + frame.x) * 4;
        var op = opbeg;
        var scanstride = framestride * 4;
        if (frame.interlaced === true) {
          scanstride += width * 4 * 7;
        }
        var interlaceskip = 8;
        for (var i = 0, il = index_stream.length; i < il; ++i) {
          var index = index_stream[i];
          if (xleft === 0) {
            op += scanstride;
            xleft = framewidth;
            if (op >= opend) {
              scanstride = framestride * 4 + width * 4 * (interlaceskip - 1);
              op = opbeg + (framewidth + framestride) * (interlaceskip << 1);
              interlaceskip >>= 1;
            }
          }
          if (index === trans) {
            op += 4;
          } else {
            var r = buf[palette_offset2 + index * 3];
            var g = buf[palette_offset2 + index * 3 + 1];
            var b = buf[palette_offset2 + index * 3 + 2];
            pixels[op++] = r;
            pixels[op++] = g;
            pixels[op++] = b;
            pixels[op++] = 255;
          }
          --xleft;
        }
      };
    }
    function GifReaderLZWOutputIndexStream(code_stream, p, output, output_length) {
      var min_code_size = code_stream[p++];
      var clear_code = 1 << min_code_size;
      var eoi_code = clear_code + 1;
      var next_code = eoi_code + 1;
      var cur_code_size = min_code_size + 1;
      var code_mask = (1 << cur_code_size) - 1;
      var cur_shift = 0;
      var cur = 0;
      var op = 0;
      var subblock_size = code_stream[p++];
      var code_table = new Int32Array(4096);
      var prev_code = null;
      while (true) {
        while (cur_shift < 16) {
          if (subblock_size === 0) break;
          cur |= code_stream[p++] << cur_shift;
          cur_shift += 8;
          if (subblock_size === 1) {
            subblock_size = code_stream[p++];
          } else {
            --subblock_size;
          }
        }
        if (cur_shift < cur_code_size)
          break;
        var code = cur & code_mask;
        cur >>= cur_code_size;
        cur_shift -= cur_code_size;
        if (code === clear_code) {
          next_code = eoi_code + 1;
          cur_code_size = min_code_size + 1;
          code_mask = (1 << cur_code_size) - 1;
          prev_code = null;
          continue;
        } else if (code === eoi_code) {
          break;
        }
        var chase_code = code < next_code ? code : prev_code;
        var chase_length = 0;
        var chase = chase_code;
        while (chase > clear_code) {
          chase = code_table[chase] >> 8;
          ++chase_length;
        }
        var k = chase;
        var op_end = op + chase_length + (chase_code !== code ? 1 : 0);
        if (op_end > output_length) {
          console.log("Warning, gif stream longer than expected.");
          return;
        }
        output[op++] = k;
        op += chase_length;
        var b = op;
        if (chase_code !== code)
          output[op++] = k;
        chase = chase_code;
        while (chase_length--) {
          chase = code_table[chase];
          output[--b] = chase & 255;
          chase >>= 8;
        }
        if (prev_code !== null && next_code < 4096) {
          code_table[next_code++] = prev_code << 8 | k;
          if (next_code >= code_mask + 1 && cur_code_size < 12) {
            ++cur_code_size;
            code_mask = code_mask << 1 | 1;
          }
        }
        prev_code = code;
      }
      if (op !== output_length) {
        console.log("Warning, gif stream shorter than expected.");
      }
      return output;
    }
    try {
      exports.GifWriter = GifWriter;
      exports.GifReader = GifReader2;
    } catch (e) {
    }
  }
});

// src/mayocut/audio-fx.ts
var AUDIO_FX = [
  { id: "none", name: "None", hint: "Dry signal" },
  { id: "echo", name: "Echo", hint: "Single slap-back delay" },
  { id: "reverb", name: "Reverb", hint: "Small room, generated impulse" },
  { id: "room", name: "Room", hint: "Short tight ambience" },
  { id: "stadium", name: "Stadium", hint: "Long wide tail" },
  { id: "cave", name: "Cave", hint: "Very long dark tail" },
  { id: "chipmunk", name: "Chipmunk", hint: "Higher and faster" },
  { id: "deep", name: "Deep voice", hint: "Lower and slower" },
  { id: "telephone", name: "Telephone", hint: "Narrow band, thin" },
  { id: "radio", name: "Radio", hint: "AM-style band limit + grit" },
  { id: "lofi", name: "Lo-fi", hint: "Muffled, warm, slightly crushed" },
  { id: "robot", name: "Robot", hint: "Ring modulation buzz" },
  { id: "underwater", name: "Underwater", hint: "Dark and wobbly" },
  { id: "megaphone", name: "Megaphone", hint: "Horn-like mid boost" },
  { id: "whisper", name: "Whisper", hint: "Thin, airy, quiet" },
  { id: "vinyl", name: "Vinyl", hint: "Warm band limit and hiss" }
];
var AUDIO_FX_MAP = Object.fromEntries(
  AUDIO_FX.map((f) => [f.id, f])
);
function seededNoise(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967295 * 2 - 1;
  };
}
function makeImpulse(ctx, seconds, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.round(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  const rnd = seededNoise(Math.round(seconds * 1e3) + 7);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const offset = ch * 13;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const early = i < rate * 0.02 ? 0.4 : 1;
      data[i] = rnd() * env * early * (i === offset ? 1 : 1);
    }
  }
  return buf;
}

// src/mayocut/utils.ts
var import_omggif = __toESM(require_omggif(), 1);

// src/mayocut/types.ts
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// src/mayocut/utils.ts
function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const d = Math.floor(s % 1 * 30);
  return `${m}:${sec.toString().padStart(2, "0")}.${d.toString().padStart(2, "0")}`;
}
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function kindFromMime(mime, name) {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if ([
    "mp4",
    "m4v",
    "mov",
    "webm",
    "mkv",
    "avi",
    "3gp",
    "3g2",
    "flv",
    "ts",
    "mts",
    "m2ts",
    "mpg",
    "mpeg",
    "wmv",
    "vob",
    "ogv"
  ].includes(ext))
    return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (["bmp", "jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)) return "image";
  return null;
}
function probeAudioDuration(el, url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      el.removeEventListener("loadedmetadata", onMetadata);
      el.removeEventListener("error", onError);
      resolve(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
    };
    const onMetadata = () => finish();
    const onError = () => finish();
    const timeout = window.setTimeout(finish, 5e3);
    el.preload = "metadata";
    el.addEventListener("loadedmetadata", onMetadata, { once: true });
    el.addEventListener("error", onError, { once: true });
    el.src = url;
    el.load();
  });
}
async function detectVideoCodecHint(blob) {
  const windowSize = 2 * 1024 * 1024;
  const head = await blob.slice(0, windowSize).arrayBuffer();
  const tail = blob.size > windowSize ? await blob.slice(Math.max(windowSize, blob.size - windowSize)).arrayBuffer() : new ArrayBuffer(0);
  const decoder = new TextDecoder("latin1");
  const sample = `${decoder.decode(head)}\0${decoder.decode(tail)}`;
  if (/hvc1|hev1|V_MPEGH\/ISO\/HEVC|H265|HEVC|X265/i.test(sample)) return "HEVC/H.265";
  if (/avc1|avc3|V_MPEG4\/ISO\/AVC|H264|X264/i.test(sample)) return "H.264/AVC";
  if (/av01|V_AV1/i.test(sample)) return "AV1";
  if (/vp09|V_VP9/i.test(sample)) return "VP9";
  if (/vp08|V_VP8/i.test(sample)) return "VP8";
  return "Unknown";
}
async function probeVideo(url, timeoutMs = 3e4) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const result = await new Promise((resolve) => {
    let settled = false;
    let metadataSeen = false;
    let timeout = 0;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      const playable = outcome !== "error";
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("loadeddata", onData);
      video.removeEventListener("error", onError);
      let thumb;
      if (playable && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumb = canvas.toDataURL("image/jpeg", 0.55);
        } catch {
        }
      }
      resolve({
        duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        playable,
        indeterminate: outcome === "unknown",
        thumb
      });
    };
    const onMetadata = () => {
      metadataSeen = true;
    };
    const onData = () => finish("playable");
    const onError = () => finish("error");
    timeout = window.setTimeout(() => finish("unknown"), timeoutMs);
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("loadeddata", onData);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
    if (video.readyState >= 2) finish("playable");
    else if (metadataSeen && video.error) finish("error");
  });
  video.pause();
  video.removeAttribute("src");
  video.load();
  return result;
}
async function makeThumb(kind, url) {
  try {
    if (kind === "image") {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const c = document.createElement("canvas");
      const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.6);
    }
    if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      await new Promise((res, rej) => {
        const to = setTimeout(rej, 6e3);
        v.onloadeddata = () => {
          clearTimeout(to);
          res();
        };
        v.onerror = () => {
          clearTimeout(to);
          rej(new Error("video load failed"));
        };
      });
      const t = Math.min(0.5, (v.duration || 1) / 2);
      v.currentTime = t;
      await new Promise((res) => {
        const to = setTimeout(res, 3e3);
        v.onseeked = () => {
          clearTimeout(to);
          res();
        };
      });
      const c = document.createElement("canvas");
      const scale = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.max(1, Math.round(v.videoWidth * scale));
      c.height = Math.max(1, Math.round(v.videoHeight * scale));
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.55);
    }
  } catch {
  }
  return void 0;
}
async function importFiles(files, onProgress) {
  const out = [];
  const list = Array.from(files);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const kind = kindFromMime(f.type, f.name);
    if (!kind) continue;
    const id = uid("med");
    const url = URL.createObjectURL(f);
    let duration;
    let width;
    let height;
    let playable;
    let thumb;
    let itemCodecHint;
    try {
      if (kind === "image") {
        const img = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = url;
        });
        width = img.naturalWidth;
        height = img.naturalHeight;
        duration = 0;
        thumb = await makeThumb(kind, url);
        playable = true;
      } else if (kind === "video") {
        const probe = await probeVideo(url);
        duration = probe.duration;
        width = probe.width || void 0;
        height = probe.height || void 0;
        playable = probe.playable;
        thumb = probe.thumb;
        if (!probe.playable) itemCodecHint = await detectVideoCodecHint(f);
      } else {
        duration = await probeAudioDuration(document.createElement("audio"), url);
      }
    } catch {
      duration = 0;
      if (kind === "video" || kind === "image") {
        playable = false;
        if (kind === "video") itemCodecHint = await detectVideoCodecHint(f);
      }
    }
    URL.revokeObjectURL(url);
    const item = {
      id,
      name: f.name,
      kind,
      size: f.size,
      createdAt: Date.now(),
      duration,
      width,
      height,
      thumb
    };
    if (kind === "video" || kind === "image") item.unplayable = playable === false;
    if (kind === "video" && itemCodecHint) item.codecHint = itemCodecHint;
    if (kind === "audio") {
      const audio = await analyzeAudioFile(f);
      if (audio) {
        item.wave = audio.wave;
        item.rms = audio.rms;
      }
    }
    if (kind === "image" && isGifFile(f)) {
      const g = await probeGif(f);
      if (g) {
        item.isGif = true;
        item.gifFrames = g.count;
        item.duration = Math.max(0.5, g.count / g.fps);
      }
    }
    out.push({ ...item, sourceFile: f });
    onProgress?.(i + 1, list.length);
  }
  return out;
}
function decodeAudioToMono16(blob) {
  return new Promise((resolve) => {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return resolve(null);
    const ctx = new Ctor();
    blob.arrayBuffer().then((ab) => ctx.decodeAudioData(ab)).then((buf) => {
      let mono;
      if (buf.numberOfChannels === 1) {
        mono = buf.getChannelData(0);
      } else {
        mono = new Float32Array(buf.length);
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch);
          const g = 1 / buf.numberOfChannels;
          for (let i = 0; i < d.length; i++) mono[i] += d[i] * g;
        }
      }
      const target = 16e3;
      if (Math.abs(buf.sampleRate - target) < 1) resolve(mono);
      else {
        const outLen = Math.max(1, Math.round(mono.length * (target / buf.sampleRate)));
        const out = new Float32Array(outLen);
        const ratio = mono.length / outLen;
        for (let i = 0; i < outLen; i++) {
          const x = i * ratio;
          const i0 = x | 0;
          const i1 = Math.min(mono.length - 1, i0 + 1);
          out[i] = mono[i0] + (mono[i1] - mono[i0]) * (x - i0);
        }
        resolve(out);
      }
    }).catch(() => resolve(null)).finally(() => void ctx.close());
  });
}
function makeImpulse2(ctx, seconds = 1.8, decay = 3) {
  return makeImpulse(ctx, seconds, decay);
}
var GIF_MAX_FRAMES = 48;
var GIF_MAX_SIDE = 400;
function probeGif(blob) {
  return new Promise((resolve) => {
    if (blob.size > 8 * 1024 * 1024) return resolve(null);
    blob.arrayBuffer().then((ab) => {
      const reader = new import_omggif.GifReader(new Uint8Array(ab));
      if (reader.numFrames() === 0) return resolve(null);
      const info = reader.frameInfo(0);
      if (!info || info.width > GIF_MAX_SIDE || info.height > GIF_MAX_SIDE) return resolve(null);
      const count = Math.min(GIF_MAX_FRAMES, reader.numFrames());
      let ms = 0;
      for (let k = 0; k < count; k++) {
        const f = reader.frameInfo(k);
        ms += f?.delay ?? 0.1;
      }
      const fps = ms > 0 ? Math.min(60, Math.max(2, count / (ms / 1e3))) : 12;
      resolve({ fps, count, width: info.width, height: info.height });
    }).catch(() => resolve(null));
  });
}
function isGifFile(f) {
  return f.type === "image/gif" || /\.gif$/i.test(f.name);
}
async function analyzeAudioFile(f) {
  try {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    const ctx = new Ctor();
    try {
      const audio = await ctx.decodeAudioData(await f.arrayBuffer());
      const data = audio.getChannelData(0);
      const bins = 128;
      const per = Math.max(1, Math.floor(data.length / bins));
      const wave = [];
      let sq = 0;
      let n = 0;
      let peak = 0;
      for (let b = 0; b < bins; b++) {
        let p = 0;
        const s0 = b * per;
        for (let i = s0; i < Math.min(data.length, s0 + per); i += 8) {
          const v = Math.abs(data[i]);
          if (v > p) p = v;
          sq += data[i] * data[i];
          n++;
        }
        wave.push(p);
        if (p > peak) peak = p;
      }
      const norm = peak > 0 ? 1 / peak : 1;
      return { wave: wave.map((v) => v * norm), rms: Math.sqrt(sq / Math.max(1, n)) };
    } finally {
      void ctx.close();
    }
  } catch {
    return void 0;
  }
}
export {
  GIF_MAX_FRAMES,
  GIF_MAX_SIDE,
  decodeAudioToMono16,
  detectVideoCodecHint,
  fmtBytes,
  fmtTime,
  importFiles,
  isGifFile,
  kindFromMime,
  makeImpulse2 as makeImpulse,
  makeThumb,
  probeGif
};
