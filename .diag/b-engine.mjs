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
    function GifWriter2(buf, width, height, gopts) {
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
      exports.GifWriter = GifWriter2;
      exports.GifReader = GifReader2;
    } catch (e) {
    }
  }
});

// node_modules/mp4-muxer/build/mp4-muxer.mjs
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};
var bytes = new Uint8Array(8);
var view = new DataView(bytes.buffer);
var u8 = (value) => {
  return [(value % 256 + 256) % 256];
};
var u16 = (value) => {
  view.setUint16(0, value, false);
  return [bytes[0], bytes[1]];
};
var i16 = (value) => {
  view.setInt16(0, value, false);
  return [bytes[0], bytes[1]];
};
var u24 = (value) => {
  view.setUint32(0, value, false);
  return [bytes[1], bytes[2], bytes[3]];
};
var u32 = (value) => {
  view.setUint32(0, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var i32 = (value) => {
  view.setInt32(0, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var u64 = (value) => {
  view.setUint32(0, Math.floor(value / 2 ** 32), false);
  view.setUint32(4, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
};
var fixed_8_8 = (value) => {
  view.setInt16(0, 2 ** 8 * value, false);
  return [bytes[0], bytes[1]];
};
var fixed_16_16 = (value) => {
  view.setInt32(0, 2 ** 16 * value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var fixed_2_30 = (value) => {
  view.setInt32(0, 2 ** 30 * value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var ascii = (text, nullTerminated = false) => {
  let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
  if (nullTerminated)
    bytes2.push(0);
  return bytes2;
};
var last = (arr) => {
  return arr && arr[arr.length - 1];
};
var lastPresentedSample = (samples) => {
  let result = void 0;
  for (let sample of samples) {
    if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
      result = sample;
    }
  }
  return result;
};
var intoTimescale = (timeInSeconds, timescale, round = true) => {
  let value = timeInSeconds * timescale;
  return round ? Math.round(value) : value;
};
var rotationMatrix = (rotationInDegrees) => {
  let theta = rotationInDegrees * (Math.PI / 180);
  let cosTheta = Math.cos(theta);
  let sinTheta = Math.sin(theta);
  return [
    cosTheta,
    sinTheta,
    0,
    -sinTheta,
    cosTheta,
    0,
    0,
    0,
    1
  ];
};
var IDENTITY_MATRIX = rotationMatrix(0);
var matrixToBytes = (matrix) => {
  return [
    fixed_16_16(matrix[0]),
    fixed_16_16(matrix[1]),
    fixed_2_30(matrix[2]),
    fixed_16_16(matrix[3]),
    fixed_16_16(matrix[4]),
    fixed_2_30(matrix[5]),
    fixed_16_16(matrix[6]),
    fixed_16_16(matrix[7]),
    fixed_2_30(matrix[8])
  ];
};
var deepClone = (x) => {
  if (!x)
    return x;
  if (typeof x !== "object")
    return x;
  if (Array.isArray(x))
    return x.map(deepClone);
  return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)]));
};
var isU32 = (value) => {
  return value >= 0 && value < 2 ** 32;
};
var box = (type, contents, children) => ({
  type,
  contents: contents && new Uint8Array(contents.flat(10)),
  children
});
var fullBox = (type, version, flags, contents, children) => box(
  type,
  [u8(version), u24(flags), contents ?? []],
  children
);
var ftyp = (details) => {
  let minorVersion = 512;
  if (details.fragmented)
    return box("ftyp", [
      ascii("iso5"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("iso5"),
      ascii("iso6"),
      ascii("mp41")
    ]);
  return box("ftyp", [
    ascii("isom"),
    // Major brand
    u32(minorVersion),
    // Minor version
    // Compatible brands
    ascii("isom"),
    details.holdsAvc ? ascii("avc1") : [],
    ascii("mp41")
  ]);
};
var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
var free = (size) => ({ type: "free", size });
var moov = (tracks, creationTime, fragmented = false) => box("moov", null, [
  mvhd(creationTime, tracks),
  ...tracks.map((x) => trak(x, creationTime)),
  fragmented ? mvex(tracks) : null
]);
var mvhd = (creationTime, tracks) => {
  let duration = intoTimescale(Math.max(
    0,
    ...tracks.filter((x) => x.samples.length > 0).map((x) => {
      const lastSample = lastPresentedSample(x.samples);
      return lastSample.presentationTimestamp + lastSample.duration;
    })
  ), GLOBAL_TIMESCALE);
  let nextTrackId = Math.max(...tracks.map((x) => x.id)) + 1;
  let needsU64 = !isU32(creationTime) || !isU32(duration);
  let u32OrU64 = needsU64 ? u64 : u32;
  return fullBox("mvhd", +needsU64, 0, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(GLOBAL_TIMESCALE),
    // Timescale
    u32OrU64(duration),
    // Duration
    fixed_16_16(1),
    // Preferred rate
    fixed_8_8(1),
    // Preferred volume
    Array(10).fill(0),
    // Reserved
    matrixToBytes(IDENTITY_MATRIX),
    // Matrix
    Array(24).fill(0),
    // Pre-defined
    u32(nextTrackId)
    // Next track ID
  ]);
};
var trak = (track, creationTime) => box("trak", null, [
  tkhd(track, creationTime),
  mdia(track, creationTime)
]);
var tkhd = (track, creationTime) => {
  let lastSample = lastPresentedSample(track.samples);
  let durationInGlobalTimescale = intoTimescale(
    lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
    GLOBAL_TIMESCALE
  );
  let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
  let u32OrU64 = needsU64 ? u64 : u32;
  let matrix;
  if (track.info.type === "video") {
    matrix = typeof track.info.rotation === "number" ? rotationMatrix(track.info.rotation) : track.info.rotation;
  } else {
    matrix = IDENTITY_MATRIX;
  }
  return fullBox("tkhd", +needsU64, 3, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(track.id),
    // Track ID
    u32(0),
    // Reserved
    u32OrU64(durationInGlobalTimescale),
    // Duration
    Array(8).fill(0),
    // Reserved
    u16(0),
    // Layer
    u16(0),
    // Alternate group
    fixed_8_8(track.info.type === "audio" ? 1 : 0),
    // Volume
    u16(0),
    // Reserved
    matrixToBytes(matrix),
    // Matrix
    fixed_16_16(track.info.type === "video" ? track.info.width : 0),
    // Track width
    fixed_16_16(track.info.type === "video" ? track.info.height : 0)
    // Track height
  ]);
};
var mdia = (track, creationTime) => box("mdia", null, [
  mdhd(track, creationTime),
  hdlr(track.info.type === "video" ? "vide" : "soun"),
  minf(track)
]);
var mdhd = (track, creationTime) => {
  let lastSample = lastPresentedSample(track.samples);
  let localDuration = intoTimescale(
    lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
    track.timescale
  );
  let needsU64 = !isU32(creationTime) || !isU32(localDuration);
  let u32OrU64 = needsU64 ? u64 : u32;
  return fullBox("mdhd", +needsU64, 0, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(track.timescale),
    // Timescale
    u32OrU64(localDuration),
    // Duration
    u16(21956),
    // Language ("und", undetermined)
    u16(0)
    // Quality
  ]);
};
var hdlr = (componentSubtype) => fullBox("hdlr", 0, 0, [
  ascii("mhlr"),
  // Component type
  ascii(componentSubtype),
  // Component subtype
  u32(0),
  // Component manufacturer
  u32(0),
  // Component flags
  u32(0),
  // Component flags mask
  ascii("mp4-muxer-hdlr", true)
  // Component name
]);
var minf = (track) => box("minf", null, [
  track.info.type === "video" ? vmhd() : smhd(),
  dinf(),
  stbl(track)
]);
var vmhd = () => fullBox("vmhd", 0, 1, [
  u16(0),
  // Graphics mode
  u16(0),
  // Opcolor R
  u16(0),
  // Opcolor G
  u16(0)
  // Opcolor B
]);
var smhd = () => fullBox("smhd", 0, 0, [
  u16(0),
  // Balance
  u16(0)
  // Reserved
]);
var dinf = () => box("dinf", null, [
  dref()
]);
var dref = () => fullBox("dref", 0, 0, [
  u32(1)
  // Entry count
], [
  url()
]);
var url = () => fullBox("url ", 0, 1);
var stbl = (track) => {
  const needsCtts = track.compositionTimeOffsetTable.length > 1 || track.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
  return box("stbl", null, [
    stsd(track),
    stts(track),
    stss(track),
    stsc(track),
    stsz(track),
    stco(track),
    needsCtts ? ctts(track) : null
  ]);
};
var stsd = (track) => fullBox("stsd", 0, 0, [
  u32(1)
  // Entry count
], [
  track.info.type === "video" ? videoSampleDescription(
    VIDEO_CODEC_TO_BOX_NAME[track.info.codec],
    track
  ) : soundSampleDescription(
    AUDIO_CODEC_TO_BOX_NAME[track.info.codec],
    track
  )
]);
var videoSampleDescription = (compressionType, track) => box(compressionType, [
  Array(6).fill(0),
  // Reserved
  u16(1),
  // Data reference index
  u16(0),
  // Pre-defined
  u16(0),
  // Reserved
  Array(12).fill(0),
  // Pre-defined
  u16(track.info.width),
  // Width
  u16(track.info.height),
  // Height
  u32(4718592),
  // Horizontal resolution
  u32(4718592),
  // Vertical resolution
  u32(0),
  // Reserved
  u16(1),
  // Frame count
  Array(32).fill(0),
  // Compressor name
  u16(24),
  // Depth
  i16(65535)
  // Pre-defined
], [
  VIDEO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track),
  track.info.decoderConfig.colorSpace ? colr(track) : null
]);
var COLOR_PRIMARIES_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6
  // ITU-R BT.601 525 - SMPTE 170M
};
var TRANSFER_CHARACTERISTICS_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "smpte170m": 6,
  // SMPTE 170M
  "iec61966-2-1": 13
  // IEC 61966-2-1
};
var MATRIX_COEFFICIENTS_MAP = {
  "rgb": 0,
  // Identity
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6
  // SMPTE 170M
};
var colr = (track) => box("colr", [
  ascii("nclx"),
  // Colour type
  u16(COLOR_PRIMARIES_MAP[track.info.decoderConfig.colorSpace.primaries]),
  // Colour primaries
  u16(TRANSFER_CHARACTERISTICS_MAP[track.info.decoderConfig.colorSpace.transfer]),
  // Transfer characteristics
  u16(MATRIX_COEFFICIENTS_MAP[track.info.decoderConfig.colorSpace.matrix]),
  // Matrix coefficients
  u8((track.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
  // Full range flag
]);
var avcC = (track) => track.info.decoderConfig && box("avcC", [
  // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
  ...new Uint8Array(track.info.decoderConfig.description)
]);
var hvcC = (track) => track.info.decoderConfig && box("hvcC", [
  // For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
  ...new Uint8Array(track.info.decoderConfig.description)
]);
var vpcC = (track) => {
  if (!track.info.decoderConfig) {
    return null;
  }
  let decoderConfig = track.info.decoderConfig;
  if (!decoderConfig.colorSpace) {
    throw new Error(`'colorSpace' is required in the decoder config for VP9.`);
  }
  let parts = decoderConfig.codec.split(".");
  let profile = Number(parts[1]);
  let level = Number(parts[2]);
  let bitDepth = Number(parts[3]);
  let chromaSubsampling = 0;
  let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
  let colourPrimaries = 2;
  let transferCharacteristics = 2;
  let matrixCoefficients = 2;
  return fullBox("vpcC", 1, 0, [
    u8(profile),
    // Profile
    u8(level),
    // Level
    u8(thirdByte),
    // Bit depth, chroma subsampling, full range
    u8(colourPrimaries),
    // Colour primaries
    u8(transferCharacteristics),
    // Transfer characteristics
    u8(matrixCoefficients),
    // Matrix coefficients
    u16(0)
    // Codec initialization data size
  ]);
};
var av1C = () => {
  let marker = 1;
  let version = 1;
  let firstByte = (marker << 7) + version;
  return box("av1C", [
    firstByte,
    0,
    0,
    0
  ]);
};
var soundSampleDescription = (compressionType, track) => box(compressionType, [
  Array(6).fill(0),
  // Reserved
  u16(1),
  // Data reference index
  u16(0),
  // Version
  u16(0),
  // Revision level
  u32(0),
  // Vendor
  u16(track.info.numberOfChannels),
  // Number of channels
  u16(16),
  // Sample size (bits)
  u16(0),
  // Compression ID
  u16(0),
  // Packet size
  fixed_16_16(track.info.sampleRate)
  // Sample rate
], [
  AUDIO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track)
]);
var esds = (track) => {
  let description = new Uint8Array(track.info.decoderConfig.description);
  return fullBox("esds", 0, 0, [
    // https://stackoverflow.com/a/54803118
    u32(58753152),
    // TAG(3) = Object Descriptor ([2])
    u8(32 + description.byteLength),
    // length of this OD (which includes the next 2 tags)
    u16(1),
    // ES_ID = 1
    u8(0),
    // flags etc = 0
    u32(75530368),
    // TAG(4) = ES Descriptor ([2]) embedded in above OD
    u8(18 + description.byteLength),
    // length of this ESD
    u8(64),
    // MPEG-4 Audio
    u8(21),
    // stream type(6bits)=5 audio, flags(2bits)=1
    u24(0),
    // 24bit buffer size
    u32(130071),
    // max bitrate
    u32(130071),
    // avg bitrate
    u32(92307584),
    // TAG(5) = ASC ([2],[3]) embedded in above OD
    u8(description.byteLength),
    // length
    ...description,
    u32(109084800),
    // TAG(6)
    u8(1),
    // length
    u8(2)
    // data
  ]);
};
var dOps = (track) => {
  let preskip = 3840;
  let gain = 0;
  const description = track.info.decoderConfig?.description;
  if (description) {
    if (description.byteLength < 18) {
      throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
    }
    const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
    preskip = view2.getUint16(10, true);
    gain = view2.getInt16(14, true);
  }
  return box("dOps", [
    u8(0),
    // Version
    u8(track.info.numberOfChannels),
    // OutputChannelCount
    u16(preskip),
    u32(track.info.sampleRate),
    // InputSampleRate
    fixed_8_8(gain),
    // OutputGain
    u8(0)
    // ChannelMappingFamily
  ]);
};
var stts = (track) => {
  return fullBox("stts", 0, 0, [
    u32(track.timeToSampleTable.length),
    // Number of entries
    track.timeToSampleTable.map((x) => [
      // Time-to-sample table
      u32(x.sampleCount),
      // Sample count
      u32(x.sampleDelta)
      // Sample duration
    ])
  ]);
};
var stss = (track) => {
  if (track.samples.every((x) => x.type === "key"))
    return null;
  let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
  return fullBox("stss", 0, 0, [
    u32(keySamples.length),
    // Number of entries
    keySamples.map(([index]) => u32(index + 1))
    // Sync sample table
  ]);
};
var stsc = (track) => {
  return fullBox("stsc", 0, 0, [
    u32(track.compactlyCodedChunkTable.length),
    // Number of entries
    track.compactlyCodedChunkTable.map((x) => [
      // Sample-to-chunk table
      u32(x.firstChunk),
      // First chunk
      u32(x.samplesPerChunk),
      // Samples per chunk
      u32(1)
      // Sample description index
    ])
  ]);
};
var stsz = (track) => fullBox("stsz", 0, 0, [
  u32(0),
  // Sample size (0 means non-constant size)
  u32(track.samples.length),
  // Number of entries
  track.samples.map((x) => u32(x.size))
  // Sample size table
]);
var stco = (track) => {
  if (track.finalizedChunks.length > 0 && last(track.finalizedChunks).offset >= 2 ** 32) {
    return fullBox("co64", 0, 0, [
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((x) => u64(x.offset))
      // Chunk offset table
    ]);
  }
  return fullBox("stco", 0, 0, [
    u32(track.finalizedChunks.length),
    // Number of entries
    track.finalizedChunks.map((x) => u32(x.offset))
    // Chunk offset table
  ]);
};
var ctts = (track) => {
  return fullBox("ctts", 0, 0, [
    u32(track.compositionTimeOffsetTable.length),
    // Number of entries
    track.compositionTimeOffsetTable.map((x) => [
      // Time-to-sample table
      u32(x.sampleCount),
      // Sample count
      u32(x.sampleCompositionTimeOffset)
      // Sample offset
    ])
  ]);
};
var mvex = (tracks) => {
  return box("mvex", null, tracks.map(trex));
};
var trex = (track) => {
  return fullBox("trex", 0, 0, [
    u32(track.id),
    // Track ID
    u32(1),
    // Default sample description index
    u32(0),
    // Default sample duration
    u32(0),
    // Default sample size
    u32(0)
    // Default sample flags
  ]);
};
var moof = (sequenceNumber, tracks) => {
  return box("moof", null, [
    mfhd(sequenceNumber),
    ...tracks.map(traf)
  ]);
};
var mfhd = (sequenceNumber) => {
  return fullBox("mfhd", 0, 0, [
    u32(sequenceNumber)
    // Sequence number
  ]);
};
var fragmentSampleFlags = (sample) => {
  let byte1 = 0;
  let byte2 = 0;
  let byte3 = 0;
  let byte4 = 0;
  let sampleIsDifferenceSample = sample.type === "delta";
  byte2 |= +sampleIsDifferenceSample;
  if (sampleIsDifferenceSample) {
    byte1 |= 1;
  } else {
    byte1 |= 2;
  }
  return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
};
var traf = (track) => {
  return box("traf", null, [
    tfhd(track),
    tfdt(track),
    trun(track)
  ]);
};
var tfhd = (track) => {
  let tfFlags = 0;
  tfFlags |= 8;
  tfFlags |= 16;
  tfFlags |= 32;
  tfFlags |= 131072;
  let referenceSample = track.currentChunk.samples[1] ?? track.currentChunk.samples[0];
  let referenceSampleInfo = {
    duration: referenceSample.timescaleUnitsToNextSample,
    size: referenceSample.size,
    flags: fragmentSampleFlags(referenceSample)
  };
  return fullBox("tfhd", 0, tfFlags, [
    u32(track.id),
    // Track ID
    u32(referenceSampleInfo.duration),
    // Default sample duration
    u32(referenceSampleInfo.size),
    // Default sample size
    u32(referenceSampleInfo.flags)
    // Default sample flags
  ]);
};
var tfdt = (track) => {
  return fullBox("tfdt", 1, 0, [
    u64(intoTimescale(track.currentChunk.startTimestamp, track.timescale))
    // Base Media Decode Time
  ]);
};
var trun = (track) => {
  let allSampleDurations = track.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
  let allSampleSizes = track.currentChunk.samples.map((x) => x.size);
  let allSampleFlags = track.currentChunk.samples.map(fragmentSampleFlags);
  let allSampleCompositionTimeOffsets = track.currentChunk.samples.map((x) => intoTimescale(x.presentationTimestamp - x.decodeTimestamp, track.timescale));
  let uniqueSampleDurations = new Set(allSampleDurations);
  let uniqueSampleSizes = new Set(allSampleSizes);
  let uniqueSampleFlags = new Set(allSampleFlags);
  let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
  let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
  let sampleDurationPresent = uniqueSampleDurations.size > 1;
  let sampleSizePresent = uniqueSampleSizes.size > 1;
  let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
  let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
  let flags = 0;
  flags |= 1;
  flags |= 4 * +firstSampleFlagsPresent;
  flags |= 256 * +sampleDurationPresent;
  flags |= 512 * +sampleSizePresent;
  flags |= 1024 * +sampleFlagsPresent;
  flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
  return fullBox("trun", 1, flags, [
    u32(track.currentChunk.samples.length),
    // Sample count
    u32(track.currentChunk.offset - track.currentChunk.moofOffset || 0),
    // Data offset
    firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
    track.currentChunk.samples.map((_, i) => [
      sampleDurationPresent ? u32(allSampleDurations[i]) : [],
      // Sample duration
      sampleSizePresent ? u32(allSampleSizes[i]) : [],
      // Sample size
      sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
      // Sample flags
      // Sample composition time offsets
      sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
    ])
  ]);
};
var mfra = (tracks) => {
  return box("mfra", null, [
    ...tracks.map(tfra),
    mfro()
  ]);
};
var tfra = (track, trackIndex) => {
  let version = 1;
  return fullBox("tfra", version, 0, [
    u32(track.id),
    // Track ID
    u32(63),
    // This specifies that traf number, trun number and sample number are 32-bit ints
    u32(track.finalizedChunks.length),
    // Number of entries
    track.finalizedChunks.map((chunk) => [
      u64(intoTimescale(chunk.startTimestamp, track.timescale)),
      // Time
      u64(chunk.moofOffset),
      // moof offset
      u32(trackIndex + 1),
      // traf number
      u32(1),
      // trun number
      u32(1)
      // Sample number
    ])
  ]);
};
var mfro = () => {
  return fullBox("mfro", 0, 0, [
    // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
    // is known
    u32(0)
    // Size
  ]);
};
var VIDEO_CODEC_TO_BOX_NAME = {
  "avc": "avc1",
  "hevc": "hvc1",
  "vp9": "vp09",
  "av1": "av01"
};
var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
  "avc": avcC,
  "hevc": hvcC,
  "vp9": vpcC,
  "av1": av1C
};
var AUDIO_CODEC_TO_BOX_NAME = {
  "aac": "mp4a",
  "opus": "Opus"
};
var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
  "aac": esds,
  "opus": dOps
};
var Target = class {
};
var ArrayBufferTarget = class extends Target {
  constructor() {
    super(...arguments);
    this.buffer = null;
  }
};
var StreamTarget = class extends Target {
  constructor(options) {
    super();
    this.options = options;
    if (typeof options !== "object") {
      throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
    }
    if (options.onData) {
      if (typeof options.onData !== "function") {
        throw new TypeError("options.onData, when provided, must be a function.");
      }
      if (options.onData.length < 2) {
        throw new TypeError(
          "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
        );
      }
    }
    if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
      throw new TypeError("options.chunked, when provided, must be a boolean.");
    }
    if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
      throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
    }
  }
};
var FileSystemWritableFileStreamTarget = class extends Target {
  constructor(stream, options) {
    super();
    this.stream = stream;
    this.options = options;
    if (!(stream instanceof FileSystemWritableFileStream)) {
      throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
    }
    if (options !== void 0 && typeof options !== "object") {
      throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
    }
    if (options) {
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
        throw new TypeError("options.chunkSize, when provided, must be a positive integer");
      }
    }
  }
};
var _helper;
var _helperView;
var Writer = class {
  constructor() {
    this.pos = 0;
    __privateAdd(this, _helper, new Uint8Array(8));
    __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
    this.offsets = /* @__PURE__ */ new WeakMap();
  }
  /** Sets the current position for future writes to a new one. */
  seek(newPos) {
    this.pos = newPos;
  }
  writeU32(value) {
    __privateGet(this, _helperView).setUint32(0, value, false);
    this.write(__privateGet(this, _helper).subarray(0, 4));
  }
  writeU64(value) {
    __privateGet(this, _helperView).setUint32(0, Math.floor(value / 2 ** 32), false);
    __privateGet(this, _helperView).setUint32(4, value, false);
    this.write(__privateGet(this, _helper).subarray(0, 8));
  }
  writeAscii(text) {
    for (let i = 0; i < text.length; i++) {
      __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
      if (i % 8 === 7)
        this.write(__privateGet(this, _helper));
    }
    if (text.length % 8 !== 0) {
      this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
    }
  }
  writeBox(box2) {
    this.offsets.set(box2, this.pos);
    if (box2.contents && !box2.children) {
      this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
      this.write(box2.contents);
    } else {
      let startPos = this.pos;
      this.writeBoxHeader(box2, 0);
      if (box2.contents)
        this.write(box2.contents);
      if (box2.children) {
        for (let child of box2.children)
          if (child)
            this.writeBox(child);
      }
      let endPos = this.pos;
      let size = box2.size ?? endPos - startPos;
      this.seek(startPos);
      this.writeBoxHeader(box2, size);
      this.seek(endPos);
    }
  }
  writeBoxHeader(box2, size) {
    this.writeU32(box2.largeSize ? 1 : size);
    this.writeAscii(box2.type);
    if (box2.largeSize)
      this.writeU64(size);
  }
  measureBoxHeader(box2) {
    return 8 + (box2.largeSize ? 8 : 0);
  }
  patchBox(box2) {
    let endPos = this.pos;
    this.seek(this.offsets.get(box2));
    this.writeBox(box2);
    this.seek(endPos);
  }
  measureBox(box2) {
    if (box2.contents && !box2.children) {
      let headerSize = this.measureBoxHeader(box2);
      return headerSize + box2.contents.byteLength;
    } else {
      let result = this.measureBoxHeader(box2);
      if (box2.contents)
        result += box2.contents.byteLength;
      if (box2.children) {
        for (let child of box2.children)
          if (child)
            result += this.measureBox(child);
      }
      return result;
    }
  }
};
_helper = /* @__PURE__ */ new WeakMap();
_helperView = /* @__PURE__ */ new WeakMap();
var _target;
var _buffer;
var _bytes;
var _maxPos;
var _ensureSize;
var ensureSize_fn;
var ArrayBufferTargetWriter = class extends Writer {
  constructor(target) {
    super();
    __privateAdd(this, _ensureSize);
    __privateAdd(this, _target, void 0);
    __privateAdd(this, _buffer, new ArrayBuffer(2 ** 16));
    __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
    __privateAdd(this, _maxPos, 0);
    __privateSet(this, _target, target);
  }
  write(data) {
    __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos + data.byteLength);
    __privateGet(this, _bytes).set(data, this.pos);
    this.pos += data.byteLength;
    __privateSet(this, _maxPos, Math.max(__privateGet(this, _maxPos), this.pos));
  }
  finalize() {
    __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos);
    __privateGet(this, _target).buffer = __privateGet(this, _buffer).slice(0, Math.max(__privateGet(this, _maxPos), this.pos));
  }
};
_target = /* @__PURE__ */ new WeakMap();
_buffer = /* @__PURE__ */ new WeakMap();
_bytes = /* @__PURE__ */ new WeakMap();
_maxPos = /* @__PURE__ */ new WeakMap();
_ensureSize = /* @__PURE__ */ new WeakSet();
ensureSize_fn = function(size) {
  let newLength = __privateGet(this, _buffer).byteLength;
  while (newLength < size)
    newLength *= 2;
  if (newLength === __privateGet(this, _buffer).byteLength)
    return;
  let newBuffer = new ArrayBuffer(newLength);
  let newBytes = new Uint8Array(newBuffer);
  newBytes.set(__privateGet(this, _bytes), 0);
  __privateSet(this, _buffer, newBuffer);
  __privateSet(this, _bytes, newBytes);
};
var DEFAULT_CHUNK_SIZE = 2 ** 24;
var MAX_CHUNKS_AT_ONCE = 2;
var _target2;
var _sections;
var _chunked;
var _chunkSize;
var _chunks;
var _writeDataIntoChunks;
var writeDataIntoChunks_fn;
var _insertSectionIntoChunk;
var insertSectionIntoChunk_fn;
var _createChunk;
var createChunk_fn;
var _flushChunks;
var flushChunks_fn;
var StreamTargetWriter = class extends Writer {
  constructor(target) {
    super();
    __privateAdd(this, _writeDataIntoChunks);
    __privateAdd(this, _insertSectionIntoChunk);
    __privateAdd(this, _createChunk);
    __privateAdd(this, _flushChunks);
    __privateAdd(this, _target2, void 0);
    __privateAdd(this, _sections, []);
    __privateAdd(this, _chunked, void 0);
    __privateAdd(this, _chunkSize, void 0);
    __privateAdd(this, _chunks, []);
    __privateSet(this, _target2, target);
    __privateSet(this, _chunked, target.options?.chunked ?? false);
    __privateSet(this, _chunkSize, target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE);
  }
  write(data) {
    __privateGet(this, _sections).push({
      data: data.slice(),
      start: this.pos
    });
    this.pos += data.byteLength;
  }
  flush() {
    if (__privateGet(this, _sections).length === 0)
      return;
    let chunks = [];
    let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
    chunks.push({
      start: sorted[0].start,
      size: sorted[0].data.byteLength
    });
    for (let i = 1; i < sorted.length; i++) {
      let lastChunk = chunks[chunks.length - 1];
      let section = sorted[i];
      if (section.start <= lastChunk.start + lastChunk.size) {
        lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
      } else {
        chunks.push({
          start: section.start,
          size: section.data.byteLength
        });
      }
    }
    for (let chunk of chunks) {
      chunk.data = new Uint8Array(chunk.size);
      for (let section of __privateGet(this, _sections)) {
        if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
          chunk.data.set(section.data, section.start - chunk.start);
        }
      }
      if (__privateGet(this, _chunked)) {
        __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, chunk.data, chunk.start);
        __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
      } else {
        __privateGet(this, _target2).options.onData?.(chunk.data, chunk.start);
      }
    }
    __privateGet(this, _sections).length = 0;
  }
  finalize() {
    if (__privateGet(this, _chunked)) {
      __privateMethod(this, _flushChunks, flushChunks_fn).call(this, true);
    }
  }
};
_target2 = /* @__PURE__ */ new WeakMap();
_sections = /* @__PURE__ */ new WeakMap();
_chunked = /* @__PURE__ */ new WeakMap();
_chunkSize = /* @__PURE__ */ new WeakMap();
_chunks = /* @__PURE__ */ new WeakMap();
_writeDataIntoChunks = /* @__PURE__ */ new WeakSet();
writeDataIntoChunks_fn = function(data, position) {
  let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + __privateGet(this, _chunkSize));
  if (chunkIndex === -1)
    chunkIndex = __privateMethod(this, _createChunk, createChunk_fn).call(this, position);
  let chunk = __privateGet(this, _chunks)[chunkIndex];
  let relativePosition = position - chunk.start;
  let toWrite = data.subarray(0, Math.min(__privateGet(this, _chunkSize) - relativePosition, data.byteLength));
  chunk.data.set(toWrite, relativePosition);
  let section = {
    start: relativePosition,
    end: relativePosition + toWrite.byteLength
  };
  __privateMethod(this, _insertSectionIntoChunk, insertSectionIntoChunk_fn).call(this, chunk, section);
  if (chunk.written[0].start === 0 && chunk.written[0].end === __privateGet(this, _chunkSize)) {
    chunk.shouldFlush = true;
  }
  if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
    for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
      __privateGet(this, _chunks)[i].shouldFlush = true;
    }
    __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
  }
  if (toWrite.byteLength < data.byteLength) {
    __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
  }
};
_insertSectionIntoChunk = /* @__PURE__ */ new WeakSet();
insertSectionIntoChunk_fn = function(chunk, section) {
  let low = 0;
  let high = chunk.written.length - 1;
  let index = -1;
  while (low <= high) {
    let mid = Math.floor(low + (high - low + 1) / 2);
    if (chunk.written[mid].start <= section.start) {
      low = mid + 1;
      index = mid;
    } else {
      high = mid - 1;
    }
  }
  chunk.written.splice(index + 1, 0, section);
  if (index === -1 || chunk.written[index].end < section.start)
    index++;
  while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
    chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
    chunk.written.splice(index + 1, 1);
  }
};
_createChunk = /* @__PURE__ */ new WeakSet();
createChunk_fn = function(includesPosition) {
  let start = Math.floor(includesPosition / __privateGet(this, _chunkSize)) * __privateGet(this, _chunkSize);
  let chunk = {
    start,
    data: new Uint8Array(__privateGet(this, _chunkSize)),
    written: [],
    shouldFlush: false
  };
  __privateGet(this, _chunks).push(chunk);
  __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
  return __privateGet(this, _chunks).indexOf(chunk);
};
_flushChunks = /* @__PURE__ */ new WeakSet();
flushChunks_fn = function(force = false) {
  for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
    let chunk = __privateGet(this, _chunks)[i];
    if (!chunk.shouldFlush && !force)
      continue;
    for (let section of chunk.written) {
      __privateGet(this, _target2).options.onData?.(
        chunk.data.subarray(section.start, section.end),
        chunk.start + section.start
      );
    }
    __privateGet(this, _chunks).splice(i--, 1);
  }
};
var FileSystemWritableFileStreamTargetWriter = class extends StreamTargetWriter {
  constructor(target) {
    super(new StreamTarget({
      onData: (data, position) => target.stream.write({
        type: "write",
        data,
        position
      }),
      chunked: true,
      chunkSize: target.options?.chunkSize
    }));
  }
};
var GLOBAL_TIMESCALE = 1e3;
var SUPPORTED_VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
var SUPPORTED_AUDIO_CODECS = ["aac", "opus"];
var TIMESTAMP_OFFSET = 2082844800;
var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "cross-track-offset"];
var _options;
var _writer;
var _ftypSize;
var _mdat;
var _videoTrack;
var _audioTrack;
var _creationTime;
var _finalizedChunks;
var _nextFragmentNumber;
var _videoSampleQueue;
var _audioSampleQueue;
var _finalized;
var _validateOptions;
var validateOptions_fn;
var _writeHeader;
var writeHeader_fn;
var _computeMoovSizeUpperBound;
var computeMoovSizeUpperBound_fn;
var _prepareTracks;
var prepareTracks_fn;
var _generateMpeg4AudioSpecificConfig;
var generateMpeg4AudioSpecificConfig_fn;
var _createSampleForTrack;
var createSampleForTrack_fn;
var _addSampleToTrack;
var addSampleToTrack_fn;
var _validateTimestamp;
var validateTimestamp_fn;
var _finalizeCurrentChunk;
var finalizeCurrentChunk_fn;
var _finalizeFragment;
var finalizeFragment_fn;
var _maybeFlushStreamingTargetWriter;
var maybeFlushStreamingTargetWriter_fn;
var _ensureNotFinalized;
var ensureNotFinalized_fn;
var Muxer = class {
  constructor(options) {
    __privateAdd(this, _validateOptions);
    __privateAdd(this, _writeHeader);
    __privateAdd(this, _computeMoovSizeUpperBound);
    __privateAdd(this, _prepareTracks);
    __privateAdd(this, _generateMpeg4AudioSpecificConfig);
    __privateAdd(this, _createSampleForTrack);
    __privateAdd(this, _addSampleToTrack);
    __privateAdd(this, _validateTimestamp);
    __privateAdd(this, _finalizeCurrentChunk);
    __privateAdd(this, _finalizeFragment);
    __privateAdd(this, _maybeFlushStreamingTargetWriter);
    __privateAdd(this, _ensureNotFinalized);
    __privateAdd(this, _options, void 0);
    __privateAdd(this, _writer, void 0);
    __privateAdd(this, _ftypSize, void 0);
    __privateAdd(this, _mdat, void 0);
    __privateAdd(this, _videoTrack, null);
    __privateAdd(this, _audioTrack, null);
    __privateAdd(this, _creationTime, Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET);
    __privateAdd(this, _finalizedChunks, []);
    __privateAdd(this, _nextFragmentNumber, 1);
    __privateAdd(this, _videoSampleQueue, []);
    __privateAdd(this, _audioSampleQueue, []);
    __privateAdd(this, _finalized, false);
    __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
    options.video = deepClone(options.video);
    options.audio = deepClone(options.audio);
    options.fastStart = deepClone(options.fastStart);
    this.target = options.target;
    __privateSet(this, _options, {
      firstTimestampBehavior: "strict",
      ...options
    });
    if (options.target instanceof ArrayBufferTarget) {
      __privateSet(this, _writer, new ArrayBufferTargetWriter(options.target));
    } else if (options.target instanceof StreamTarget) {
      __privateSet(this, _writer, new StreamTargetWriter(options.target));
    } else if (options.target instanceof FileSystemWritableFileStreamTarget) {
      __privateSet(this, _writer, new FileSystemWritableFileStreamTargetWriter(options.target));
    } else {
      throw new Error(`Invalid target: ${options.target}`);
    }
    __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
    __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
  }
  addVideoChunk(sample, meta, timestamp, compositionTimeOffset) {
    if (!(sample instanceof EncodedVideoChunk)) {
      throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
    }
    if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
      throw new TypeError(
        "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
      );
    }
    if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
      throw new TypeError(
        "addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number."
      );
    }
    let data = new Uint8Array(sample.byteLength);
    sample.copyTo(data);
    this.addVideoChunkRaw(
      data,
      sample.type,
      timestamp ?? sample.timestamp,
      sample.duration,
      meta,
      compositionTimeOffset
    );
  }
  addVideoChunkRaw(data, type, timestamp, duration, meta, compositionTimeOffset) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");
    }
    if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
      throw new TypeError(
        "addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number."
      );
    }
    __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
    if (!__privateGet(this, _options).video)
      throw new Error("No video track declared.");
    if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _videoTrack).samples.length === __privateGet(this, _options).fastStart.expectedVideoChunks) {
      throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedVideoChunks}).`);
    }
    let videoSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _videoTrack), data, type, timestamp, duration, meta, compositionTimeOffset);
    if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _audioTrack)) {
      while (__privateGet(this, _audioSampleQueue).length > 0 && __privateGet(this, _audioSampleQueue)[0].decodeTimestamp <= videoSample.decodeTimestamp) {
        let audioSample = __privateGet(this, _audioSampleQueue).shift();
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      }
      if (videoSample.decodeTimestamp <= __privateGet(this, _audioTrack).lastDecodeTimestamp) {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      } else {
        __privateGet(this, _videoSampleQueue).push(videoSample);
      }
    } else {
      __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
    }
  }
  addAudioChunk(sample, meta, timestamp) {
    if (!(sample instanceof EncodedAudioChunk)) {
      throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
    }
    if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
      throw new TypeError(
        "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
      );
    }
    let data = new Uint8Array(sample.byteLength);
    sample.copyTo(data);
    this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
  }
  addAudioChunkRaw(data, type, timestamp, duration, meta) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");
    }
    __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
    if (!__privateGet(this, _options).audio)
      throw new Error("No audio track declared.");
    if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _audioTrack).samples.length === __privateGet(this, _options).fastStart.expectedAudioChunks) {
      throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedAudioChunks}).`);
    }
    let audioSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _audioTrack), data, type, timestamp, duration, meta);
    if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _videoTrack)) {
      while (__privateGet(this, _videoSampleQueue).length > 0 && __privateGet(this, _videoSampleQueue)[0].decodeTimestamp <= audioSample.decodeTimestamp) {
        let videoSample = __privateGet(this, _videoSampleQueue).shift();
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      }
      if (audioSample.decodeTimestamp <= __privateGet(this, _videoTrack).lastDecodeTimestamp) {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      } else {
        __privateGet(this, _audioSampleQueue).push(audioSample);
      }
    } else {
      __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
    }
  }
  /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
  finalize() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot finalize a muxer more than once.");
    }
    if (__privateGet(this, _options).fastStart === "fragmented") {
      for (let videoSample of __privateGet(this, _videoSampleQueue))
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      for (let audioSample of __privateGet(this, _audioSampleQueue))
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this, false);
    } else {
      if (__privateGet(this, _videoTrack))
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
      if (__privateGet(this, _audioTrack))
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
    }
    let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter(Boolean);
    if (__privateGet(this, _options).fastStart === "in-memory") {
      let mdatSize;
      for (let i = 0; i < 2; i++) {
        let movieBox2 = moov(tracks, __privateGet(this, _creationTime));
        let movieBoxSize = __privateGet(this, _writer).measureBox(movieBox2);
        mdatSize = __privateGet(this, _writer).measureBox(__privateGet(this, _mdat));
        let currentChunkPos = __privateGet(this, _writer).pos + movieBoxSize + mdatSize;
        for (let chunk of __privateGet(this, _finalizedChunks)) {
          chunk.offset = currentChunkPos;
          for (let { data } of chunk.samples) {
            currentChunkPos += data.byteLength;
            mdatSize += data.byteLength;
          }
        }
        if (currentChunkPos < 2 ** 32)
          break;
        if (mdatSize >= 2 ** 32)
          __privateGet(this, _mdat).largeSize = true;
      }
      let movieBox = moov(tracks, __privateGet(this, _creationTime));
      __privateGet(this, _writer).writeBox(movieBox);
      __privateGet(this, _mdat).size = mdatSize;
      __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
      for (let chunk of __privateGet(this, _finalizedChunks)) {
        for (let sample of chunk.samples) {
          __privateGet(this, _writer).write(sample.data);
          sample.data = null;
        }
      }
    } else if (__privateGet(this, _options).fastStart === "fragmented") {
      let startPos = __privateGet(this, _writer).pos;
      let mfraBox = mfra(tracks);
      __privateGet(this, _writer).writeBox(mfraBox);
      let mfraBoxSize = __privateGet(this, _writer).pos - startPos;
      __privateGet(this, _writer).seek(__privateGet(this, _writer).pos - 4);
      __privateGet(this, _writer).writeU32(mfraBoxSize);
    } else {
      let mdatPos = __privateGet(this, _writer).offsets.get(__privateGet(this, _mdat));
      let mdatSize = __privateGet(this, _writer).pos - mdatPos;
      __privateGet(this, _mdat).size = mdatSize;
      __privateGet(this, _mdat).largeSize = mdatSize >= 2 ** 32;
      __privateGet(this, _writer).patchBox(__privateGet(this, _mdat));
      let movieBox = moov(tracks, __privateGet(this, _creationTime));
      if (typeof __privateGet(this, _options).fastStart === "object") {
        __privateGet(this, _writer).seek(__privateGet(this, _ftypSize));
        __privateGet(this, _writer).writeBox(movieBox);
        let remainingBytes = mdatPos - __privateGet(this, _writer).pos;
        __privateGet(this, _writer).writeBox(free(remainingBytes));
      } else {
        __privateGet(this, _writer).writeBox(movieBox);
      }
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
    __privateGet(this, _writer).finalize();
    __privateSet(this, _finalized, true);
  }
};
_options = /* @__PURE__ */ new WeakMap();
_writer = /* @__PURE__ */ new WeakMap();
_ftypSize = /* @__PURE__ */ new WeakMap();
_mdat = /* @__PURE__ */ new WeakMap();
_videoTrack = /* @__PURE__ */ new WeakMap();
_audioTrack = /* @__PURE__ */ new WeakMap();
_creationTime = /* @__PURE__ */ new WeakMap();
_finalizedChunks = /* @__PURE__ */ new WeakMap();
_nextFragmentNumber = /* @__PURE__ */ new WeakMap();
_videoSampleQueue = /* @__PURE__ */ new WeakMap();
_audioSampleQueue = /* @__PURE__ */ new WeakMap();
_finalized = /* @__PURE__ */ new WeakMap();
_validateOptions = /* @__PURE__ */ new WeakSet();
validateOptions_fn = function(options) {
  if (typeof options !== "object") {
    throw new TypeError("The muxer requires an options object to be passed to its constructor.");
  }
  if (!(options.target instanceof Target)) {
    throw new TypeError("The target must be provided and an instance of Target.");
  }
  if (options.video) {
    if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
      throw new TypeError(`Unsupported video codec: ${options.video.codec}`);
    }
    if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
      throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
    }
    if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
      throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
    }
    const videoRotation = options.video.rotation;
    if (typeof videoRotation === "number" && ![0, 90, 180, 270].includes(videoRotation)) {
      throw new TypeError(`Invalid video rotation: ${videoRotation}. Has to be 0, 90, 180 or 270.`);
    } else if (Array.isArray(videoRotation) && (videoRotation.length !== 9 || videoRotation.some((value) => typeof value !== "number"))) {
      throw new TypeError(`Invalid video transformation matrix: ${videoRotation.join()}`);
    }
    if (options.video.frameRate !== void 0 && (!Number.isInteger(options.video.frameRate) || options.video.frameRate <= 0)) {
      throw new TypeError(
        `Invalid video frame rate: ${options.video.frameRate}. Must be a positive integer.`
      );
    }
  }
  if (options.audio) {
    if (!SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
      throw new TypeError(`Unsupported audio codec: ${options.audio.codec}`);
    }
    if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
      throw new TypeError(
        `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
      );
    }
    if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
      throw new TypeError(
        `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
      );
    }
  }
  if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
    throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
  }
  if (typeof options.fastStart === "object") {
    if (options.video) {
      if (options.fastStart.expectedVideoChunks === void 0) {
        throw new TypeError(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
      } else if (!Number.isInteger(options.fastStart.expectedVideoChunks) || options.fastStart.expectedVideoChunks < 0) {
        throw new TypeError(`'expectedVideoChunks' must be a non-negative integer.`);
      }
    }
    if (options.audio) {
      if (options.fastStart.expectedAudioChunks === void 0) {
        throw new TypeError(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
      } else if (!Number.isInteger(options.fastStart.expectedAudioChunks) || options.fastStart.expectedAudioChunks < 0) {
        throw new TypeError(`'expectedAudioChunks' must be a non-negative integer.`);
      }
    }
  } else if (![false, "in-memory", "fragmented"].includes(options.fastStart)) {
    throw new TypeError(`'fastStart' option must be false, 'in-memory', 'fragmented' or an object.`);
  }
  if (options.minFragmentDuration !== void 0 && (!Number.isFinite(options.minFragmentDuration) || options.minFragmentDuration < 0)) {
    throw new TypeError(`'minFragmentDuration' must be a non-negative number.`);
  }
};
_writeHeader = /* @__PURE__ */ new WeakSet();
writeHeader_fn = function() {
  __privateGet(this, _writer).writeBox(ftyp({
    holdsAvc: __privateGet(this, _options).video?.codec === "avc",
    fragmented: __privateGet(this, _options).fastStart === "fragmented"
  }));
  __privateSet(this, _ftypSize, __privateGet(this, _writer).pos);
  if (__privateGet(this, _options).fastStart === "in-memory") {
    __privateSet(this, _mdat, mdat(false));
  } else if (__privateGet(this, _options).fastStart === "fragmented") {
  } else {
    if (typeof __privateGet(this, _options).fastStart === "object") {
      let moovSizeUpperBound = __privateMethod(this, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn).call(this);
      __privateGet(this, _writer).seek(__privateGet(this, _writer).pos + moovSizeUpperBound);
    }
    __privateSet(this, _mdat, mdat(true));
    __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
  }
  __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
};
_computeMoovSizeUpperBound = /* @__PURE__ */ new WeakSet();
computeMoovSizeUpperBound_fn = function() {
  if (typeof __privateGet(this, _options).fastStart !== "object")
    return;
  let upperBound = 0;
  let sampleCounts = [
    __privateGet(this, _options).fastStart.expectedVideoChunks,
    __privateGet(this, _options).fastStart.expectedAudioChunks
  ];
  for (let n of sampleCounts) {
    if (!n)
      continue;
    upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
    upperBound += 4 * n;
    upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
    upperBound += 4 * n;
    upperBound += 8 * n;
  }
  upperBound += 4096;
  return upperBound;
};
_prepareTracks = /* @__PURE__ */ new WeakSet();
prepareTracks_fn = function() {
  if (__privateGet(this, _options).video) {
    __privateSet(this, _videoTrack, {
      id: 1,
      info: {
        type: "video",
        codec: __privateGet(this, _options).video.codec,
        width: __privateGet(this, _options).video.width,
        height: __privateGet(this, _options).video.height,
        rotation: __privateGet(this, _options).video.rotation ?? 0,
        decoderConfig: null
      },
      // The fallback contains many common frame rates as factors
      timescale: __privateGet(this, _options).video.frameRate ?? 57600,
      samples: [],
      finalizedChunks: [],
      currentChunk: null,
      firstDecodeTimestamp: void 0,
      lastDecodeTimestamp: -1,
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      compactlyCodedChunkTable: []
    });
  }
  if (__privateGet(this, _options).audio) {
    __privateSet(this, _audioTrack, {
      id: __privateGet(this, _options).video ? 2 : 1,
      info: {
        type: "audio",
        codec: __privateGet(this, _options).audio.codec,
        numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
        sampleRate: __privateGet(this, _options).audio.sampleRate,
        decoderConfig: null
      },
      timescale: __privateGet(this, _options).audio.sampleRate,
      samples: [],
      finalizedChunks: [],
      currentChunk: null,
      firstDecodeTimestamp: void 0,
      lastDecodeTimestamp: -1,
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      compactlyCodedChunkTable: []
    });
    if (__privateGet(this, _options).audio.codec === "aac") {
      let guessedCodecPrivate = __privateMethod(this, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn).call(
        this,
        2,
        // Object type for AAC-LC, since it's the most common
        __privateGet(this, _options).audio.sampleRate,
        __privateGet(this, _options).audio.numberOfChannels
      );
      __privateGet(this, _audioTrack).info.decoderConfig = {
        codec: __privateGet(this, _options).audio.codec,
        description: guessedCodecPrivate,
        numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
        sampleRate: __privateGet(this, _options).audio.sampleRate
      };
    }
  }
};
_generateMpeg4AudioSpecificConfig = /* @__PURE__ */ new WeakSet();
generateMpeg4AudioSpecificConfig_fn = function(objectType, sampleRate, numberOfChannels) {
  let frequencyIndices = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
  let frequencyIndex = frequencyIndices.indexOf(sampleRate);
  let channelConfig = numberOfChannels;
  let configBits = "";
  configBits += objectType.toString(2).padStart(5, "0");
  configBits += frequencyIndex.toString(2).padStart(4, "0");
  if (frequencyIndex === 15)
    configBits += sampleRate.toString(2).padStart(24, "0");
  configBits += channelConfig.toString(2).padStart(4, "0");
  let paddingLength = Math.ceil(configBits.length / 8) * 8;
  configBits = configBits.padEnd(paddingLength, "0");
  let configBytes = new Uint8Array(configBits.length / 8);
  for (let i = 0; i < configBits.length; i += 8) {
    configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
  }
  return configBytes;
};
_createSampleForTrack = /* @__PURE__ */ new WeakSet();
createSampleForTrack_fn = function(track, data, type, timestamp, duration, meta, compositionTimeOffset) {
  let presentationTimestampInSeconds = timestamp / 1e6;
  let decodeTimestampInSeconds = (timestamp - (compositionTimeOffset ?? 0)) / 1e6;
  let durationInSeconds = duration / 1e6;
  let adjusted = __privateMethod(this, _validateTimestamp, validateTimestamp_fn).call(this, presentationTimestampInSeconds, decodeTimestampInSeconds, track);
  presentationTimestampInSeconds = adjusted.presentationTimestamp;
  decodeTimestampInSeconds = adjusted.decodeTimestamp;
  if (meta?.decoderConfig) {
    if (track.info.decoderConfig === null) {
      track.info.decoderConfig = meta.decoderConfig;
    } else {
      Object.assign(track.info.decoderConfig, meta.decoderConfig);
    }
  }
  let sample = {
    presentationTimestamp: presentationTimestampInSeconds,
    decodeTimestamp: decodeTimestampInSeconds,
    duration: durationInSeconds,
    data,
    size: data.byteLength,
    type,
    // Will be refined once the next sample comes in
    timescaleUnitsToNextSample: intoTimescale(durationInSeconds, track.timescale)
  };
  return sample;
};
_addSampleToTrack = /* @__PURE__ */ new WeakSet();
addSampleToTrack_fn = function(track, sample) {
  if (__privateGet(this, _options).fastStart !== "fragmented") {
    track.samples.push(sample);
  }
  const sampleCompositionTimeOffset = intoTimescale(sample.presentationTimestamp - sample.decodeTimestamp, track.timescale);
  if (track.lastTimescaleUnits !== null) {
    let timescaleUnits = intoTimescale(sample.decodeTimestamp, track.timescale, false);
    let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
    track.lastTimescaleUnits += delta;
    track.lastSample.timescaleUnitsToNextSample = delta;
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      let lastTableEntry = last(track.timeToSampleTable);
      if (lastTableEntry.sampleCount === 1) {
        lastTableEntry.sampleDelta = delta;
        lastTableEntry.sampleCount++;
      } else if (lastTableEntry.sampleDelta === delta) {
        lastTableEntry.sampleCount++;
      } else {
        lastTableEntry.sampleCount--;
        track.timeToSampleTable.push({
          sampleCount: 2,
          sampleDelta: delta
        });
      }
      const lastCompositionTimeOffsetTableEntry = last(track.compositionTimeOffsetTable);
      if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
        lastCompositionTimeOffsetTableEntry.sampleCount++;
      } else {
        track.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset
        });
      }
    }
  } else {
    track.lastTimescaleUnits = 0;
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      track.timeToSampleTable.push({
        sampleCount: 1,
        sampleDelta: intoTimescale(sample.duration, track.timescale)
      });
      track.compositionTimeOffsetTable.push({
        sampleCount: 1,
        sampleCompositionTimeOffset
      });
    }
  }
  track.lastSample = sample;
  let beginNewChunk = false;
  if (!track.currentChunk) {
    beginNewChunk = true;
  } else {
    let currentChunkDuration = sample.presentationTimestamp - track.currentChunk.startTimestamp;
    if (__privateGet(this, _options).fastStart === "fragmented") {
      let mostImportantTrack = __privateGet(this, _videoTrack) ?? __privateGet(this, _audioTrack);
      const chunkDuration = __privateGet(this, _options).minFragmentDuration ?? 1;
      if (track === mostImportantTrack && sample.type === "key" && currentChunkDuration >= chunkDuration) {
        beginNewChunk = true;
        __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this);
      }
    } else {
      beginNewChunk = currentChunkDuration >= 0.5;
    }
  }
  if (beginNewChunk) {
    if (track.currentChunk) {
      __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, track);
    }
    track.currentChunk = {
      startTimestamp: sample.presentationTimestamp,
      samples: []
    };
  }
  track.currentChunk.samples.push(sample);
};
_validateTimestamp = /* @__PURE__ */ new WeakSet();
validateTimestamp_fn = function(presentationTimestamp, decodeTimestamp, track) {
  const strictTimestampBehavior = __privateGet(this, _options).firstTimestampBehavior === "strict";
  const noLastDecodeTimestamp = track.lastDecodeTimestamp === -1;
  const timestampNonZero = decodeTimestamp !== 0;
  if (strictTimestampBehavior && noLastDecodeTimestamp && timestampNonZero) {
    throw new Error(
      `The first chunk for your media track must have a timestamp of 0 (received DTS=${decodeTimestamp}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`
    );
  } else if (__privateGet(this, _options).firstTimestampBehavior === "offset" || __privateGet(this, _options).firstTimestampBehavior === "cross-track-offset") {
    if (track.firstDecodeTimestamp === void 0) {
      track.firstDecodeTimestamp = decodeTimestamp;
    }
    let baseDecodeTimestamp;
    if (__privateGet(this, _options).firstTimestampBehavior === "offset") {
      baseDecodeTimestamp = track.firstDecodeTimestamp;
    } else {
      baseDecodeTimestamp = Math.min(
        __privateGet(this, _videoTrack)?.firstDecodeTimestamp ?? Infinity,
        __privateGet(this, _audioTrack)?.firstDecodeTimestamp ?? Infinity
      );
    }
    decodeTimestamp -= baseDecodeTimestamp;
    presentationTimestamp -= baseDecodeTimestamp;
  }
  if (decodeTimestamp < track.lastDecodeTimestamp) {
    throw new Error(
      `Timestamps must be monotonically increasing (DTS went from ${track.lastDecodeTimestamp * 1e6} to ${decodeTimestamp * 1e6}).`
    );
  }
  track.lastDecodeTimestamp = decodeTimestamp;
  return { presentationTimestamp, decodeTimestamp };
};
_finalizeCurrentChunk = /* @__PURE__ */ new WeakSet();
finalizeCurrentChunk_fn = function(track) {
  if (__privateGet(this, _options).fastStart === "fragmented") {
    throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");
  }
  if (!track.currentChunk)
    return;
  track.finalizedChunks.push(track.currentChunk);
  __privateGet(this, _finalizedChunks).push(track.currentChunk);
  if (track.compactlyCodedChunkTable.length === 0 || last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.samples.length) {
    track.compactlyCodedChunkTable.push({
      firstChunk: track.finalizedChunks.length,
      // 1-indexed
      samplesPerChunk: track.currentChunk.samples.length
    });
  }
  if (__privateGet(this, _options).fastStart === "in-memory") {
    track.currentChunk.offset = 0;
    return;
  }
  track.currentChunk.offset = __privateGet(this, _writer).pos;
  for (let sample of track.currentChunk.samples) {
    __privateGet(this, _writer).write(sample.data);
    sample.data = null;
  }
  __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
};
_finalizeFragment = /* @__PURE__ */ new WeakSet();
finalizeFragment_fn = function(flushStreamingWriter = true) {
  if (__privateGet(this, _options).fastStart !== "fragmented") {
    throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");
  }
  let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter((track) => track && track.currentChunk);
  if (tracks.length === 0)
    return;
  let fragmentNumber = __privateWrapper(this, _nextFragmentNumber)._++;
  if (fragmentNumber === 1) {
    let movieBox = moov(tracks, __privateGet(this, _creationTime), true);
    __privateGet(this, _writer).writeBox(movieBox);
  }
  let moofOffset = __privateGet(this, _writer).pos;
  let moofBox = moof(fragmentNumber, tracks);
  __privateGet(this, _writer).writeBox(moofBox);
  {
    let mdatBox = mdat(false);
    let totalTrackSampleSize = 0;
    for (let track of tracks) {
      for (let sample of track.currentChunk.samples) {
        totalTrackSampleSize += sample.size;
      }
    }
    let mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
    if (mdatSize >= 2 ** 32) {
      mdatBox.largeSize = true;
      mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
    }
    mdatBox.size = mdatSize;
    __privateGet(this, _writer).writeBox(mdatBox);
  }
  for (let track of tracks) {
    track.currentChunk.offset = __privateGet(this, _writer).pos;
    track.currentChunk.moofOffset = moofOffset;
    for (let sample of track.currentChunk.samples) {
      __privateGet(this, _writer).write(sample.data);
      sample.data = null;
    }
  }
  let endPos = __privateGet(this, _writer).pos;
  __privateGet(this, _writer).seek(__privateGet(this, _writer).offsets.get(moofBox));
  let newMoofBox = moof(fragmentNumber, tracks);
  __privateGet(this, _writer).writeBox(newMoofBox);
  __privateGet(this, _writer).seek(endPos);
  for (let track of tracks) {
    track.finalizedChunks.push(track.currentChunk);
    __privateGet(this, _finalizedChunks).push(track.currentChunk);
    track.currentChunk = null;
  }
  if (flushStreamingWriter) {
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  }
};
_maybeFlushStreamingTargetWriter = /* @__PURE__ */ new WeakSet();
maybeFlushStreamingTargetWriter_fn = function() {
  if (__privateGet(this, _writer) instanceof StreamTargetWriter) {
    __privateGet(this, _writer).flush();
  }
};
_ensureNotFinalized = /* @__PURE__ */ new WeakSet();
ensureNotFinalized_fn = function() {
  if (__privateGet(this, _finalized)) {
    throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
  }
};

// node_modules/webm-muxer/build/webm-muxer.mjs
var __accessCheck2 = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet2 = (obj, member, getter) => {
  __accessCheck2(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd2 = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet2 = (obj, member, value, setter) => {
  __accessCheck2(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod2 = (obj, member, method) => {
  __accessCheck2(obj, member, "access private method");
  return method;
};
var EBMLFloat32 = class {
  constructor(value) {
    this.value = value;
  }
};
var EBMLFloat64 = class {
  constructor(value) {
    this.value = value;
  }
};
var measureUnsignedInt = (value) => {
  if (value < 1 << 8) {
    return 1;
  } else if (value < 1 << 16) {
    return 2;
  } else if (value < 1 << 24) {
    return 3;
  } else if (value < 2 ** 32) {
    return 4;
  } else if (value < 2 ** 40) {
    return 5;
  } else {
    return 6;
  }
};
var measureEBMLVarInt = (value) => {
  if (value < (1 << 7) - 1) {
    return 1;
  } else if (value < (1 << 14) - 1) {
    return 2;
  } else if (value < (1 << 21) - 1) {
    return 3;
  } else if (value < (1 << 28) - 1) {
    return 4;
  } else if (value < 2 ** 35 - 1) {
    return 5;
  } else if (value < 2 ** 42 - 1) {
    return 6;
  } else {
    throw new Error("EBML VINT size not supported " + value);
  }
};
var readBits = (bytes2, start, end) => {
  let result = 0;
  for (let i = start; i < end; i++) {
    let byteIndex = Math.floor(i / 8);
    let byte = bytes2[byteIndex];
    let bitIndex = 7 - (i & 7);
    let bit = (byte & 1 << bitIndex) >> bitIndex;
    result <<= 1;
    result |= bit;
  }
  return result;
};
var writeBits = (bytes2, start, end, value) => {
  for (let i = start; i < end; i++) {
    let byteIndex = Math.floor(i / 8);
    let byte = bytes2[byteIndex];
    let bitIndex = 7 - (i & 7);
    byte &= ~(1 << bitIndex);
    byte |= (value & 1 << end - i - 1) >> end - i - 1 << bitIndex;
    bytes2[byteIndex] = byte;
  }
};
var Target2 = class {
};
var ArrayBufferTarget2 = class extends Target2 {
  constructor() {
    super(...arguments);
    this.buffer = null;
  }
};
var StreamTarget2 = class extends Target2 {
  constructor(options) {
    super();
    this.options = options;
    if (typeof options !== "object") {
      throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
    }
    if (options.onData) {
      if (typeof options.onData !== "function") {
        throw new TypeError("options.onData, when provided, must be a function.");
      }
      if (options.onData.length < 2) {
        throw new TypeError(
          "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
        );
      }
    }
    if (options.onHeader && typeof options.onHeader !== "function") {
      throw new TypeError("options.onHeader, when provided, must be a function.");
    }
    if (options.onCluster && typeof options.onCluster !== "function") {
      throw new TypeError("options.onCluster, when provided, must be a function.");
    }
    if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
      throw new TypeError("options.chunked, when provided, must be a boolean.");
    }
    if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
      throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
    }
  }
};
var FileSystemWritableFileStreamTarget2 = class extends Target2 {
  constructor(stream, options) {
    super();
    this.stream = stream;
    this.options = options;
    if (!(stream instanceof FileSystemWritableFileStream)) {
      throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
    }
    if (options !== void 0 && typeof options !== "object") {
      throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
    }
    if (options) {
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
        throw new TypeError("options.chunkSize, when provided, must be a positive integer");
      }
    }
  }
};
var _helper2;
var _helperView2;
var _writeByte;
var writeByte_fn;
var _writeFloat32;
var writeFloat32_fn;
var _writeFloat64;
var writeFloat64_fn;
var _writeUnsignedInt;
var writeUnsignedInt_fn;
var _writeString;
var writeString_fn;
var Writer2 = class {
  constructor() {
    __privateAdd2(this, _writeByte);
    __privateAdd2(this, _writeFloat32);
    __privateAdd2(this, _writeFloat64);
    __privateAdd2(this, _writeUnsignedInt);
    __privateAdd2(this, _writeString);
    this.pos = 0;
    __privateAdd2(this, _helper2, new Uint8Array(8));
    __privateAdd2(this, _helperView2, new DataView(__privateGet2(this, _helper2).buffer));
    this.offsets = /* @__PURE__ */ new WeakMap();
    this.dataOffsets = /* @__PURE__ */ new WeakMap();
  }
  seek(newPos) {
    this.pos = newPos;
  }
  writeEBMLVarInt(value, width = measureEBMLVarInt(value)) {
    let pos = 0;
    switch (width) {
      case 1:
        __privateGet2(this, _helperView2).setUint8(pos++, 1 << 7 | value);
        break;
      case 2:
        __privateGet2(this, _helperView2).setUint8(pos++, 1 << 6 | value >> 8);
        __privateGet2(this, _helperView2).setUint8(pos++, value);
        break;
      case 3:
        __privateGet2(this, _helperView2).setUint8(pos++, 1 << 5 | value >> 16);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 8);
        __privateGet2(this, _helperView2).setUint8(pos++, value);
        break;
      case 4:
        __privateGet2(this, _helperView2).setUint8(pos++, 1 << 4 | value >> 24);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 16);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 8);
        __privateGet2(this, _helperView2).setUint8(pos++, value);
        break;
      case 5:
        __privateGet2(this, _helperView2).setUint8(pos++, 1 << 3 | value / 2 ** 32 & 7);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 24);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 16);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 8);
        __privateGet2(this, _helperView2).setUint8(pos++, value);
        break;
      case 6:
        __privateGet2(this, _helperView2).setUint8(pos++, 1 << 2 | value / 2 ** 40 & 3);
        __privateGet2(this, _helperView2).setUint8(pos++, value / 2 ** 32 | 0);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 24);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 16);
        __privateGet2(this, _helperView2).setUint8(pos++, value >> 8);
        __privateGet2(this, _helperView2).setUint8(pos++, value);
        break;
      default:
        throw new Error("Bad EBML VINT size " + width);
    }
    this.write(__privateGet2(this, _helper2).subarray(0, pos));
  }
  writeEBML(data) {
    if (data === null)
      return;
    if (data instanceof Uint8Array) {
      this.write(data);
    } else if (Array.isArray(data)) {
      for (let elem of data) {
        this.writeEBML(elem);
      }
    } else {
      this.offsets.set(data, this.pos);
      __privateMethod2(this, _writeUnsignedInt, writeUnsignedInt_fn).call(this, data.id);
      if (Array.isArray(data.data)) {
        let sizePos = this.pos;
        let sizeSize = data.size === -1 ? 1 : data.size ?? 4;
        if (data.size === -1) {
          __privateMethod2(this, _writeByte, writeByte_fn).call(this, 255);
        } else {
          this.seek(this.pos + sizeSize);
        }
        let startPos = this.pos;
        this.dataOffsets.set(data, startPos);
        this.writeEBML(data.data);
        if (data.size !== -1) {
          let size = this.pos - startPos;
          let endPos = this.pos;
          this.seek(sizePos);
          this.writeEBMLVarInt(size, sizeSize);
          this.seek(endPos);
        }
      } else if (typeof data.data === "number") {
        let size = data.size ?? measureUnsignedInt(data.data);
        this.writeEBMLVarInt(size);
        __privateMethod2(this, _writeUnsignedInt, writeUnsignedInt_fn).call(this, data.data, size);
      } else if (typeof data.data === "string") {
        this.writeEBMLVarInt(data.data.length);
        __privateMethod2(this, _writeString, writeString_fn).call(this, data.data);
      } else if (data.data instanceof Uint8Array) {
        this.writeEBMLVarInt(data.data.byteLength, data.size);
        this.write(data.data);
      } else if (data.data instanceof EBMLFloat32) {
        this.writeEBMLVarInt(4);
        __privateMethod2(this, _writeFloat32, writeFloat32_fn).call(this, data.data.value);
      } else if (data.data instanceof EBMLFloat64) {
        this.writeEBMLVarInt(8);
        __privateMethod2(this, _writeFloat64, writeFloat64_fn).call(this, data.data.value);
      }
    }
  }
};
_helper2 = /* @__PURE__ */ new WeakMap();
_helperView2 = /* @__PURE__ */ new WeakMap();
_writeByte = /* @__PURE__ */ new WeakSet();
writeByte_fn = function(value) {
  __privateGet2(this, _helperView2).setUint8(0, value);
  this.write(__privateGet2(this, _helper2).subarray(0, 1));
};
_writeFloat32 = /* @__PURE__ */ new WeakSet();
writeFloat32_fn = function(value) {
  __privateGet2(this, _helperView2).setFloat32(0, value, false);
  this.write(__privateGet2(this, _helper2).subarray(0, 4));
};
_writeFloat64 = /* @__PURE__ */ new WeakSet();
writeFloat64_fn = function(value) {
  __privateGet2(this, _helperView2).setFloat64(0, value, false);
  this.write(__privateGet2(this, _helper2));
};
_writeUnsignedInt = /* @__PURE__ */ new WeakSet();
writeUnsignedInt_fn = function(value, width = measureUnsignedInt(value)) {
  let pos = 0;
  switch (width) {
    case 6:
      __privateGet2(this, _helperView2).setUint8(pos++, value / 2 ** 40 | 0);
    case 5:
      __privateGet2(this, _helperView2).setUint8(pos++, value / 2 ** 32 | 0);
    case 4:
      __privateGet2(this, _helperView2).setUint8(pos++, value >> 24);
    case 3:
      __privateGet2(this, _helperView2).setUint8(pos++, value >> 16);
    case 2:
      __privateGet2(this, _helperView2).setUint8(pos++, value >> 8);
    case 1:
      __privateGet2(this, _helperView2).setUint8(pos++, value);
      break;
    default:
      throw new Error("Bad UINT size " + width);
  }
  this.write(__privateGet2(this, _helper2).subarray(0, pos));
};
_writeString = /* @__PURE__ */ new WeakSet();
writeString_fn = function(str) {
  this.write(new Uint8Array(str.split("").map((x) => x.charCodeAt(0))));
};
var _target3;
var _buffer2;
var _bytes2;
var _ensureSize2;
var ensureSize_fn2;
var ArrayBufferTargetWriter2 = class extends Writer2 {
  constructor(target) {
    super();
    __privateAdd2(this, _ensureSize2);
    __privateAdd2(this, _target3, void 0);
    __privateAdd2(this, _buffer2, new ArrayBuffer(2 ** 16));
    __privateAdd2(this, _bytes2, new Uint8Array(__privateGet2(this, _buffer2)));
    __privateSet2(this, _target3, target);
  }
  write(data) {
    __privateMethod2(this, _ensureSize2, ensureSize_fn2).call(this, this.pos + data.byteLength);
    __privateGet2(this, _bytes2).set(data, this.pos);
    this.pos += data.byteLength;
  }
  finalize() {
    __privateMethod2(this, _ensureSize2, ensureSize_fn2).call(this, this.pos);
    __privateGet2(this, _target3).buffer = __privateGet2(this, _buffer2).slice(0, this.pos);
  }
};
_target3 = /* @__PURE__ */ new WeakMap();
_buffer2 = /* @__PURE__ */ new WeakMap();
_bytes2 = /* @__PURE__ */ new WeakMap();
_ensureSize2 = /* @__PURE__ */ new WeakSet();
ensureSize_fn2 = function(size) {
  let newLength = __privateGet2(this, _buffer2).byteLength;
  while (newLength < size)
    newLength *= 2;
  if (newLength === __privateGet2(this, _buffer2).byteLength)
    return;
  let newBuffer = new ArrayBuffer(newLength);
  let newBytes = new Uint8Array(newBuffer);
  newBytes.set(__privateGet2(this, _bytes2), 0);
  __privateSet2(this, _buffer2, newBuffer);
  __privateSet2(this, _bytes2, newBytes);
};
var _trackingWrites;
var _trackedWrites;
var _trackedStart;
var _trackedEnd;
var BaseStreamTargetWriter = class extends Writer2 {
  constructor(target) {
    super();
    this.target = target;
    __privateAdd2(this, _trackingWrites, false);
    __privateAdd2(this, _trackedWrites, void 0);
    __privateAdd2(this, _trackedStart, void 0);
    __privateAdd2(this, _trackedEnd, void 0);
  }
  write(data) {
    if (!__privateGet2(this, _trackingWrites))
      return;
    let pos = this.pos;
    if (pos < __privateGet2(this, _trackedStart)) {
      if (pos + data.byteLength <= __privateGet2(this, _trackedStart))
        return;
      data = data.subarray(__privateGet2(this, _trackedStart) - pos);
      pos = 0;
    }
    let neededSize = pos + data.byteLength - __privateGet2(this, _trackedStart);
    let newLength = __privateGet2(this, _trackedWrites).byteLength;
    while (newLength < neededSize)
      newLength *= 2;
    if (newLength !== __privateGet2(this, _trackedWrites).byteLength) {
      let copy = new Uint8Array(newLength);
      copy.set(__privateGet2(this, _trackedWrites), 0);
      __privateSet2(this, _trackedWrites, copy);
    }
    __privateGet2(this, _trackedWrites).set(data, pos - __privateGet2(this, _trackedStart));
    __privateSet2(this, _trackedEnd, Math.max(__privateGet2(this, _trackedEnd), pos + data.byteLength));
  }
  startTrackingWrites() {
    __privateSet2(this, _trackingWrites, true);
    __privateSet2(this, _trackedWrites, new Uint8Array(2 ** 10));
    __privateSet2(this, _trackedStart, this.pos);
    __privateSet2(this, _trackedEnd, this.pos);
  }
  getTrackedWrites() {
    if (!__privateGet2(this, _trackingWrites)) {
      throw new Error("Can't get tracked writes since nothing was tracked.");
    }
    let slice = __privateGet2(this, _trackedWrites).subarray(0, __privateGet2(this, _trackedEnd) - __privateGet2(this, _trackedStart));
    let result = {
      data: slice,
      start: __privateGet2(this, _trackedStart),
      end: __privateGet2(this, _trackedEnd)
    };
    __privateSet2(this, _trackedWrites, void 0);
    __privateSet2(this, _trackingWrites, false);
    return result;
  }
};
_trackingWrites = /* @__PURE__ */ new WeakMap();
_trackedWrites = /* @__PURE__ */ new WeakMap();
_trackedStart = /* @__PURE__ */ new WeakMap();
_trackedEnd = /* @__PURE__ */ new WeakMap();
var DEFAULT_CHUNK_SIZE2 = 2 ** 24;
var MAX_CHUNKS_AT_ONCE2 = 2;
var _sections2;
var _lastFlushEnd;
var _ensureMonotonicity;
var _chunked2;
var _chunkSize2;
var _chunks2;
var _writeDataIntoChunks2;
var writeDataIntoChunks_fn2;
var _insertSectionIntoChunk2;
var insertSectionIntoChunk_fn2;
var _createChunk2;
var createChunk_fn2;
var _flushChunks2;
var flushChunks_fn2;
var StreamTargetWriter2 = class extends BaseStreamTargetWriter {
  constructor(target, ensureMonotonicity) {
    super(target);
    __privateAdd2(this, _writeDataIntoChunks2);
    __privateAdd2(this, _insertSectionIntoChunk2);
    __privateAdd2(this, _createChunk2);
    __privateAdd2(this, _flushChunks2);
    __privateAdd2(this, _sections2, []);
    __privateAdd2(this, _lastFlushEnd, 0);
    __privateAdd2(this, _ensureMonotonicity, void 0);
    __privateAdd2(this, _chunked2, void 0);
    __privateAdd2(this, _chunkSize2, void 0);
    __privateAdd2(this, _chunks2, []);
    __privateSet2(this, _ensureMonotonicity, ensureMonotonicity);
    __privateSet2(this, _chunked2, target.options?.chunked ?? false);
    __privateSet2(this, _chunkSize2, target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE2);
  }
  write(data) {
    super.write(data);
    __privateGet2(this, _sections2).push({
      data: data.slice(),
      start: this.pos
    });
    this.pos += data.byteLength;
  }
  flush() {
    if (__privateGet2(this, _sections2).length === 0)
      return;
    let chunks = [];
    let sorted = [...__privateGet2(this, _sections2)].sort((a, b) => a.start - b.start);
    chunks.push({
      start: sorted[0].start,
      size: sorted[0].data.byteLength
    });
    for (let i = 1; i < sorted.length; i++) {
      let lastChunk = chunks[chunks.length - 1];
      let section = sorted[i];
      if (section.start <= lastChunk.start + lastChunk.size) {
        lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
      } else {
        chunks.push({
          start: section.start,
          size: section.data.byteLength
        });
      }
    }
    for (let chunk of chunks) {
      chunk.data = new Uint8Array(chunk.size);
      for (let section of __privateGet2(this, _sections2)) {
        if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
          chunk.data.set(section.data, section.start - chunk.start);
        }
      }
      if (__privateGet2(this, _chunked2)) {
        __privateMethod2(this, _writeDataIntoChunks2, writeDataIntoChunks_fn2).call(this, chunk.data, chunk.start);
        __privateMethod2(this, _flushChunks2, flushChunks_fn2).call(this);
      } else {
        if (__privateGet2(this, _ensureMonotonicity) && chunk.start < __privateGet2(this, _lastFlushEnd)) {
          throw new Error("Internal error: Monotonicity violation.");
        }
        this.target.options.onData?.(chunk.data, chunk.start);
        __privateSet2(this, _lastFlushEnd, chunk.start + chunk.data.byteLength);
      }
    }
    __privateGet2(this, _sections2).length = 0;
  }
  finalize() {
    if (__privateGet2(this, _chunked2)) {
      __privateMethod2(this, _flushChunks2, flushChunks_fn2).call(this, true);
    }
  }
};
_sections2 = /* @__PURE__ */ new WeakMap();
_lastFlushEnd = /* @__PURE__ */ new WeakMap();
_ensureMonotonicity = /* @__PURE__ */ new WeakMap();
_chunked2 = /* @__PURE__ */ new WeakMap();
_chunkSize2 = /* @__PURE__ */ new WeakMap();
_chunks2 = /* @__PURE__ */ new WeakMap();
_writeDataIntoChunks2 = /* @__PURE__ */ new WeakSet();
writeDataIntoChunks_fn2 = function(data, position) {
  let chunkIndex = __privateGet2(this, _chunks2).findIndex((x) => x.start <= position && position < x.start + __privateGet2(this, _chunkSize2));
  if (chunkIndex === -1)
    chunkIndex = __privateMethod2(this, _createChunk2, createChunk_fn2).call(this, position);
  let chunk = __privateGet2(this, _chunks2)[chunkIndex];
  let relativePosition = position - chunk.start;
  let toWrite = data.subarray(0, Math.min(__privateGet2(this, _chunkSize2) - relativePosition, data.byteLength));
  chunk.data.set(toWrite, relativePosition);
  let section = {
    start: relativePosition,
    end: relativePosition + toWrite.byteLength
  };
  __privateMethod2(this, _insertSectionIntoChunk2, insertSectionIntoChunk_fn2).call(this, chunk, section);
  if (chunk.written[0].start === 0 && chunk.written[0].end === __privateGet2(this, _chunkSize2)) {
    chunk.shouldFlush = true;
  }
  if (__privateGet2(this, _chunks2).length > MAX_CHUNKS_AT_ONCE2) {
    for (let i = 0; i < __privateGet2(this, _chunks2).length - 1; i++) {
      __privateGet2(this, _chunks2)[i].shouldFlush = true;
    }
    __privateMethod2(this, _flushChunks2, flushChunks_fn2).call(this);
  }
  if (toWrite.byteLength < data.byteLength) {
    __privateMethod2(this, _writeDataIntoChunks2, writeDataIntoChunks_fn2).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
  }
};
_insertSectionIntoChunk2 = /* @__PURE__ */ new WeakSet();
insertSectionIntoChunk_fn2 = function(chunk, section) {
  let low = 0;
  let high = chunk.written.length - 1;
  let index = -1;
  while (low <= high) {
    let mid = Math.floor(low + (high - low + 1) / 2);
    if (chunk.written[mid].start <= section.start) {
      low = mid + 1;
      index = mid;
    } else {
      high = mid - 1;
    }
  }
  chunk.written.splice(index + 1, 0, section);
  if (index === -1 || chunk.written[index].end < section.start)
    index++;
  while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
    chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
    chunk.written.splice(index + 1, 1);
  }
};
_createChunk2 = /* @__PURE__ */ new WeakSet();
createChunk_fn2 = function(includesPosition) {
  let start = Math.floor(includesPosition / __privateGet2(this, _chunkSize2)) * __privateGet2(this, _chunkSize2);
  let chunk = {
    start,
    data: new Uint8Array(__privateGet2(this, _chunkSize2)),
    written: [],
    shouldFlush: false
  };
  __privateGet2(this, _chunks2).push(chunk);
  __privateGet2(this, _chunks2).sort((a, b) => a.start - b.start);
  return __privateGet2(this, _chunks2).indexOf(chunk);
};
_flushChunks2 = /* @__PURE__ */ new WeakSet();
flushChunks_fn2 = function(force = false) {
  for (let i = 0; i < __privateGet2(this, _chunks2).length; i++) {
    let chunk = __privateGet2(this, _chunks2)[i];
    if (!chunk.shouldFlush && !force)
      continue;
    for (let section of chunk.written) {
      if (__privateGet2(this, _ensureMonotonicity) && chunk.start + section.start < __privateGet2(this, _lastFlushEnd)) {
        throw new Error("Internal error: Monotonicity violation.");
      }
      this.target.options.onData?.(
        chunk.data.subarray(section.start, section.end),
        chunk.start + section.start
      );
      __privateSet2(this, _lastFlushEnd, chunk.start + section.end);
    }
    __privateGet2(this, _chunks2).splice(i--, 1);
  }
};
var FileSystemWritableFileStreamTargetWriter2 = class extends StreamTargetWriter2 {
  constructor(target, ensureMonotonicity) {
    super(new StreamTarget2({
      onData: (data, position) => target.stream.write({
        type: "write",
        data,
        position
      }),
      chunked: true,
      chunkSize: target.options?.chunkSize
    }), ensureMonotonicity);
  }
};
var VIDEO_TRACK_NUMBER = 1;
var AUDIO_TRACK_NUMBER = 2;
var SUBTITLE_TRACK_NUMBER = 3;
var VIDEO_TRACK_TYPE = 1;
var AUDIO_TRACK_TYPE = 2;
var SUBTITLE_TRACK_TYPE = 17;
var MAX_CHUNK_LENGTH_MS = 2 ** 15;
var CODEC_PRIVATE_MAX_SIZE = 2 ** 13;
var APP_NAME = "https://github.com/Vanilagy/webm-muxer";
var SEGMENT_SIZE_BYTES = 6;
var CLUSTER_SIZE_BYTES = 5;
var FIRST_TIMESTAMP_BEHAVIORS2 = ["strict", "offset", "permissive"];
var _options2;
var _writer2;
var _segment;
var _segmentInfo;
var _seekHead;
var _tracksElement;
var _segmentDuration;
var _colourElement;
var _videoCodecPrivate;
var _audioCodecPrivate;
var _subtitleCodecPrivate;
var _cues;
var _currentCluster;
var _currentClusterTimestamp;
var _duration;
var _videoChunkQueue;
var _audioChunkQueue;
var _subtitleChunkQueue;
var _firstVideoTimestamp;
var _firstAudioTimestamp;
var _lastVideoTimestamp;
var _lastAudioTimestamp;
var _lastSubtitleTimestamp;
var _colorSpace;
var _finalized2;
var _validateOptions2;
var validateOptions_fn2;
var _createFileHeader;
var createFileHeader_fn;
var _writeEBMLHeader;
var writeEBMLHeader_fn;
var _createCodecPrivatePlaceholders;
var createCodecPrivatePlaceholders_fn;
var _createColourElement;
var createColourElement_fn;
var _createSeekHead;
var createSeekHead_fn;
var _createSegmentInfo;
var createSegmentInfo_fn;
var _createTracks;
var createTracks_fn;
var _createSegment;
var createSegment_fn;
var _createCues;
var createCues_fn;
var _maybeFlushStreamingTargetWriter2;
var maybeFlushStreamingTargetWriter_fn2;
var _segmentDataOffset;
var segmentDataOffset_get;
var _writeVideoDecoderConfig;
var writeVideoDecoderConfig_fn;
var _fixVP9ColorSpace;
var fixVP9ColorSpace_fn;
var _writeSubtitleChunks;
var writeSubtitleChunks_fn;
var _createInternalChunk;
var createInternalChunk_fn;
var _validateTimestamp2;
var validateTimestamp_fn2;
var _writeBlock;
var writeBlock_fn;
var _createCodecPrivateElement;
var createCodecPrivateElement_fn;
var _writeCodecPrivate;
var writeCodecPrivate_fn;
var _createNewCluster;
var createNewCluster_fn;
var _finalizeCurrentCluster;
var finalizeCurrentCluster_fn;
var _ensureNotFinalized2;
var ensureNotFinalized_fn2;
var Muxer2 = class {
  constructor(options) {
    __privateAdd2(this, _validateOptions2);
    __privateAdd2(this, _createFileHeader);
    __privateAdd2(this, _writeEBMLHeader);
    __privateAdd2(this, _createCodecPrivatePlaceholders);
    __privateAdd2(this, _createColourElement);
    __privateAdd2(this, _createSeekHead);
    __privateAdd2(this, _createSegmentInfo);
    __privateAdd2(this, _createTracks);
    __privateAdd2(this, _createSegment);
    __privateAdd2(this, _createCues);
    __privateAdd2(this, _maybeFlushStreamingTargetWriter2);
    __privateAdd2(this, _segmentDataOffset);
    __privateAdd2(this, _writeVideoDecoderConfig);
    __privateAdd2(this, _fixVP9ColorSpace);
    __privateAdd2(this, _writeSubtitleChunks);
    __privateAdd2(this, _createInternalChunk);
    __privateAdd2(this, _validateTimestamp2);
    __privateAdd2(this, _writeBlock);
    __privateAdd2(this, _createCodecPrivateElement);
    __privateAdd2(this, _writeCodecPrivate);
    __privateAdd2(this, _createNewCluster);
    __privateAdd2(this, _finalizeCurrentCluster);
    __privateAdd2(this, _ensureNotFinalized2);
    __privateAdd2(this, _options2, void 0);
    __privateAdd2(this, _writer2, void 0);
    __privateAdd2(this, _segment, void 0);
    __privateAdd2(this, _segmentInfo, void 0);
    __privateAdd2(this, _seekHead, void 0);
    __privateAdd2(this, _tracksElement, void 0);
    __privateAdd2(this, _segmentDuration, void 0);
    __privateAdd2(this, _colourElement, void 0);
    __privateAdd2(this, _videoCodecPrivate, void 0);
    __privateAdd2(this, _audioCodecPrivate, void 0);
    __privateAdd2(this, _subtitleCodecPrivate, void 0);
    __privateAdd2(this, _cues, void 0);
    __privateAdd2(this, _currentCluster, void 0);
    __privateAdd2(this, _currentClusterTimestamp, void 0);
    __privateAdd2(this, _duration, 0);
    __privateAdd2(this, _videoChunkQueue, []);
    __privateAdd2(this, _audioChunkQueue, []);
    __privateAdd2(this, _subtitleChunkQueue, []);
    __privateAdd2(this, _firstVideoTimestamp, void 0);
    __privateAdd2(this, _firstAudioTimestamp, void 0);
    __privateAdd2(this, _lastVideoTimestamp, -1);
    __privateAdd2(this, _lastAudioTimestamp, -1);
    __privateAdd2(this, _lastSubtitleTimestamp, -1);
    __privateAdd2(this, _colorSpace, void 0);
    __privateAdd2(this, _finalized2, false);
    __privateMethod2(this, _validateOptions2, validateOptions_fn2).call(this, options);
    __privateSet2(this, _options2, {
      type: "webm",
      firstTimestampBehavior: "strict",
      ...options
    });
    this.target = options.target;
    let ensureMonotonicity = !!__privateGet2(this, _options2).streaming;
    if (options.target instanceof ArrayBufferTarget2) {
      __privateSet2(this, _writer2, new ArrayBufferTargetWriter2(options.target));
    } else if (options.target instanceof StreamTarget2) {
      __privateSet2(this, _writer2, new StreamTargetWriter2(options.target, ensureMonotonicity));
    } else if (options.target instanceof FileSystemWritableFileStreamTarget2) {
      __privateSet2(this, _writer2, new FileSystemWritableFileStreamTargetWriter2(options.target, ensureMonotonicity));
    } else {
      throw new Error(`Invalid target: ${options.target}`);
    }
    __privateMethod2(this, _createFileHeader, createFileHeader_fn).call(this);
  }
  addVideoChunk(chunk, meta, timestamp) {
    if (!(chunk instanceof EncodedVideoChunk)) {
      throw new TypeError("addVideoChunk's first argument (chunk) must be of type EncodedVideoChunk.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
    }
    if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
      throw new TypeError(
        "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
      );
    }
    let data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.addVideoChunkRaw(data, chunk.type, timestamp ?? chunk.timestamp, meta);
  }
  addVideoChunkRaw(data, type, timestamp, meta) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addVideoChunkRaw's fourth argument (meta), when provided, must be an object.");
    }
    __privateMethod2(this, _ensureNotFinalized2, ensureNotFinalized_fn2).call(this);
    if (!__privateGet2(this, _options2).video)
      throw new Error("No video track declared.");
    if (__privateGet2(this, _firstVideoTimestamp) === void 0)
      __privateSet2(this, _firstVideoTimestamp, timestamp);
    if (meta)
      __privateMethod2(this, _writeVideoDecoderConfig, writeVideoDecoderConfig_fn).call(this, meta);
    let videoChunk = __privateMethod2(this, _createInternalChunk, createInternalChunk_fn).call(this, data, type, timestamp, VIDEO_TRACK_NUMBER);
    if (__privateGet2(this, _options2).video.codec === "V_VP9")
      __privateMethod2(this, _fixVP9ColorSpace, fixVP9ColorSpace_fn).call(this, videoChunk);
    __privateSet2(this, _lastVideoTimestamp, videoChunk.timestamp);
    while (__privateGet2(this, _audioChunkQueue).length > 0 && __privateGet2(this, _audioChunkQueue)[0].timestamp <= videoChunk.timestamp) {
      let audioChunk = __privateGet2(this, _audioChunkQueue).shift();
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, audioChunk, false);
    }
    if (!__privateGet2(this, _options2).audio || videoChunk.timestamp <= __privateGet2(this, _lastAudioTimestamp)) {
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, videoChunk, true);
    } else {
      __privateGet2(this, _videoChunkQueue).push(videoChunk);
    }
    __privateMethod2(this, _writeSubtitleChunks, writeSubtitleChunks_fn).call(this);
    __privateMethod2(this, _maybeFlushStreamingTargetWriter2, maybeFlushStreamingTargetWriter_fn2).call(this);
  }
  addAudioChunk(chunk, meta, timestamp) {
    if (!(chunk instanceof EncodedAudioChunk)) {
      throw new TypeError("addAudioChunk's first argument (chunk) must be of type EncodedAudioChunk.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
    }
    if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
      throw new TypeError(
        "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
      );
    }
    let data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.addAudioChunkRaw(data, chunk.type, timestamp ?? chunk.timestamp, meta);
  }
  addAudioChunkRaw(data, type, timestamp, meta) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addAudioChunkRaw's fourth argument (meta), when provided, must be an object.");
    }
    __privateMethod2(this, _ensureNotFinalized2, ensureNotFinalized_fn2).call(this);
    if (!__privateGet2(this, _options2).audio)
      throw new Error("No audio track declared.");
    if (__privateGet2(this, _firstAudioTimestamp) === void 0)
      __privateSet2(this, _firstAudioTimestamp, timestamp);
    if (meta?.decoderConfig) {
      if (__privateGet2(this, _options2).streaming) {
        __privateSet2(this, _audioCodecPrivate, __privateMethod2(this, _createCodecPrivateElement, createCodecPrivateElement_fn).call(this, meta.decoderConfig.description));
      } else {
        __privateMethod2(this, _writeCodecPrivate, writeCodecPrivate_fn).call(this, __privateGet2(this, _audioCodecPrivate), meta.decoderConfig.description);
      }
    }
    let audioChunk = __privateMethod2(this, _createInternalChunk, createInternalChunk_fn).call(this, data, type, timestamp, AUDIO_TRACK_NUMBER);
    __privateSet2(this, _lastAudioTimestamp, audioChunk.timestamp);
    while (__privateGet2(this, _videoChunkQueue).length > 0 && __privateGet2(this, _videoChunkQueue)[0].timestamp <= audioChunk.timestamp) {
      let videoChunk = __privateGet2(this, _videoChunkQueue).shift();
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, videoChunk, true);
    }
    if (!__privateGet2(this, _options2).video || audioChunk.timestamp <= __privateGet2(this, _lastVideoTimestamp)) {
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, audioChunk, !__privateGet2(this, _options2).video);
    } else {
      __privateGet2(this, _audioChunkQueue).push(audioChunk);
    }
    __privateMethod2(this, _writeSubtitleChunks, writeSubtitleChunks_fn).call(this);
    __privateMethod2(this, _maybeFlushStreamingTargetWriter2, maybeFlushStreamingTargetWriter_fn2).call(this);
  }
  addSubtitleChunk(chunk, meta, timestamp) {
    if (typeof chunk !== "object" || !chunk) {
      throw new TypeError("addSubtitleChunk's first argument (chunk) must be an object.");
    } else {
      if (!(chunk.body instanceof Uint8Array)) {
        throw new TypeError("body must be an instance of Uint8Array.");
      }
      if (!Number.isFinite(chunk.timestamp) || chunk.timestamp < 0) {
        throw new TypeError("timestamp must be a non-negative real number.");
      }
      if (!Number.isFinite(chunk.duration) || chunk.duration < 0) {
        throw new TypeError("duration must be a non-negative real number.");
      }
      if (chunk.additions && !(chunk.additions instanceof Uint8Array)) {
        throw new TypeError("additions, when present, must be an instance of Uint8Array.");
      }
    }
    if (typeof meta !== "object") {
      throw new TypeError("addSubtitleChunk's second argument (meta) must be an object.");
    }
    __privateMethod2(this, _ensureNotFinalized2, ensureNotFinalized_fn2).call(this);
    if (!__privateGet2(this, _options2).subtitles)
      throw new Error("No subtitle track declared.");
    if (meta?.decoderConfig) {
      if (__privateGet2(this, _options2).streaming) {
        __privateSet2(this, _subtitleCodecPrivate, __privateMethod2(this, _createCodecPrivateElement, createCodecPrivateElement_fn).call(this, meta.decoderConfig.description));
      } else {
        __privateMethod2(this, _writeCodecPrivate, writeCodecPrivate_fn).call(this, __privateGet2(this, _subtitleCodecPrivate), meta.decoderConfig.description);
      }
    }
    let subtitleChunk = __privateMethod2(this, _createInternalChunk, createInternalChunk_fn).call(this, chunk.body, "key", timestamp ?? chunk.timestamp, SUBTITLE_TRACK_NUMBER, chunk.duration, chunk.additions);
    __privateSet2(this, _lastSubtitleTimestamp, subtitleChunk.timestamp);
    __privateGet2(this, _subtitleChunkQueue).push(subtitleChunk);
    __privateMethod2(this, _writeSubtitleChunks, writeSubtitleChunks_fn).call(this);
    __privateMethod2(this, _maybeFlushStreamingTargetWriter2, maybeFlushStreamingTargetWriter_fn2).call(this);
  }
  finalize() {
    if (__privateGet2(this, _finalized2)) {
      throw new Error("Cannot finalize a muxer more than once.");
    }
    while (__privateGet2(this, _videoChunkQueue).length > 0)
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, __privateGet2(this, _videoChunkQueue).shift(), true);
    while (__privateGet2(this, _audioChunkQueue).length > 0)
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, __privateGet2(this, _audioChunkQueue).shift(), true);
    while (__privateGet2(this, _subtitleChunkQueue).length > 0 && __privateGet2(this, _subtitleChunkQueue)[0].timestamp <= __privateGet2(this, _duration)) {
      __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, __privateGet2(this, _subtitleChunkQueue).shift(), false);
    }
    if (__privateGet2(this, _currentCluster)) {
      __privateMethod2(this, _finalizeCurrentCluster, finalizeCurrentCluster_fn).call(this);
    }
    __privateGet2(this, _writer2).writeEBML(__privateGet2(this, _cues));
    if (!__privateGet2(this, _options2).streaming) {
      let endPos = __privateGet2(this, _writer2).pos;
      let segmentSize = __privateGet2(this, _writer2).pos - __privateGet2(this, _segmentDataOffset, segmentDataOffset_get);
      __privateGet2(this, _writer2).seek(__privateGet2(this, _writer2).offsets.get(__privateGet2(this, _segment)) + 4);
      __privateGet2(this, _writer2).writeEBMLVarInt(segmentSize, SEGMENT_SIZE_BYTES);
      __privateGet2(this, _segmentDuration).data = new EBMLFloat64(__privateGet2(this, _duration));
      __privateGet2(this, _writer2).seek(__privateGet2(this, _writer2).offsets.get(__privateGet2(this, _segmentDuration)));
      __privateGet2(this, _writer2).writeEBML(__privateGet2(this, _segmentDuration));
      __privateGet2(this, _seekHead).data[0].data[1].data = __privateGet2(this, _writer2).offsets.get(__privateGet2(this, _cues)) - __privateGet2(this, _segmentDataOffset, segmentDataOffset_get);
      __privateGet2(this, _seekHead).data[1].data[1].data = __privateGet2(this, _writer2).offsets.get(__privateGet2(this, _segmentInfo)) - __privateGet2(this, _segmentDataOffset, segmentDataOffset_get);
      __privateGet2(this, _seekHead).data[2].data[1].data = __privateGet2(this, _writer2).offsets.get(__privateGet2(this, _tracksElement)) - __privateGet2(this, _segmentDataOffset, segmentDataOffset_get);
      __privateGet2(this, _writer2).seek(__privateGet2(this, _writer2).offsets.get(__privateGet2(this, _seekHead)));
      __privateGet2(this, _writer2).writeEBML(__privateGet2(this, _seekHead));
      __privateGet2(this, _writer2).seek(endPos);
    }
    __privateMethod2(this, _maybeFlushStreamingTargetWriter2, maybeFlushStreamingTargetWriter_fn2).call(this);
    __privateGet2(this, _writer2).finalize();
    __privateSet2(this, _finalized2, true);
  }
};
_options2 = /* @__PURE__ */ new WeakMap();
_writer2 = /* @__PURE__ */ new WeakMap();
_segment = /* @__PURE__ */ new WeakMap();
_segmentInfo = /* @__PURE__ */ new WeakMap();
_seekHead = /* @__PURE__ */ new WeakMap();
_tracksElement = /* @__PURE__ */ new WeakMap();
_segmentDuration = /* @__PURE__ */ new WeakMap();
_colourElement = /* @__PURE__ */ new WeakMap();
_videoCodecPrivate = /* @__PURE__ */ new WeakMap();
_audioCodecPrivate = /* @__PURE__ */ new WeakMap();
_subtitleCodecPrivate = /* @__PURE__ */ new WeakMap();
_cues = /* @__PURE__ */ new WeakMap();
_currentCluster = /* @__PURE__ */ new WeakMap();
_currentClusterTimestamp = /* @__PURE__ */ new WeakMap();
_duration = /* @__PURE__ */ new WeakMap();
_videoChunkQueue = /* @__PURE__ */ new WeakMap();
_audioChunkQueue = /* @__PURE__ */ new WeakMap();
_subtitleChunkQueue = /* @__PURE__ */ new WeakMap();
_firstVideoTimestamp = /* @__PURE__ */ new WeakMap();
_firstAudioTimestamp = /* @__PURE__ */ new WeakMap();
_lastVideoTimestamp = /* @__PURE__ */ new WeakMap();
_lastAudioTimestamp = /* @__PURE__ */ new WeakMap();
_lastSubtitleTimestamp = /* @__PURE__ */ new WeakMap();
_colorSpace = /* @__PURE__ */ new WeakMap();
_finalized2 = /* @__PURE__ */ new WeakMap();
_validateOptions2 = /* @__PURE__ */ new WeakSet();
validateOptions_fn2 = function(options) {
  if (typeof options !== "object") {
    throw new TypeError("The muxer requires an options object to be passed to its constructor.");
  }
  if (!(options.target instanceof Target2)) {
    throw new TypeError("The target must be provided and an instance of Target.");
  }
  if (options.video) {
    if (typeof options.video.codec !== "string") {
      throw new TypeError(`Invalid video codec: ${options.video.codec}. Must be a string.`);
    }
    if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
      throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
    }
    if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
      throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
    }
    if (options.video.frameRate !== void 0) {
      if (!Number.isFinite(options.video.frameRate) || options.video.frameRate <= 0) {
        throw new TypeError(
          `Invalid video frame rate: ${options.video.frameRate}. Must be a positive number.`
        );
      }
    }
    if (options.video.alpha !== void 0 && typeof options.video.alpha !== "boolean") {
      throw new TypeError(`Invalid video alpha: ${options.video.alpha}. Must be a boolean.`);
    }
  }
  if (options.audio) {
    if (typeof options.audio.codec !== "string") {
      throw new TypeError(`Invalid audio codec: ${options.audio.codec}. Must be a string.`);
    }
    if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
      throw new TypeError(
        `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
      );
    }
    if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
      throw new TypeError(
        `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
      );
    }
    if (options.audio.bitDepth !== void 0) {
      if (!Number.isInteger(options.audio.bitDepth) || options.audio.bitDepth <= 0) {
        throw new TypeError(
          `Invalid audio bit depth: ${options.audio.bitDepth}. Must be a positive integer.`
        );
      }
    }
  }
  if (options.subtitles) {
    if (typeof options.subtitles.codec !== "string") {
      throw new TypeError(`Invalid subtitles codec: ${options.subtitles.codec}. Must be a string.`);
    }
  }
  if (options.type !== void 0 && !["webm", "matroska"].includes(options.type)) {
    throw new TypeError(`Invalid type: ${options.type}. Must be 'webm' or 'matroska'.`);
  }
  if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS2.includes(options.firstTimestampBehavior)) {
    throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
  }
  if (options.streaming !== void 0 && typeof options.streaming !== "boolean") {
    throw new TypeError(`Invalid streaming option: ${options.streaming}. Must be a boolean.`);
  }
};
_createFileHeader = /* @__PURE__ */ new WeakSet();
createFileHeader_fn = function() {
  if (__privateGet2(this, _writer2) instanceof BaseStreamTargetWriter && __privateGet2(this, _writer2).target.options.onHeader) {
    __privateGet2(this, _writer2).startTrackingWrites();
  }
  __privateMethod2(this, _writeEBMLHeader, writeEBMLHeader_fn).call(this);
  if (!__privateGet2(this, _options2).streaming) {
    __privateMethod2(this, _createSeekHead, createSeekHead_fn).call(this);
  }
  __privateMethod2(this, _createSegmentInfo, createSegmentInfo_fn).call(this);
  __privateMethod2(this, _createCodecPrivatePlaceholders, createCodecPrivatePlaceholders_fn).call(this);
  __privateMethod2(this, _createColourElement, createColourElement_fn).call(this);
  if (!__privateGet2(this, _options2).streaming) {
    __privateMethod2(this, _createTracks, createTracks_fn).call(this);
    __privateMethod2(this, _createSegment, createSegment_fn).call(this);
  } else {
  }
  __privateMethod2(this, _createCues, createCues_fn).call(this);
  __privateMethod2(this, _maybeFlushStreamingTargetWriter2, maybeFlushStreamingTargetWriter_fn2).call(this);
};
_writeEBMLHeader = /* @__PURE__ */ new WeakSet();
writeEBMLHeader_fn = function() {
  let ebmlHeader = { id: 440786851, data: [
    { id: 17030, data: 1 },
    { id: 17143, data: 1 },
    { id: 17138, data: 4 },
    { id: 17139, data: 8 },
    { id: 17026, data: __privateGet2(this, _options2).type ?? "webm" },
    { id: 17031, data: 2 },
    { id: 17029, data: 2 }
  ] };
  __privateGet2(this, _writer2).writeEBML(ebmlHeader);
};
_createCodecPrivatePlaceholders = /* @__PURE__ */ new WeakSet();
createCodecPrivatePlaceholders_fn = function() {
  __privateSet2(this, _videoCodecPrivate, { id: 236, size: 4, data: new Uint8Array(CODEC_PRIVATE_MAX_SIZE) });
  __privateSet2(this, _audioCodecPrivate, { id: 236, size: 4, data: new Uint8Array(CODEC_PRIVATE_MAX_SIZE) });
  __privateSet2(this, _subtitleCodecPrivate, { id: 236, size: 4, data: new Uint8Array(CODEC_PRIVATE_MAX_SIZE) });
};
_createColourElement = /* @__PURE__ */ new WeakSet();
createColourElement_fn = function() {
  __privateSet2(this, _colourElement, { id: 21936, data: [
    { id: 21937, data: 2 },
    { id: 21946, data: 2 },
    { id: 21947, data: 2 },
    { id: 21945, data: 0 }
  ] });
};
_createSeekHead = /* @__PURE__ */ new WeakSet();
createSeekHead_fn = function() {
  const kaxCues = new Uint8Array([28, 83, 187, 107]);
  const kaxInfo = new Uint8Array([21, 73, 169, 102]);
  const kaxTracks = new Uint8Array([22, 84, 174, 107]);
  let seekHead = { id: 290298740, data: [
    { id: 19899, data: [
      { id: 21419, data: kaxCues },
      { id: 21420, size: 5, data: 0 }
    ] },
    { id: 19899, data: [
      { id: 21419, data: kaxInfo },
      { id: 21420, size: 5, data: 0 }
    ] },
    { id: 19899, data: [
      { id: 21419, data: kaxTracks },
      { id: 21420, size: 5, data: 0 }
    ] }
  ] };
  __privateSet2(this, _seekHead, seekHead);
};
_createSegmentInfo = /* @__PURE__ */ new WeakSet();
createSegmentInfo_fn = function() {
  let segmentDuration = { id: 17545, data: new EBMLFloat64(0) };
  __privateSet2(this, _segmentDuration, segmentDuration);
  let segmentInfo = { id: 357149030, data: [
    { id: 2807729, data: 1e6 },
    { id: 19840, data: APP_NAME },
    { id: 22337, data: APP_NAME },
    !__privateGet2(this, _options2).streaming ? segmentDuration : null
  ] };
  __privateSet2(this, _segmentInfo, segmentInfo);
};
_createTracks = /* @__PURE__ */ new WeakSet();
createTracks_fn = function() {
  let tracksElement = { id: 374648427, data: [] };
  __privateSet2(this, _tracksElement, tracksElement);
  if (__privateGet2(this, _options2).video) {
    tracksElement.data.push({ id: 174, data: [
      { id: 215, data: VIDEO_TRACK_NUMBER },
      { id: 29637, data: VIDEO_TRACK_NUMBER },
      { id: 131, data: VIDEO_TRACK_TYPE },
      { id: 134, data: __privateGet2(this, _options2).video.codec },
      __privateGet2(this, _videoCodecPrivate),
      __privateGet2(this, _options2).video.frameRate ? { id: 2352003, data: 1e9 / __privateGet2(this, _options2).video.frameRate } : null,
      { id: 224, data: [
        { id: 176, data: __privateGet2(this, _options2).video.width },
        { id: 186, data: __privateGet2(this, _options2).video.height },
        __privateGet2(this, _options2).video.alpha ? { id: 21440, data: 1 } : null,
        __privateGet2(this, _colourElement)
      ] }
    ] });
  }
  if (__privateGet2(this, _options2).audio) {
    __privateSet2(this, _audioCodecPrivate, __privateGet2(this, _options2).streaming ? __privateGet2(this, _audioCodecPrivate) || null : { id: 236, size: 4, data: new Uint8Array(CODEC_PRIVATE_MAX_SIZE) });
    tracksElement.data.push({ id: 174, data: [
      { id: 215, data: AUDIO_TRACK_NUMBER },
      { id: 29637, data: AUDIO_TRACK_NUMBER },
      { id: 131, data: AUDIO_TRACK_TYPE },
      { id: 134, data: __privateGet2(this, _options2).audio.codec },
      __privateGet2(this, _audioCodecPrivate),
      { id: 225, data: [
        { id: 181, data: new EBMLFloat32(__privateGet2(this, _options2).audio.sampleRate) },
        { id: 159, data: __privateGet2(this, _options2).audio.numberOfChannels },
        __privateGet2(this, _options2).audio.bitDepth ? { id: 25188, data: __privateGet2(this, _options2).audio.bitDepth } : null
      ] }
    ] });
  }
  if (__privateGet2(this, _options2).subtitles) {
    tracksElement.data.push({ id: 174, data: [
      { id: 215, data: SUBTITLE_TRACK_NUMBER },
      { id: 29637, data: SUBTITLE_TRACK_NUMBER },
      { id: 131, data: SUBTITLE_TRACK_TYPE },
      { id: 134, data: __privateGet2(this, _options2).subtitles.codec },
      __privateGet2(this, _subtitleCodecPrivate)
    ] });
  }
};
_createSegment = /* @__PURE__ */ new WeakSet();
createSegment_fn = function() {
  let segment = {
    id: 408125543,
    size: __privateGet2(this, _options2).streaming ? -1 : SEGMENT_SIZE_BYTES,
    data: [
      !__privateGet2(this, _options2).streaming ? __privateGet2(this, _seekHead) : null,
      __privateGet2(this, _segmentInfo),
      __privateGet2(this, _tracksElement)
    ]
  };
  __privateSet2(this, _segment, segment);
  __privateGet2(this, _writer2).writeEBML(segment);
  if (__privateGet2(this, _writer2) instanceof BaseStreamTargetWriter && __privateGet2(this, _writer2).target.options.onHeader) {
    let { data, start } = __privateGet2(this, _writer2).getTrackedWrites();
    __privateGet2(this, _writer2).target.options.onHeader(data, start);
  }
};
_createCues = /* @__PURE__ */ new WeakSet();
createCues_fn = function() {
  __privateSet2(this, _cues, { id: 475249515, data: [] });
};
_maybeFlushStreamingTargetWriter2 = /* @__PURE__ */ new WeakSet();
maybeFlushStreamingTargetWriter_fn2 = function() {
  if (__privateGet2(this, _writer2) instanceof StreamTargetWriter2) {
    __privateGet2(this, _writer2).flush();
  }
};
_segmentDataOffset = /* @__PURE__ */ new WeakSet();
segmentDataOffset_get = function() {
  return __privateGet2(this, _writer2).dataOffsets.get(__privateGet2(this, _segment));
};
_writeVideoDecoderConfig = /* @__PURE__ */ new WeakSet();
writeVideoDecoderConfig_fn = function(meta) {
  if (!meta.decoderConfig)
    return;
  if (meta.decoderConfig.colorSpace) {
    let colorSpace = meta.decoderConfig.colorSpace;
    __privateSet2(this, _colorSpace, colorSpace);
    __privateGet2(this, _colourElement).data = [
      { id: 21937, data: {
        "rgb": 1,
        "bt709": 1,
        "bt470bg": 5,
        "smpte170m": 6
      }[colorSpace.matrix] },
      { id: 21946, data: {
        "bt709": 1,
        "smpte170m": 6,
        "iec61966-2-1": 13
      }[colorSpace.transfer] },
      { id: 21947, data: {
        "bt709": 1,
        "bt470bg": 5,
        "smpte170m": 6
      }[colorSpace.primaries] },
      { id: 21945, data: [1, 2][Number(colorSpace.fullRange)] }
    ];
    if (!__privateGet2(this, _options2).streaming) {
      let endPos = __privateGet2(this, _writer2).pos;
      __privateGet2(this, _writer2).seek(__privateGet2(this, _writer2).offsets.get(__privateGet2(this, _colourElement)));
      __privateGet2(this, _writer2).writeEBML(__privateGet2(this, _colourElement));
      __privateGet2(this, _writer2).seek(endPos);
    }
  }
  if (meta.decoderConfig.description) {
    if (__privateGet2(this, _options2).streaming) {
      __privateSet2(this, _videoCodecPrivate, __privateMethod2(this, _createCodecPrivateElement, createCodecPrivateElement_fn).call(this, meta.decoderConfig.description));
    } else {
      __privateMethod2(this, _writeCodecPrivate, writeCodecPrivate_fn).call(this, __privateGet2(this, _videoCodecPrivate), meta.decoderConfig.description);
    }
  }
};
_fixVP9ColorSpace = /* @__PURE__ */ new WeakSet();
fixVP9ColorSpace_fn = function(chunk) {
  if (chunk.type !== "key")
    return;
  if (!__privateGet2(this, _colorSpace))
    return;
  let i = 0;
  if (readBits(chunk.data, 0, 2) !== 2)
    return;
  i += 2;
  let profile = (readBits(chunk.data, i + 1, i + 2) << 1) + readBits(chunk.data, i + 0, i + 1);
  i += 2;
  if (profile === 3)
    i++;
  let showExistingFrame = readBits(chunk.data, i + 0, i + 1);
  i++;
  if (showExistingFrame)
    return;
  let frameType = readBits(chunk.data, i + 0, i + 1);
  i++;
  if (frameType !== 0)
    return;
  i += 2;
  let syncCode = readBits(chunk.data, i + 0, i + 24);
  i += 24;
  if (syncCode !== 4817730)
    return;
  if (profile >= 2)
    i++;
  let colorSpaceID = {
    "rgb": 7,
    "bt709": 2,
    "bt470bg": 1,
    "smpte170m": 3
  }[__privateGet2(this, _colorSpace).matrix];
  writeBits(chunk.data, i + 0, i + 3, colorSpaceID);
};
_writeSubtitleChunks = /* @__PURE__ */ new WeakSet();
writeSubtitleChunks_fn = function() {
  let lastWrittenMediaTimestamp = Math.min(
    __privateGet2(this, _options2).video ? __privateGet2(this, _lastVideoTimestamp) : Infinity,
    __privateGet2(this, _options2).audio ? __privateGet2(this, _lastAudioTimestamp) : Infinity
  );
  let queue = __privateGet2(this, _subtitleChunkQueue);
  while (queue.length > 0 && queue[0].timestamp <= lastWrittenMediaTimestamp) {
    __privateMethod2(this, _writeBlock, writeBlock_fn).call(this, queue.shift(), !__privateGet2(this, _options2).video && !__privateGet2(this, _options2).audio);
  }
};
_createInternalChunk = /* @__PURE__ */ new WeakSet();
createInternalChunk_fn = function(data, type, timestamp, trackNumber, duration, additions) {
  let adjustedTimestamp = __privateMethod2(this, _validateTimestamp2, validateTimestamp_fn2).call(this, timestamp, trackNumber);
  let internalChunk = {
    data,
    additions,
    type,
    timestamp: adjustedTimestamp,
    duration,
    trackNumber
  };
  return internalChunk;
};
_validateTimestamp2 = /* @__PURE__ */ new WeakSet();
validateTimestamp_fn2 = function(timestamp, trackNumber) {
  let lastTimestamp = trackNumber === VIDEO_TRACK_NUMBER ? __privateGet2(this, _lastVideoTimestamp) : trackNumber === AUDIO_TRACK_NUMBER ? __privateGet2(this, _lastAudioTimestamp) : __privateGet2(this, _lastSubtitleTimestamp);
  if (trackNumber !== SUBTITLE_TRACK_NUMBER) {
    let firstTimestamp = trackNumber === VIDEO_TRACK_NUMBER ? __privateGet2(this, _firstVideoTimestamp) : __privateGet2(this, _firstAudioTimestamp);
    if (__privateGet2(this, _options2).firstTimestampBehavior === "strict" && lastTimestamp === -1 && timestamp !== 0) {
      throw new Error(
        `The first chunk for your media track must have a timestamp of 0 (received ${timestamp}). Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of the document, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
If you want to allow non-zero first timestamps, set firstTimestampBehavior: 'permissive'.
`
      );
    } else if (__privateGet2(this, _options2).firstTimestampBehavior === "offset") {
      timestamp -= firstTimestamp;
    }
  }
  if (timestamp < lastTimestamp) {
    throw new Error(
      `Timestamps must be monotonically increasing (went from ${lastTimestamp} to ${timestamp}).`
    );
  }
  if (timestamp < 0) {
    throw new Error(`Timestamps must be non-negative (received ${timestamp}).`);
  }
  return timestamp;
};
_writeBlock = /* @__PURE__ */ new WeakSet();
writeBlock_fn = function(chunk, canCreateNewCluster) {
  if (__privateGet2(this, _options2).streaming && !__privateGet2(this, _tracksElement)) {
    __privateMethod2(this, _createTracks, createTracks_fn).call(this);
    __privateMethod2(this, _createSegment, createSegment_fn).call(this);
  }
  let msTimestamp = Math.floor(chunk.timestamp / 1e3);
  let relativeTimestamp = msTimestamp - __privateGet2(this, _currentClusterTimestamp);
  let shouldCreateNewClusterFromKeyFrame = canCreateNewCluster && chunk.type === "key" && relativeTimestamp >= 1e3;
  let clusterWouldBeTooLong = relativeTimestamp >= MAX_CHUNK_LENGTH_MS;
  if (!__privateGet2(this, _currentCluster) || shouldCreateNewClusterFromKeyFrame || clusterWouldBeTooLong) {
    __privateMethod2(this, _createNewCluster, createNewCluster_fn).call(this, msTimestamp);
    relativeTimestamp = 0;
  }
  if (relativeTimestamp < 0) {
    return;
  }
  let prelude = new Uint8Array(4);
  let view2 = new DataView(prelude.buffer);
  view2.setUint8(0, 128 | chunk.trackNumber);
  view2.setInt16(1, relativeTimestamp, false);
  if (chunk.duration === void 0 && !chunk.additions) {
    view2.setUint8(3, Number(chunk.type === "key") << 7);
    let simpleBlock = { id: 163, data: [
      prelude,
      chunk.data
    ] };
    __privateGet2(this, _writer2).writeEBML(simpleBlock);
  } else {
    let msDuration = Math.floor(chunk.duration / 1e3);
    let blockGroup = { id: 160, data: [
      { id: 161, data: [
        prelude,
        chunk.data
      ] },
      chunk.duration !== void 0 ? { id: 155, data: msDuration } : null,
      chunk.additions ? { id: 30113, data: chunk.additions } : null
    ] };
    __privateGet2(this, _writer2).writeEBML(blockGroup);
  }
  __privateSet2(this, _duration, Math.max(__privateGet2(this, _duration), msTimestamp));
};
_createCodecPrivateElement = /* @__PURE__ */ new WeakSet();
createCodecPrivateElement_fn = function(data) {
  return { id: 25506, size: 4, data: new Uint8Array(data) };
};
_writeCodecPrivate = /* @__PURE__ */ new WeakSet();
writeCodecPrivate_fn = function(element, data) {
  let endPos = __privateGet2(this, _writer2).pos;
  __privateGet2(this, _writer2).seek(__privateGet2(this, _writer2).offsets.get(element));
  let codecPrivateElementSize = 2 + 4 + data.byteLength;
  let voidDataSize = CODEC_PRIVATE_MAX_SIZE - codecPrivateElementSize;
  if (voidDataSize < 0) {
    let newByteLength = data.byteLength + voidDataSize;
    if (data instanceof ArrayBuffer) {
      data = data.slice(0, newByteLength);
    } else {
      data = data.buffer.slice(0, newByteLength);
    }
    voidDataSize = 0;
  }
  element = [
    __privateMethod2(this, _createCodecPrivateElement, createCodecPrivateElement_fn).call(this, data),
    { id: 236, size: 4, data: new Uint8Array(voidDataSize) }
  ];
  __privateGet2(this, _writer2).writeEBML(element);
  __privateGet2(this, _writer2).seek(endPos);
};
_createNewCluster = /* @__PURE__ */ new WeakSet();
createNewCluster_fn = function(timestamp) {
  if (__privateGet2(this, _currentCluster)) {
    __privateMethod2(this, _finalizeCurrentCluster, finalizeCurrentCluster_fn).call(this);
  }
  if (__privateGet2(this, _writer2) instanceof BaseStreamTargetWriter && __privateGet2(this, _writer2).target.options.onCluster) {
    __privateGet2(this, _writer2).startTrackingWrites();
  }
  __privateSet2(this, _currentCluster, {
    id: 524531317,
    size: __privateGet2(this, _options2).streaming ? -1 : CLUSTER_SIZE_BYTES,
    data: [
      { id: 231, data: timestamp }
    ]
  });
  __privateGet2(this, _writer2).writeEBML(__privateGet2(this, _currentCluster));
  __privateSet2(this, _currentClusterTimestamp, timestamp);
  let clusterOffsetFromSegment = __privateGet2(this, _writer2).offsets.get(__privateGet2(this, _currentCluster)) - __privateGet2(this, _segmentDataOffset, segmentDataOffset_get);
  __privateGet2(this, _cues).data.push({ id: 187, data: [
    { id: 179, data: timestamp },
    __privateGet2(this, _options2).video ? { id: 183, data: [
      { id: 247, data: VIDEO_TRACK_NUMBER },
      { id: 241, data: clusterOffsetFromSegment }
    ] } : null,
    __privateGet2(this, _options2).audio ? { id: 183, data: [
      { id: 247, data: AUDIO_TRACK_NUMBER },
      { id: 241, data: clusterOffsetFromSegment }
    ] } : null
  ] });
};
_finalizeCurrentCluster = /* @__PURE__ */ new WeakSet();
finalizeCurrentCluster_fn = function() {
  if (!__privateGet2(this, _options2).streaming) {
    let clusterSize = __privateGet2(this, _writer2).pos - __privateGet2(this, _writer2).dataOffsets.get(__privateGet2(this, _currentCluster));
    let endPos = __privateGet2(this, _writer2).pos;
    __privateGet2(this, _writer2).seek(__privateGet2(this, _writer2).offsets.get(__privateGet2(this, _currentCluster)) + 4);
    __privateGet2(this, _writer2).writeEBMLVarInt(clusterSize, CLUSTER_SIZE_BYTES);
    __privateGet2(this, _writer2).seek(endPos);
  }
  if (__privateGet2(this, _writer2) instanceof BaseStreamTargetWriter && __privateGet2(this, _writer2).target.options.onCluster) {
    let { data, start } = __privateGet2(this, _writer2).getTrackedWrites();
    __privateGet2(this, _writer2).target.options.onCluster(data, start, __privateGet2(this, _currentClusterTimestamp));
  }
};
_ensureNotFinalized2 = /* @__PURE__ */ new WeakSet();
ensureNotFinalized_fn2 = function() {
  if (__privateGet2(this, _finalized2)) {
    throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
  }
};
var timestampRegex = /(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/;
var textEncoder = new TextEncoder();
var _options22;
var _config;
var _preambleSeen;
var _preambleBytes;
var _preambleEmitted;
var _parseTimestamp;
var parseTimestamp_fn;
var _formatTimestamp;
var formatTimestamp_fn;
_options22 = /* @__PURE__ */ new WeakMap();
_config = /* @__PURE__ */ new WeakMap();
_preambleSeen = /* @__PURE__ */ new WeakMap();
_preambleBytes = /* @__PURE__ */ new WeakMap();
_preambleEmitted = /* @__PURE__ */ new WeakMap();
_parseTimestamp = /* @__PURE__ */ new WeakSet();
parseTimestamp_fn = function(string) {
  let match = timestampRegex.exec(string);
  if (!match)
    throw new Error("Expected match.");
  return 60 * 60 * 1e3 * Number(match[1] || "0") + 60 * 1e3 * Number(match[2]) + 1e3 * Number(match[3]) + Number(match[4]);
};
_formatTimestamp = /* @__PURE__ */ new WeakSet();
formatTimestamp_fn = function(timestamp) {
  let hours = Math.floor(timestamp / (60 * 60 * 1e3));
  let minutes = Math.floor(timestamp % (60 * 60 * 1e3) / (60 * 1e3));
  let seconds = Math.floor(timestamp % (60 * 1e3) / 1e3);
  let milliseconds = timestamp % 1e3;
  return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0") + "." + milliseconds.toString().padStart(3, "0");
};

// src/mayocut/fonts.ts
var FONT_CATALOGUE = [
  // ---- clean / captions -----------------------------------------------------
  {
    id: "system",
    name: "Modern (default)",
    css: '"Inter", "Segoe UI", system-ui, sans-serif',
    note: "Clean UI sans \u2014 the safe default",
    kind: "sans"
  },
  {
    id: "helvetica",
    name: "Helvetica / Nimbus",
    css: '"Helvetica Neue", Helvetica, "Nimbus Sans", Arial, sans-serif',
    note: "Neutral Swiss sans, slightly tighter than Modern",
    kind: "sans"
  },
  {
    id: "grotesk",
    name: "Grotesk",
    css: '"Arial", "Liberation Sans", "Helvetica Neue", sans-serif',
    note: "Plain, wide, extremely legible at small sizes",
    kind: "sans"
  },
  {
    id: "geometric",
    name: "Geometric",
    css: '"Futura", "Century Gothic", "Avenir Next", "Trebuchet MS", sans-serif',
    note: "Round geometry \u2014 good for titles, weak for body",
    kind: "sans"
  },
  {
    id: "humanist",
    name: "Humanist",
    css: '"Optima", "Candara", "Gill Sans", "Segoe UI", sans-serif',
    note: "Softer strokes, reads well over busy footage",
    kind: "sans"
  },
  {
    id: "book",
    name: "Book",
    css: '"Verdana", "DejaVu Sans", "Segoe UI", sans-serif',
    note: "Wide and heavy \u2014 the most readable over video",
    kind: "sans"
  },
  {
    id: "condensed",
    name: "Condensed",
    css: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
    note: "Narrow \u2014 fits long lines and stacked captions",
    kind: "sans"
  },
  // ---- loud / display -------------------------------------------------------
  {
    id: "impact",
    name: "Impact (loud)",
    css: 'Impact, "Arial Black", "Haettenschweiler", sans-serif',
    note: "Meme/poster weight; pairs with a thick stroke",
    kind: "display"
  },
  {
    id: "black",
    name: "Black",
    css: '"Arial Black", "Segoe UI Black", "Impact", sans-serif',
    note: "Very heavy sans for hook text",
    kind: "display"
  },
  {
    id: "poster",
    name: "Poster",
    css: '"Trebuchet MS", "Tahoma", "DejaVu Sans", sans-serif',
    note: "Friendly and slightly condensed",
    kind: "display"
  },
  // ---- serif ---------------------------------------------------------------
  {
    id: "serif",
    name: "Classic serif",
    css: 'Georgia, "Times New Roman", "Liberation Serif", serif',
    note: "Editorial serif; the default for quotes",
    kind: "serif"
  },
  {
    id: "garamond",
    name: "Garamond",
    css: '"EB Garamond", Garamond, "Apple Garamond", "Georgia", serif',
    note: "Bookish and elegant \u2014 small caps look great",
    kind: "serif"
  },
  {
    id: "slab",
    name: "Slab",
    css: 'Rockwell, "Roboto Slab", "DejaVu Serif", serif',
    note: "Blocky serif; strong over footage",
    kind: "serif"
  },
  {
    id: "elegant",
    name: "Elegant",
    css: '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", serif',
    note: "Warm old-style; wedding and travel edits",
    kind: "serif"
  },
  {
    id: "didone",
    name: "Didone",
    css: '"Didot", "Bodoni MT", "Baskerville", "Playfair Display", serif',
    note: "High-contrast fashion type \u2014 large sizes only",
    kind: "serif"
  },
  // ---- mono / typewriter ----------------------------------------------------
  {
    id: "mono",
    name: "Typewriter mono",
    css: '"SF Mono", ui-monospace, "Roboto Mono", "DejaVu Sans Mono", monospace',
    note: "Code/terminal feel; good for data and jokes",
    kind: "mono"
  },
  {
    id: "courier",
    name: "Courier",
    css: '"Courier New", Courier, "Nimbus Mono PS", monospace',
    note: "Script/typewriter look with a thin weight",
    kind: "mono"
  },
  // ---- script / casual ------------------------------------------------------
  {
    id: "script",
    name: "Script (handwritten)",
    css: '"Brush Script MT", "Segoe Script", "Bradley Hand", cursive',
    note: "Handwritten \u2014 use sparingly and large",
    kind: "script"
  },
  {
    id: "rounded",
    name: "Rounded (casual)",
    css: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive',
    note: "Informal and warm",
    kind: "script"
  },
  {
    id: "marker",
    name: "Marker",
    css: '"Marker Felt", "Comic Sans MS", "Segoe Print", cursive',
    note: "Notebook/marker annotation style",
    kind: "script"
  },
  {
    id: "fancy",
    name: "Fancy (blackletter)",
    css: '"Old English Text MT", "UnifrakturMaguntia", "Cinzel Decorative", serif',
    note: "Blackletter; decorative only, never body text",
    kind: "display"
  }
];
var BY_ID = new Map(FONT_CATALOGUE.map((f) => [f.id, f]));
function resolveFontCss(id, imported) {
  if (!id) return FONT_CATALOGUE[0].css;
  const built = BY_ID.get(id);
  if (built) return built.css;
  const imp = imported?.find((f) => f.id === id || f.family === id);
  if (imp?.family) {
    return `"${imp.family}", ${FONT_CATALOGUE[0].css}`;
  }
  return FONT_CATALOGUE[0].css;
}

// src/mayocut/types.ts
var DEFAULT_ADJUST = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
  sharpen: 0,
  vignette: 0,
  splitTone: 0
};
function wipeDir(kind) {
  switch (kind) {
    case "wipeleft":
      return { dir: "left", soft: false };
    case "wiperight":
      return { dir: "right", soft: false };
    case "wipeup":
      return { dir: "up", soft: false };
    case "wipedown":
      return { dir: "down", soft: false };
    case "wipeleftsoft":
      return { dir: "left", soft: true };
    case "wiperightsoft":
      return { dir: "right", soft: true };
    case "wipeupsoft":
      return { dir: "up", soft: true };
    case "wipedownsoft":
      return { dir: "down", soft: true };
    default:
      return null;
  }
}
function isDipTo(kind) {
  if (kind === "fadeblack") return "black";
  if (kind === "fadewhite") return "white";
  return null;
}
var DEFAULT_ANIM = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
var FONTS = FONT_CATALOGUE.map(
  ({ id, name, css }) => ({ id, name, css })
);
function fontCss(id, imported) {
  return resolveFontCss(id, imported);
}
var ASPECTS = {
  "9:16": { w: 1080, h: 1920, label: "9:16 \xB7 Reels / Shorts", hint: "TikTok, Reels, Shorts" },
  "1:1": { w: 1080, h: 1080, label: "1:1 \xB7 Square", hint: "Feed posts, LinkedIn" },
  "4:5": { w: 1080, h: 1350, label: "4:5 \xB7 Portrait feed", hint: "Instagram feed" },
  "16:9": { w: 1920, h: 1080, label: "16:9 \xB7 Landscape", hint: "YouTube, desktop" },
  "4:3": { w: 1440, h: 1080, label: "4:3 \xB7 Classic", hint: "Older TV, presentations" },
  "3:4": { w: 1080, h: 1440, label: "3:4 \xB7 Vertical", hint: "Pinterest, tablets" },
  "21:9": { w: 2560, h: 1080, label: "21:9 \xB7 Cinematic", hint: "Film bars, widescreen" },
  "2:3": { w: 1080, h: 1620, label: "2:3 \xB7 Tall portrait", hint: "Prints, flyers" }
};
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function speedCurveOf(c) {
  const raw = c.curve;
  if (!raw || raw.length < 2) return null;
  const pts = raw.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.v)).map((p) => ({ at: clamp(p.at, 0, 1), v: clamp(p.v, 0.05, 16) })).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  if (pts[0].at > 0) pts.unshift({ at: 0, v: pts[0].v });
  if (pts[pts.length - 1].at < 1) pts.push({ at: 1, v: pts[pts.length - 1].v });
  return pts;
}
function safeSpeed(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.05, Math.min(100, n));
}
function speedAt(c, x) {
  const curve = speedCurveOf(c);
  if (curve) {
    const u = clamp(x, 0, 1);
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1];
      const b = curve[i];
      if (u <= b.at) {
        const span = b.at - a.at;
        if (span < 1e-9) return b.v;
        return a.v + (b.v - a.v) * (u - a.at) / span;
      }
    }
    return curve[curve.length - 1].v;
  }
  const v0 = safeSpeed(c.speed);
  const v1 = c.rampTo != null ? safeSpeed(c.rampTo) : v0;
  return v0 + (v1 - v0) * clamp(x, 0, 1);
}
function distanceAfter(c, L, tau) {
  if (tau <= 0) return 0;
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = safeSpeed(c.speed);
    const v1 = c.rampTo != null ? safeSpeed(c.rampTo) : v0;
    if (Math.abs(v1 - v0) < 1e-9) return Math.min(L, tau * v0);
    const k = (v1 - v0) / L;
    return clamp(v0 / k * (Math.exp(k * tau) - 1), 0, L);
  }
  const seg = (i) => ({
    a: curve[i].v,
    b: curve[i + 1].v,
    x0: curve[i].at,
    x1: curve[i + 1].at
  });
  const segTime = (g) => {
    const w = (g.x1 - g.x0) * L;
    if (w < 1e-9) return 0;
    if (Math.abs(g.b - g.a) < 1e-9) return w / g.a;
    return w / (g.b - g.a) * Math.log(g.b / g.a);
  };
  let left = tau;
  for (let i = 0; i < curve.length - 1; i++) {
    const g = seg(i);
    const dt = segTime(g);
    if (left <= dt || i === curve.length - 2) {
      const w = (g.x1 - g.x0) * L;
      const k = (g.b - g.a) / Math.max(1e-9, w);
      let x;
      if (Math.abs(k) < 1e-9) x = left * g.a;
      else x = g.a / k * (Math.exp(k * left) - 1);
      return clamp(g.x0 * L + Math.min(w, x), 0, L);
    }
    left -= dt;
  }
  return L;
}
function timeForDistance(c, L, x) {
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = safeSpeed(c.speed);
    const v1 = c.rampTo != null ? safeSpeed(c.rampTo) : v0;
    if (Math.abs(v1 - v0) < 1e-9) return x / v0;
    const k = (v1 - v0) / L;
    return Math.log(k * x / v0 + 1) / k;
  }
  let t = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const g = { a: curve[i].v, b: curve[i + 1].v, x0: curve[i].at, x1: curve[i + 1].at };
    const w = (g.x1 - g.x0) * L;
    const k = (g.b - g.a) / Math.max(1e-9, w);
    if (x <= g.x1 * L || i === curve.length - 2) {
      const dx = clamp(x - g.x0 * L, 0, w);
      if (Math.abs(k) < 1e-9) return t + dx / g.a;
      return t + Math.log(k * dx / g.a + 1) / k;
    }
    t += Math.abs(k) < 1e-9 ? w / g.a : w / (g.b - g.a) * Math.log(g.b / g.a);
  }
  return t;
}
function mainClipDuration(c) {
  const srcIn = Number.isFinite(c.in) ? c.in : 0;
  const srcOut = Number.isFinite(c.out) ? c.out : Math.max(srcIn + 0.1, srcIn + 5);
  if (c.freeze) return Math.max(0.1, srcOut - srcIn);
  const L = Math.max(0, srcOut - srcIn);
  if (L <= 0) return 0.1;
  const d = timeForDistance(c, L, L);
  return Number.isFinite(d) && d > 0 ? Math.max(0.1, d) : Math.max(0.1, L / safeSpeed(c.speed));
}
function mainSrcAt(c, localT) {
  if (c.freeze) return c.in + 1 / 60;
  const L = Math.max(1e-6, c.out - c.in);
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const x = clamp(distanceAfter(c, L, tau), 0, L);
  return c.reverse ? c.out - x : c.in + x;
}
function mainPlaybackRate(c, localT) {
  if (c.freeze) return 1;
  const L = Math.max(1e-6, c.out - c.in);
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  const r = speedAt(c, x / L);
  return Number.isFinite(r) && r > 0 ? Math.max(0.05, Math.min(16, r)) : safeSpeed(c.speed);
}
function mainClipGain(clip, span, next, t, hasPrevious = true) {
  if (clip.reverse || clip.freeze) return 0;
  const baseVolume = Number.isFinite(clip.volume) ? clip.volume : 1;
  let v = clip.muted ? 0 : Math.max(0, Math.min(1, baseVolume));
  if (hasPrevious && clip.transitionIn !== "none" && t < span.start && clip.transitionDur > 0) {
    v *= Math.max(0, Math.min(1, (t - (span.start - clip.transitionDur)) / clip.transitionDur));
  }
  if (next && next.clip.transitionIn !== "none" && next.clip.transitionDur > 0) {
    const winStart = next.start - next.clip.transitionDur;
    if (t >= winStart) {
      v *= Math.max(0, Math.min(1, 1 - (t - winStart) / next.clip.transitionDur));
    }
  }
  return Math.max(0, Math.min(1, v));
}
function mainSpans(project) {
  let t = 0;
  return project.main.map((clip) => {
    const dur = mainClipDuration(clip);
    const span = { clip, start: t, end: t + dur };
    t += dur;
    return span;
  });
}
function projectDuration(project) {
  const spans = mainSpans(project);
  let end = spans.length ? spans[spans.length - 1].end : 0;
  for (const tr of project.tracks)
    for (const c of tr.clips) end = Math.max(end, c.start + c.duration);
  return end;
}
function freezeClipFrom(clip, srcTime, hold = 3) {
  return {
    ...clip,
    id: uid("mc"),
    in: Math.max(0, srcTime),
    out: Math.max(0, srcTime) + Math.max(0.2, hold),
    freeze: true,
    speed: 1,
    rampTo: void 0,
    reverse: false,
    muted: true,
    transitionIn: "none",
    transitionDur: 0,
    keyframes: clip.keyframes ? clip.keyframes.map((k) => ({ at: k.at, v: { ...k.v } })) : void 0
  };
}

// src/mayocut/timeline-resolver.ts
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var finite = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
function makeLayer(spans, index, t, alpha) {
  const s = spans[index];
  const c = s.clip;
  const local = t - s.start;
  const next = index + 1 < spans.length ? spans[index + 1] : null;
  return {
    clip: c,
    index,
    start: s.start,
    end: s.end,
    local,
    src: finite(mainSrcAt(c, local), finite(c.in, 0)),
    rate: finite(mainPlaybackRate(c, local), 1),
    alpha: clamp01(alpha),
    gain: clamp01(mainClipGain(c, s, next, t, index > 0))
  };
}
function mainLayersAt(project, t) {
  const spans = mainSpans(project);
  for (let i = 1; i < spans.length; i++) {
    const c = spans[i].clip;
    if (c.transitionIn === "none") continue;
    const dur = Math.max(0, finite(c.transitionDur, 0));
    if (dur <= 0) continue;
    const winStart = spans[i].start - dur;
    if (t < winStart || t >= spans[i].start) continue;
    const progress = clamp01((t - winStart) / dur);
    const from = makeLayer(spans, i - 1, t, 1 - progress);
    const to = makeLayer(spans, i, t, progress);
    return { layers: [from, to], transition: { kind: c.transitionIn, progress, from, to } };
  }
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (t < s.start || t >= s.end) continue;
    return { layers: [makeLayer(spans, i, t, 1)], transition: null };
  }
  if (spans.length) {
    return { layers: [makeLayer(spans, spans.length - 1, t, 1)], transition: null };
  }
  return { layers: [], transition: null };
}
function overlayLayersAt(project, t) {
  const out = [];
  for (const tr of project.tracks) {
    if (tr.hidden) continue;
    for (const c of tr.clips) {
      const start = finite(c.start, 0);
      const dur = Math.max(0, finite(c.duration, 0));
      if (t < start || t >= start + dur) continue;
      const local = t - start;
      const rampIn = Math.min(1, local / 0.4);
      const rampOut = Math.min(1, (start + dur - t) / 0.3);
      out.push({
        clip: c,
        trackId: tr.id,
        local,
        fadeAlpha: c.anim && c.anim !== "none" ? clamp01(rampIn * rampOut) : 1
      });
    }
  }
  return out;
}
function resolveComposition(project, t) {
  const duration = projectDuration(project);
  const safeT = Math.max(0, Math.min(duration, finite(t, 0)));
  const { layers, transition } = mainLayersAt(project, safeT);
  const overlays = overlayLayersAt(project, safeT);
  return {
    t: safeT,
    duration,
    main: layers,
    transition,
    overlays,
    audioOverlays: overlays.filter((o) => o.clip.kind === "audio" && !!o.clip.mediaId),
    empty: layers.length === 0 && overlays.length === 0
  };
}

// src/mayocut/looks.ts
var LOOKS = [
  // ---------------------------------------------------------------- trending
  {
    id: "matcha",
    name: "Matcha",
    family: "trending",
    css: "saturate(1.25) hue-rotate(-12deg) brightness(1.04) contrast(1.05)",
    tint: { color: "#4b6b3a", mode: "soft-light", alpha: 0.22 },
    fade: 0.12,
    tags: "matcha green tea viral trend oil painting aesthetic"
  },
  {
    id: "dune",
    name: "Dune Light",
    family: "trending",
    css: "sepia(0.3) saturate(1.15) contrast(1.1) brightness(1.03)",
    tint: { color: "#c29a63", mode: "soft-light", alpha: 0.28 },
    grain: 0.1,
    tags: "dune light sand desert beige viral trending warm"
  },
  {
    id: "2016",
    name: "2016 Filter",
    family: "trending",
    css: "saturate(0.9) contrast(0.95) brightness(1.1) sepia(0.12)",
    fade: 0.3,
    grain: 0.06,
    tags: "2016 filter throwback tumblr soft nostalgic trend"
  },
  {
    id: "glow",
    name: "Dreamy Glow",
    family: "trending",
    css: "brightness(1.12) saturate(1.2) contrast(0.95) blur(0.4px)",
    tint: { color: "#ffd6e7", mode: "screen", alpha: 0.12 },
    tags: "dreamy glow bloom soft skin beauty trend"
  },
  {
    id: "velocity",
    name: "Velocity",
    family: "trending",
    css: "contrast(1.35) saturate(1.4) brightness(0.96)",
    tint: { color: "#0e2233", mode: "multiply", alpha: 0.18 },
    tags: "velocity edit dark contrast hype beat drop trend"
  },
  {
    id: "greennoise",
    name: "Green x Noise",
    family: "trending",
    css: "hue-rotate(-20deg) saturate(1.3) contrast(1.12) brightness(0.98)",
    grain: 0.24,
    tags: "green filter noise grain viral tiktok trend"
  },
  {
    id: "neonphoto",
    name: "Neon Photo",
    family: "trending",
    css: "hue-rotate(200deg) saturate(2.1) contrast(1.25) brightness(0.94)",
    tint: { color: "#7c3aed", mode: "screen", alpha: 0.16 },
    tags: "neon photo purple pfp trend cyber glow"
  },
  {
    id: "aestheticpink",
    name: "Aesthetic Love",
    family: "trending",
    css: "saturate(1.2) brightness(1.1) contrast(0.92) hue-rotate(-8deg)",
    tint: { color: "#ff9ec7", mode: "soft-light", alpha: 0.24 },
    fade: 0.2,
    tags: "aesthetic love pink cute soft girl trend"
  },
  // -------------------------------------------------------------------- film
  {
    id: "tealorange",
    name: "Teal & Orange",
    family: "film",
    css: "contrast(1.14) saturate(1.35) sepia(0.14) hue-rotate(-14deg)",
    tint: { color: "#0d5a6b", mode: "soft-light", alpha: 0.18 },
    tags: "teal orange blockbuster hollywood cinematic colour grade"
  },
  {
    id: "kodachrome",
    name: "Kodachrome",
    family: "film",
    css: "saturate(1.3) contrast(1.12) sepia(0.1) brightness(1.03)",
    grain: 0.08,
    tags: "kodachrome kodak film stock slide 1960s"
  },
  {
    id: "portra",
    name: "Portra 400",
    family: "film",
    css: "saturate(0.95) contrast(0.96) brightness(1.06) sepia(0.12)",
    tint: { color: "#f6d7b8", mode: "soft-light", alpha: 0.16 },
    grain: 0.1,
    tags: "portra 400 kodak portrait skin wedding film stock"
  },
  {
    id: "fuji",
    name: "Fuji 400H",
    family: "film",
    css: "saturate(0.92) contrast(0.98) brightness(1.05) hue-rotate(6deg)",
    tint: { color: "#bcd9c9", mode: "soft-light", alpha: 0.18 },
    grain: 0.09,
    tags: "fuji superia 400h green pastel japanese film stock"
  },
  {
    id: "cinestill",
    name: "Cinestill 800T",
    family: "film",
    css: "contrast(1.08) saturate(1.15) brightness(0.98) hue-rotate(14deg)",
    tint: { color: "#1b4f8a", mode: "screen", alpha: 0.14 },
    grain: 0.12,
    tags: "cinestill 800t tungsten night blue halation film"
  },
  {
    id: "bleach",
    name: "Bleach Bypass",
    family: "film",
    css: "saturate(0.45) contrast(1.42) brightness(1.05)",
    tags: "bleach bypass silver retention war desaturated"
  },
  {
    id: "technicolor",
    name: "Technicolor",
    family: "film",
    css: "saturate(1.6) contrast(1.2) hue-rotate(-4deg)",
    tags: "technicolor three strip saturated musical classic"
  },
  {
    id: "cinema",
    name: "Cinema",
    family: "film",
    css: "contrast(1.18) saturate(1.12) brightness(0.97)",
    tags: "cinema cinematic movie film neutral"
  },
  {
    id: "dramatic",
    name: "Dramatic",
    family: "film",
    css: "contrast(1.38) saturate(1.22) brightness(0.94)",
    tags: "dramatic high contrast strong punch"
  },
  {
    id: "fifties",
    name: "Fifties",
    family: "film",
    css: "sepia(0.3) saturate(0.9) contrast(0.95) brightness(1.08) hue-rotate(-10deg)",
    grain: 0.12,
    tags: "fifties 50s nostalgic old hollywood"
  },
  // ------------------------------------------------------------------ social
  {
    id: "cleangirl",
    name: "Clean Girl",
    family: "social",
    css: "brightness(1.08) saturate(1.02) contrast(0.98)",
    tint: { color: "#fff4e8", mode: "soft-light", alpha: 0.14 },
    tags: "clean girl minimal bright skin skincare beige"
  },
  {
    id: "kdrama",
    name: "K-Drama",
    family: "social",
    css: "brightness(1.1) contrast(0.94) saturate(1.08) hue-rotate(-4deg)",
    tint: { color: "#ffe6ef", mode: "screen", alpha: 0.1 },
    fade: 0.16,
    tags: "kdrama korean bright soft pastel romance drama"
  },
  {
    id: "goldenhour",
    name: "Golden Hour",
    family: "social",
    css: "sepia(0.32) saturate(1.4) brightness(1.06) contrast(1.03)",
    tags: "golden hour sunset warm glow travel portrait"
  },
  {
    id: "sunset",
    name: "Sunset",
    family: "social",
    css: "sepia(0.3) saturate(1.5) hue-rotate(-18deg) brightness(1.06)",
    tags: "sunset orange pink sky summer"
  },
  {
    id: "pastel",
    name: "Pastel",
    family: "social",
    css: "brightness(1.09) saturate(1.25) contrast(0.88) hue-rotate(6deg)",
    fade: 0.18,
    tags: "pastel soft light cute cutesy"
  },
  {
    id: "summer",
    name: "Summer",
    family: "social",
    css: "saturate(1.35) brightness(1.07) contrast(1.02) hue-rotate(-6deg)",
    tags: "summer beach holiday sun bright vacation"
  },
  {
    id: "vivid",
    name: "Vivid",
    family: "social",
    css: "saturate(1.4) contrast(1.1)",
    tags: "vivid pop punchy bright colours"
  },
  {
    id: "punch",
    name: "Punch",
    family: "social",
    css: "contrast(1.28) saturate(1.45)",
    tags: "punch strong bold social feed"
  },
  {
    id: "clean",
    name: "Clean",
    family: "social",
    css: "brightness(1.04) contrast(1.04) saturate(1.05)",
    tags: "clean natural neutral true to life"
  },
  // -------------------------------------------------------------------- mood
  {
    id: "moody",
    name: "Moody",
    family: "mood",
    css: "contrast(1.26) brightness(0.88) saturate(0.82)",
    tags: "moody dark desaturated sad cinematic"
  },
  {
    id: "darkmood",
    name: "Dark & Moody",
    family: "mood",
    css: "brightness(0.82) contrast(1.3) saturate(0.85)",
    vignette: 0.3,
    tags: "dark moody low key shadow thriller"
  },
  {
    id: "night",
    name: "Night",
    family: "mood",
    css: "hue-rotate(12deg) saturate(1.08) brightness(0.9) contrast(1.12)",
    tint: { color: "#12224a", mode: "multiply", alpha: 0.2 },
    tags: "night blue dark city evening"
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    family: "mood",
    css: "contrast(1.3) saturate(1.6) hue-rotate(-25deg) brightness(0.95)",
    tint: { color: "#ff2e88", mode: "screen", alpha: 0.14 },
    tags: "cyberpunk neon magenta future sci fi"
  },
  {
    id: "arctic",
    name: "Arctic",
    family: "mood",
    css: "hue-rotate(-18deg) saturate(1.2) brightness(1.08) contrast(1.05)",
    tint: { color: "#cfe8ff", mode: "soft-light", alpha: 0.2 },
    tags: "arctic cold blue ice winter cool"
  },
  {
    id: "winter",
    name: "Winter",
    family: "mood",
    css: "hue-rotate(8deg) saturate(0.88) brightness(1.06) contrast(1.05)",
    tags: "winter snow pale cool frost"
  },
  {
    id: "autumn",
    name: "Autumn",
    family: "mood",
    css: "sepia(0.22) saturate(1.35) hue-rotate(-12deg) brightness(1.02)",
    tags: "autumn fall leaves orange warm"
  },
  {
    id: "infrared",
    name: "Infrared",
    family: "mood",
    css: "hue-rotate(155deg) saturate(1.7) contrast(1.15)",
    tags: "infrared false colour surreal aerochrome"
  },
  {
    id: "duotone",
    name: "Duotone",
    family: "mood",
    css: "grayscale(1) contrast(1.25) sepia(0.4) hue-rotate(180deg) saturate(1.6)",
    tags: "duotone two colour poster graphic"
  },
  // -------------------------------------------------------------------- mono
  {
    id: "bw",
    name: "B&W",
    family: "mono",
    css: "grayscale(1)",
    tags: "black white mono grey grayscale"
  },
  {
    id: "noir",
    name: "Noir",
    family: "mono",
    css: "grayscale(1) contrast(1.35) brightness(0.95)",
    vignette: 0.35,
    grain: 0.1,
    tags: "noir black white hard shadow detective"
  },
  {
    id: "monohigh",
    name: "Mono High",
    family: "mono",
    css: "grayscale(1) contrast(1.55) brightness(1.08)",
    tags: "mono high contrast punchy black white"
  },
  {
    id: "silver",
    name: "Silver",
    family: "mono",
    css: "grayscale(0.85) contrast(1.2) brightness(1.04)",
    tags: "silver desaturated subtle metallic"
  },
  {
    id: "cyanotype",
    name: "Cyanotype",
    family: "mono",
    css: "grayscale(1) sepia(1) hue-rotate(160deg) saturate(1.8) contrast(1.1)",
    tags: "cyanotype blue print photographic"
  },
  // ------------------------------------------------------------------- vivid
  {
    id: "warm",
    name: "Warm",
    family: "vivid",
    css: "sepia(0.25) saturate(1.25) brightness(1.05)",
    tags: "warm cozy orange heat"
  },
  {
    id: "cool",
    name: "Cool",
    family: "vivid",
    css: "hue-rotate(-8deg) saturate(1.15) brightness(1.02)",
    tags: "cool blue cold calm"
  },
  {
    id: "clarity",
    name: "Clarity",
    family: "vivid",
    css: "contrast(1.14) saturate(1.1) brightness(1.02)",
    tags: "clarity sharp crisp detail"
  },
  {
    id: "soft",
    name: "Soft",
    family: "vivid",
    css: "brightness(1.08) saturate(1.06) blur(0.4px)",
    tags: "soft gentle blur dreamy"
  },
  {
    id: "dreamy",
    name: "Dreamy",
    family: "vivid",
    css: "brightness(1.12) saturate(1.18) blur(0.6px)",
    tags: "dreamy hazy blur soft focus"
  },
  // ------------------------------------------------------------------- retro
  {
    id: "vintage",
    name: "Vintage",
    family: "retro",
    css: "sepia(0.4) contrast(1.05) brightness(1.06) saturate(0.85)",
    grain: 0.16,
    fade: 0.14,
    tags: "vintage old retro faded antique"
  },
  {
    id: "retro",
    name: "Retro Film",
    family: "retro",
    css: "sepia(0.45) contrast(1.1) saturate(1.25) brightness(1.02) hue-rotate(-6deg)",
    grain: 0.14,
    tags: "retro film 70s 80s analog"
  },
  {
    id: "faded",
    name: "Faded",
    family: "retro",
    css: "contrast(0.9) brightness(1.07) saturate(0.72) sepia(0.16)",
    fade: 0.34,
    tags: "faded matte washed out low contrast"
  },
  {
    id: "grunge",
    name: "Grunge",
    family: "retro",
    css: "contrast(1.35) saturate(0.7) brightness(0.92) sepia(0.2)",
    grain: 0.22,
    vignette: 0.3,
    tags: "grunge dirty gritty texture rock"
  },
  {
    id: "sepia",
    name: "Sepia",
    family: "retro",
    css: "sepia(0.85) contrast(1.05) brightness(1.02)",
    tags: "sepia brown old photo"
  },
  {
    id: "vhs",
    name: "VHS 1998",
    family: "retro",
    css: "saturate(1.2) contrast(1.12) brightness(1.02) hue-rotate(-4deg)",
    grain: 0.3,
    tint: { color: "#2bd1c4", mode: "screen", alpha: 0.08 },
    label: "1998 PLAY",
    tags: "vhs 90s video tape camcorder retro glitch"
  },
  {
    id: "polaroid",
    name: "Polaroid",
    family: "retro",
    css: "saturate(0.9) contrast(1.08) brightness(1.08) sepia(0.2)",
    grain: 0.14,
    fade: 0.22,
    label: "SX-70",
    tags: "polaroid instant photo print square white border"
  },
  {
    id: "super8",
    name: "Super 8",
    family: "retro",
    css: "sepia(0.28) saturate(1.1) contrast(1.12) brightness(1.02)",
    grain: 0.26,
    vignette: 0.4,
    tags: "super 8 home movie 8mm grain nostalgic"
  }
];
var LEGACY_LOOK_IDS = {
  "mono-high": "monohigh",
  silvertone: "silver",
  "neon-night": "neonphoto",
  golden: "goldenhour",
  // shipped in the first catalogue, superseded by the film stock it imitated
  kodak: "kodachrome",
  orange_teal: "tealorange",
  "orange-teal": "tealorange"
};
function resolveLookId(id) {
  return LEGACY_LOOK_IDS[id] ?? id;
}
var LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

// src/mayocut/geometry.ts
var MAX_ZOOM = 8;
function clampGeometry(g) {
  const ax = Number.isFinite(g?.ax) ? g.ax : 0.5;
  const ay = Number.isFinite(g?.ay) ? g.ay : 0.5;
  const zoom = Number.isFinite(g?.zoom) ? g.zoom : 1;
  const rot = Number.isFinite(g?.rot) ? g.rot : 0;
  const crop = g?.crop;
  return {
    ax: Math.max(0, Math.min(1, ax)),
    ay: Math.max(0, Math.min(1, ay)),
    crop: typeof crop === "number" && Number.isFinite(crop) && crop > 0 ? crop : null,
    zoom: Math.max(1, Math.min(MAX_ZOOM, zoom)),
    // wrap rather than clamp: a person spinning a dial past 180 expects to keep
    // going, not to hit a wall
    rot: ((rot + 180) % 360 + 360) % 360 - 180
  };
}
function isDefaultGeometry(g) {
  if (!g) return true;
  const c = clampGeometry(g);
  return c.ax === 0.5 && c.ay === 0.5 && c.zoom === 1 && c.rot === 0 && c.crop === null;
}
function coverSourceRect(sw, sh, frameW, frameH, g) {
  const c = clampGeometry(g);
  if (!sw || !sh || !frameW || !frameH) return { sx: 0, sy: 0, swp: sw, shp: sh };
  const cover = Math.max(frameW / sw, frameH / sh);
  let w = frameW / cover;
  let h = frameH / cover;
  if (c.crop) {
    const windowAspect = w / h;
    if (c.crop < windowAspect) {
      w = h * c.crop;
    } else if (c.crop > windowAspect) {
      h = w / c.crop;
    }
  }
  w = Math.max(1, w / c.zoom);
  h = Math.max(1, h / c.zoom);
  w = Math.min(w, sw);
  h = Math.min(h, sh);
  const maxX = Math.max(0, sw - w);
  const maxY = Math.max(0, sh - h);
  const sx = Math.max(0, Math.min(maxX, c.ax * sw - w / 2));
  const sy = Math.max(0, Math.min(maxY, c.ay * sh - h / 2));
  return { sx, sy, swp: w, shp: h };
}
var CROP_PRESETS = [
  { id: "free", name: "Free", aspect: null },
  { id: "original", name: "Original", aspect: 0 },
  { id: "1:1", name: "1:1", aspect: 1 },
  { id: "4:5", name: "4:5", aspect: 4 / 5 },
  { id: "9:16", name: "9:16", aspect: 9 / 16 },
  { id: "3:4", name: "3:4", aspect: 3 / 4 },
  { id: "16:9", name: "16:9", aspect: 16 / 9 },
  { id: "4:3", name: "4:3", aspect: 4 / 3 },
  { id: "21:9", name: "21:9", aspect: 21 / 9 }
];

// src/mayocut/export-plan.ts
function pixelRatio(a, b) {
  const pa = Math.max(1, a.width * a.height);
  const pb = Math.max(1, b.width * b.height);
  return pa / pb;
}
function planSteppedExport(opts, throughput) {
  const durationSec = Math.max(0, opts.durationSec);
  const fps = Math.max(1, Math.round(opts.fps));
  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  const base = {
    durationSec,
    fps,
    totalFrames,
    width: opts.width,
    height: opts.height
  };
  if (!throughput || throughput.framesPerSecond <= 0) {
    const assumed = 12;
    const ratio2 = pixelRatio({ width: 1920, height: 1080 }, opts);
    const fpsOut = assumed * Math.max(0.15, Math.min(4, ratio2));
    const estimatedSec2 = totalFrames / Math.max(0.1, fpsOut);
    const slowFactor2 = durationSec > 0 ? estimatedSec2 / durationSec : null;
    return {
      ...base,
      strategy: slowFactor2 !== null && slowFactor2 > REALTIME_CUTOFF ? "realtime" : "stepped",
      estimatedSec: estimatedSec2,
      slowFactor: slowFactor2,
      heuristic: true,
      summary: `Roughly ${fmtDuration(estimatedSec2)} to render ${totalFrames} frames (${durationSec > 0 ? (estimatedSec2 / durationSec).toFixed(1) : "?"}\xD7 real time).`
    };
  }
  const ratio = pixelRatio(throughput, opts);
  const measuredFps = throughput.framesPerSecond * Math.max(0.15, Math.min(4, ratio));
  const estimatedSec = totalFrames / Math.max(0.1, measuredFps);
  const slowFactor = durationSec > 0 ? estimatedSec / durationSec : null;
  return {
    ...base,
    strategy: slowFactor !== null && slowFactor > REALTIME_CUTOFF ? "realtime" : "stepped",
    estimatedSec,
    slowFactor,
    heuristic: throughput.sampleMs < 400,
    summary: `About ${fmtDuration(estimatedSec)} to render ${totalFrames} frames (${durationSec > 0 ? (estimatedSec / durationSec).toFixed(1) : "?"}\xD7 real time, measured on this device).`
  };
}
var REALTIME_CUTOFF = 6;
function recordThroughput(frames, elapsedMs, size) {
  if (!Number.isFinite(frames) || !Number.isFinite(elapsedMs)) return null;
  if (frames <= 0 || elapsedMs <= 0) return null;
  return {
    framesPerSecond: frames / (elapsedMs / 1e3),
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
    sampleMs: elapsedMs
  };
}
function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0 s";
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

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
function audioFxRecipe(id) {
  const dry = { rate: 1, gain: 1, filters: [] };
  switch (id) {
    case "none":
      return dry;
    case "echo":
      return {
        rate: 1,
        gain: 1,
        filters: [],
        delay: { time: 0.28, feedback: 0.32, wet: 0.45 }
      };
    case "reverb":
      return {
        rate: 1,
        gain: 1,
        filters: [],
        reverbSec: 1.4,
        delay: { time: 0, feedback: 0, wet: 0.5 }
      };
    case "room":
      return {
        rate: 1,
        gain: 1,
        filters: [],
        reverbSec: 0.55,
        delay: { time: 0, feedback: 0, wet: 0.4 }
      };
    case "stadium":
      return {
        rate: 1,
        gain: 1,
        filters: [{ type: "highpass", frequency: 180 }],
        reverbSec: 3.2,
        delay: { time: 0, feedback: 0, wet: 0.62 }
      };
    case "cave":
      return {
        rate: 1,
        gain: 1,
        filters: [{ type: "lowpass", frequency: 1400 }],
        reverbSec: 4.5,
        delay: { time: 0, feedback: 0, wet: 0.7 }
      };
    case "chipmunk":
      return { rate: 1.42, gain: 1, filters: [{ type: "highpass", frequency: 140 }] };
    case "deep":
      return { rate: 0.74, gain: 1.05, filters: [{ type: "lowshelf", frequency: 200, gain: 4 }] };
    case "telephone":
      return {
        rate: 1,
        gain: 1.1,
        filters: [
          { type: "highpass", frequency: 420, q: 0.9 },
          { type: "lowpass", frequency: 3100, q: 0.9 },
          { type: "peaking", frequency: 1600, gain: 6, q: 1.2 }
        ]
      };
    case "radio":
      return {
        rate: 1,
        gain: 1.1,
        filters: [
          { type: "highpass", frequency: 500 },
          { type: "lowpass", frequency: 2600 },
          { type: "peaking", frequency: 1200, gain: 5, q: 1 }
        ]
      };
    case "lofi":
      return {
        rate: 0.96,
        gain: 1,
        filters: [
          { type: "lowpass", frequency: 5200 },
          { type: "highpass", frequency: 90 }
        ],
        flutterCents: 6
      };
    case "robot":
      return { rate: 1, gain: 0.95, filters: [], ringHz: 58 };
    case "underwater":
      return {
        rate: 0.92,
        gain: 1,
        filters: [{ type: "lowpass", frequency: 640, q: 3 }],
        flutterCents: 14
      };
    case "megaphone":
      return {
        rate: 1,
        gain: 1.15,
        filters: [
          { type: "highpass", frequency: 700 },
          { type: "peaking", frequency: 2e3, gain: 9, q: 1.4 },
          { type: "lowpass", frequency: 4800 }
        ]
      };
    case "whisper":
      return {
        rate: 1,
        gain: 0.7,
        filters: [
          { type: "highpass", frequency: 2200 },
          { type: "lowpass", frequency: 9e3 }
        ]
      };
    case "vinyl":
      return {
        rate: 1,
        gain: 1,
        filters: [
          { type: "lowpass", frequency: 7e3 },
          { type: "peaking", frequency: 300, gain: 3, q: 0.8 }
        ],
        flutterCents: 3
      };
    default:
      return dry;
  }
}
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
function buildAudioFx(ctx, id, opts = {}) {
  const recipe = audioFxRecipe(id);
  const nodes = [];
  let head = ctx.createGain();
  const inputGain = head;
  inputGain.gain.value = 1;
  nodes.push(head);
  for (const f of recipe.filters) {
    const bq = ctx.createBiquadFilter();
    bq.type = f.type;
    bq.frequency.value = f.frequency;
    if (f.q !== void 0) bq.Q.value = f.q;
    if (f.gain !== void 0) bq.gain.value = f.gain;
    head.connect(bq);
    head = bq;
    nodes.push(bq);
  }
  if (recipe.ringHz && recipe.ringHz > 0) {
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = recipe.ringHz;
    const depth = ctx.createGain();
    depth.gain.value = 1;
    osc.connect(depth);
    depth.connect(ring.gain);
    osc.start();
    head.connect(ring);
    head = ring;
    nodes.push(ring, osc, depth);
  }
  if (recipe.reverbSec && recipe.reverbSec > 0) {
    const wet = ctx.createGain();
    wet.gain.value = Math.max(0, Math.min(1, recipe.delay?.wet ?? 0.5));
    const conv = ctx.createConvolver();
    conv.buffer = opts.impulse ? opts.impulse(recipe.reverbSec) : makeImpulse(ctx, recipe.reverbSec);
    head.connect(conv);
    conv.connect(wet);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    head.connect(mix);
    wet.connect(mix);
    head = mix;
    nodes.push(conv, wet, mix);
  } else if (recipe.delay && recipe.delay.time > 0) {
    const d = recipe.delay;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = Math.max(1e-3, d.time);
    const fb = ctx.createGain();
    fb.gain.value = Math.max(0, Math.min(0.95, d.feedback));
    const wet = ctx.createGain();
    wet.gain.value = Math.max(0, Math.min(1, d.wet));
    head.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    head.connect(mix);
    wet.connect(mix);
    head = mix;
    nodes.push(delay, fb, wet, mix);
  }
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(2, recipe.gain));
  head.connect(out);
  nodes.push(out);
  return { input: inputGain, output: out, rate: recipe.rate, nodes };
}

// src/mayocut/curves.ts
function isIdentity(points) {
  if (!points || points.length < 2) return true;
  return points.every((p, i) => {
    const want = i / (points.length - 1);
    return Math.abs(p.x - want) < 1e-6 && Math.abs(p.y - want) < 1e-6;
  });
}
function curvesActive(c) {
  if (!c) return false;
  return !isIdentity(c.rgb) || !isIdentity(c.r) || !isIdentity(c.g) || !isIdentity(c.b);
}
function normalisePoints(points) {
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) })).sort((a, b) => a.x - b.x);
  const out = [];
  for (const p of clean) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 1e-4) continue;
    out.push(p);
  }
  if (!out.length || out[0].x > 1e-4) out.unshift({ x: 0, y: out[0]?.y ?? 0 });
  if (out[out.length - 1].x < 1 - 1e-4) out.push({ x: 1, y: out[out.length - 1].y });
  return out;
}
function evalCurve(points, x) {
  const pts = normalisePoints(points);
  const n = pts.length;
  if (n === 0) return x;
  if (n === 1) return pts[0].y;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[n - 1].x) return pts[n - 1].y;
  let i = 0;
  while (i < n - 2 && x > pts[i + 1].x) i++;
  const x0 = pts[i].x;
  const x1 = pts[i + 1].x;
  const y0 = pts[i].y;
  const y1 = pts[i + 1].y;
  const h = x1 - x0;
  if (h <= 1e-9) return y1;
  const d = [];
  for (let k = 0; k < n - 1; k++) d.push((pts[k + 1].y - pts[k].y) / (pts[k + 1].x - pts[k].x));
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) m[k] = 0;
    else m[k] = (d[k - 1] + d[k]) / 2;
  }
  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const h2 = a * a + b * b;
    if (h2 > 9) {
      const t4 = 3 / Math.sqrt(h2);
      m[k] = t4 * a * d[k];
      m[k + 1] = t4 * b * d[k];
    }
  }
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
}
function curveLut(points) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(evalCurve(points, i / 255) * 255);
  return lut;
}
function buildCurveLuts(c) {
  if (!c || !curvesActive(c)) return null;
  return {
    rgb: isIdentity(c.rgb) ? null : curveLut(c.rgb),
    r: isIdentity(c.r) ? null : curveLut(c.r),
    g: isIdentity(c.g) ? null : curveLut(c.g),
    b: isIdentity(c.b) ? null : curveLut(c.b)
  };
}
function applyCurveLuts(d, luts) {
  const { rgb, r, g, b } = luts;
  for (let i = 0; i < d.length; i += 4) {
    let R = d[i];
    let G = d[i + 1];
    let B = d[i + 2];
    if (rgb) {
      R = rgb[R];
      G = rgb[G];
      B = rgb[B];
    }
    if (r) R = r[R];
    if (g) G = g[G];
    if (b) B = b[B];
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
  }
}

// src/mayocut/hsl.ts
var HSL_BANDS = [
  { id: "red", name: "Red", center: 0, swatch: "#ef4444" },
  { id: "orange", name: "Orange", center: 30, swatch: "#f97316" },
  { id: "yellow", name: "Yellow", center: 60, swatch: "#eab308" },
  { id: "green", name: "Green", center: 120, swatch: "#22c55e" },
  { id: "cyan", name: "Cyan", center: 180, swatch: "#06b6d4" },
  { id: "blue", name: "Blue", center: 240, swatch: "#3b82f6" },
  { id: "purple", name: "Purple", center: 280, swatch: "#8b5cf6" },
  { id: "magenta", name: "Magenta", center: 320, swatch: "#d946ef" }
];
var HSL_CENTERS = Object.fromEntries(
  HSL_BANDS.map((b) => [b.id, b.center])
);
function hslActive(set) {
  if (!set) return false;
  return Object.values(set).some(
    (a) => a && ((a.h ?? 0) !== 0 || (a.s ?? 0) !== 0 || (a.l ?? 0) !== 0)
  );
}
function activeBands(set) {
  const out = [];
  for (const band of HSL_BANDS) {
    const adj = set[band.id];
    if (!adj) continue;
    const h = adj.h ?? 0;
    const s = adj.s ?? 0;
    const l = adj.l ?? 0;
    if (h === 0 && s === 0 && l === 0) continue;
    out.push({
      center: band.center,
      hue: h / 100 * 30,
      // ±100 → ±30°, so a band cannot swallow its neighbour
      sat: s / 100,
      lum: l / 100 * 0.35
      // ±100 → ±0.35 luminance
    });
  }
  return out;
}
function applyHsl(d, set) {
  const bands = activeBands(set);
  if (bands.length === 0) return;
  const nb = bands.length;
  const centers = new Float32Array(nb);
  const hues = new Float32Array(nb);
  const sats = new Float32Array(nb);
  const lums = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    centers[b] = bands[b].center;
    hues[b] = bands[b].hue;
    sats[b] = bands[b].sat;
    lums[b] = bands[b].lum;
  }
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b2 = d[i + 2];
    const rn = r / 255;
    const gn = g / 255;
    const bn = b2 / 255;
    const max = rn > gn ? rn > bn ? rn : bn : gn > bn ? gn : bn;
    const min = rn < gn ? rn < bn ? rn : bn : gn < bn ? gn : bn;
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta < 1e-9) continue;
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (s < 0.02) continue;
    let h;
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;
    let dH = 0;
    let sMul = 0;
    let dL = 0;
    let total = 0;
    for (let bi = 0; bi < nb; bi++) {
      let dd = h - centers[bi];
      if (dd < 0) dd = -dd;
      if (dd > 180) dd = 360 - dd;
      if (dd >= 30) continue;
      const w = 1 - dd / 30;
      dH += hues[bi] * w;
      sMul += sats[bi] * w;
      dL += lums[bi] * w;
      total += w;
    }
    if (total === 0) continue;
    const sOut = s * (1 + sMul);
    const lOut = l + dL;
    const ss = sOut < 0 ? 0 : sOut > 1 ? 1 : sOut;
    const ll = lOut < 0 ? 0 : lOut > 1 ? 1 : lOut;
    const hh = ((h + dH) % 360 + 360) % 360 / 360;
    if (ss <= 0) {
      const v = ll * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      continue;
    }
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    let t = hh + 1 / 3;
    if (t < 0) t += 1;
    else if (t > 1) t -= 1;
    d[i] = (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p) * 255;
    t = hh;
    d[i + 1] = (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p) * 255;
    t = hh - 1 / 3;
    if (t < 0) t += 1;
    else if (t > 1) t -= 1;
    d[i + 2] = (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p) * 255;
  }
}

// src/mayocut/playback.ts
var HAVE_CURRENT_DATA = 2;
function blocksPlayback(s) {
  if (s.videoBroken) return false;
  if (s.seeking) return true;
  if (s.readyState >= HAVE_CURRENT_DATA) return false;
  return !s.warm;
}
function shouldHardStop(states) {
  const relevant = states.filter((s) => !s.videoBroken);
  if (relevant.length === 0) return false;
  return relevant.every((s) => s.readyState < HAVE_CURRENT_DATA && !s.warm);
}

// src/mayocut/proxy.ts
function sourceFor(consumer, originalUrl, proxyUrl) {
  if (consumer === "export") return originalUrl;
  return proxyUrl || originalUrl;
}

// src/mayocut/luts.ts
function applyLut(table, px) {
  const n = table.size;
  const scale = (n - 1) / 255;
  const data = table.data;
  const step = n * n;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] * scale;
    const g = px[i + 1] * scale;
    const b = px[i + 2] * scale;
    const r0 = Math.min(n - 2, r | 0);
    const g0 = Math.min(n - 2, g | 0);
    const b0 = Math.min(n - 2, b | 0);
    const rf = r - r0;
    const gf = g - g0;
    const bf = b - b0;
    for (let c = 0; c < 3; c++) {
      const v000 = data[(b0 * step + g0 * n + r0) * 3 + c];
      const v100 = data[(b0 * step + g0 * n + r0 + 1) * 3 + c];
      const v010 = data[(b0 * step + (g0 + 1) * n + r0) * 3 + c];
      const v110 = data[(b0 * step + (g0 + 1) * n + r0 + 1) * 3 + c];
      const v001 = data[((b0 + 1) * step + g0 * n + r0) * 3 + c];
      const v101 = data[((b0 + 1) * step + g0 * n + r0 + 1) * 3 + c];
      const v011 = data[((b0 + 1) * step + (g0 + 1) * n + r0) * 3 + c];
      const v111 = data[((b0 + 1) * step + (g0 + 1) * n + r0 + 1) * 3 + c];
      const c00 = v000 + (v100 - v000) * rf;
      const c10 = v010 + (v110 - v010) * rf;
      const c01 = v001 + (v101 - v001) * rf;
      const c11 = v011 + (v111 - v011) * rf;
      const c0 = c00 + (c10 - c00) * gf;
      const c1 = c01 + (c11 - c01) * gf;
      const v = c0 + (c1 - c0) * bf;
      px[i + c] = v * 255;
    }
  }
}

// src/mayocut/timeline.ts
function sampleTimeline(project, time) {
  if (!Number.isFinite(time) || time < 0) throw new RangeError("Invalid timeline time");
  const spans = mainSpans(project);
  const main = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const clip = span.clip;
    const dur = i > 0 && clip.transitionIn !== "none" ? Math.max(0, clip.transitionDur) : 0;
    const transitionStart = span.start - dur;
    if (time < transitionStart || time >= span.end) continue;
    const transition = dur > 0 && time < span.start ? {
      kind: clip.transitionIn,
      progress: Math.max(0, Math.min(1, (time - transitionStart) / dur)),
      previous: spans[i - 1]
    } : null;
    main.push({
      ...span,
      sourceTime: mainSrcAt(clip, time - span.start),
      playbackRate: mainPlaybackRate(clip, time - span.start),
      gain: mainClipGain(clip, span, spans[i + 1] ?? null, time),
      transition
    });
  }
  const overlays = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (time < clip.start || time >= clip.start + clip.duration) continue;
      const localTime = time - clip.start;
      overlays.push({
        trackId: track.id,
        clip,
        localTime,
        sourceTime: (clip.sourceOffset ?? 0) + localTime * (clip.kind === "video" ? clip.speed ?? 1 : 1)
      });
    }
  }
  return { time, main, overlays };
}

// src/mayocut/ripple.ts
function rippleOverlays(tracks, at, delta) {
  if (!Number.isFinite(delta) || delta === 0) return { moved: 0, tracks };
  let moved = 0;
  const next = tracks.map((tr) => {
    let changed = false;
    const clips = tr.clips.map((c) => {
      if (c.start < at - 1e-6) return c;
      changed = true;
      moved++;
      return { ...c, start: Math.max(0, c.start + delta) };
    });
    return changed ? { ...tr, clips } : tr;
  });
  return { moved, tracks: next };
}
var MIN_KEEP = 0.05;
function cutOverlays(tracks, span) {
  let removed = 0;
  let trimmed = 0;
  const len = span.end - span.start;
  if (!(len > 0)) return { removed: 0, trimmed: 0, tracks };
  const next = tracks.map((tr) => {
    const clips = [];
    for (const c of tr.clips) {
      const cEnd = c.start + c.duration;
      if (cEnd <= span.start + 1e-6 || c.start >= span.end - 1e-6) {
        clips.push(c);
        continue;
      }
      const head = Math.max(0, span.start - c.start);
      const tail = Math.max(0, cEnd - span.end);
      if (head > MIN_KEEP && tail > MIN_KEEP) {
        clips.push({ ...c, id: `${c.id}_a`, duration: head });
        clips.push({
          ...c,
          id: `${c.id}_b`,
          start: span.start,
          duration: tail,
          // the tail keeps its content timing relative to the source
          sourceOffset: (c.sourceOffset ?? 0) + (span.end - c.start)
        });
        trimmed++;
        continue;
      }
      if (head > MIN_KEEP) {
        clips.push({ ...c, duration: head });
        trimmed++;
        continue;
      }
      if (tail > MIN_KEEP) {
        clips.push({
          ...c,
          start: span.start,
          duration: tail,
          sourceOffset: (c.sourceOffset ?? 0) + (span.end - c.start)
        });
        trimmed++;
        continue;
      }
      removed++;
    }
    return { ...tr, clips };
  });
  return { removed, trimmed, tracks: next };
}
function removeMainClip(project, clipId, mode = "ripple", startOf, durationOf) {
  const i = project.main.findIndex((c) => c.id === clipId);
  if (i === -1) return null;
  const start = startOf(i);
  const dur = durationOf(i);
  const span = { start, end: start + dur };
  const main = project.main.filter((_, k) => k !== i);
  if (mode === "ripple") {
    const r2 = rippleOverlays(project.tracks, span.end, -dur);
    return {
      main,
      tracks: r2.tracks,
      shifted: dur,
      overlaysRemoved: 0,
      overlaysTrimmed: 0,
      overlaysMoved: r2.moved,
      span
    };
  }
  const r = cutOverlays(project.tracks, span);
  return {
    main,
    tracks: r.tracks,
    shifted: 0,
    overlaysRemoved: r.removed,
    overlaysTrimmed: r.trimmed,
    overlaysMoved: 0,
    span
  };
}

// src/mayocut/scopes.ts
function lumaOf(r, g, b) {
  return r * 77 + g * 150 + b * 29 >> 8;
}
function buildScopes(data, opts = {}) {
  const step = Math.max(1, Math.floor(opts.step ?? 2));
  const width = opts.width ?? 0;
  const colW = Math.max(1, Math.min(256, Math.round(width / Math.max(1, step)) || 256));
  const hist = {
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    y: new Uint32Array(256)
  };
  const WAVE_H = 256;
  const wave = new Uint32Array(colW * WAVE_H);
  const VS = 64;
  const vec = new Uint32Array(VS * VS);
  let total = 0;
  let clipped = 0;
  let crushed = 0;
  let satSum = 0;
  let atLimit = 0;
  const px = Math.max(1, width);
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (data.length % 4 !== 0 && i + 2 >= data.length) break;
    hist.r[r]++;
    hist.g[g]++;
    hist.b[b]++;
    const y = lumaOf(r, g, b);
    hist.y[y]++;
    total++;
    if (r === 255 || g === 255 || b === 255) clipped++;
    if (r === 0 && g === 0 && b === 0) crushed++;
    const pixelIndex = i / 4;
    const x = px > 0 ? pixelIndex % px : 0;
    const col = Math.min(colW - 1, Math.floor(x / px * colW));
    wave[col * WAVE_H + y]++;
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const vx = Math.max(0, Math.min(63, Math.round(32 + cb / 4)));
    const vy = Math.max(0, Math.min(63, Math.round(32 + cr / 4)));
    vec[vy * VS + vx]++;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
    satSum += sat;
    if (sat > 0.92) atLimit++;
  }
  let peak = 1;
  for (let i = 0; i < 256; i++) {
    if (hist.r[i] > peak) peak = hist.r[i];
    if (hist.g[i] > peak) peak = hist.g[i];
    if (hist.b[i] > peak) peak = hist.b[i];
    if (hist.y[i] > peak) peak = hist.y[i];
  }
  let wavePeak = 1;
  for (let i = 0; i < wave.length; i++) if (wave[i] > wavePeak) wavePeak = wave[i];
  let vecPeak = 1;
  for (let i = 0; i < vec.length; i++) if (vec[i] > vecPeak) vecPeak = vec[i];
  return {
    histogram: { ...hist, peak, total, clipped, crushed },
    waveform: { w: colW, data: wave, peak: wavePeak },
    vectorscope: {
      n: VS,
      data: vec,
      peak: vecPeak,
      meanSaturation: total > 0 ? satSum / total : 0,
      atLimit
    }
  };
}

// src/mayocut/engine.ts
var import_omggif = __toESM(require_omggif(), 1);
function decodeGifFrames(blob) {
  return new Promise((resolve) => {
    if (blob.size > 8 * 1024 * 1024) return resolve(null);
    blob.arrayBuffer().then((ab) => {
      const reader = new import_omggif.GifReader(new Uint8Array(ab));
      const count = Math.min(48, reader.numFrames());
      const info = reader.frameInfo(0);
      if (!info || count === 0) return resolve(null);
      if (info.width > 400 || info.height > 400) return resolve(null);
      const frames = [];
      let ms = 0;
      for (let k = 0; k < count; k++) {
        const fi = reader.frameInfo(k);
        ms += fi?.delay ?? 0.1;
        const image = new ImageData(info.width, info.height);
        reader.decodeAndBlitFrameRGBA(k, image.data);
        const c = document.createElement("canvas");
        c.width = info.width;
        c.height = info.height;
        c.getContext("2d")?.putImageData(image, 0, 0);
        frames.push(c);
      }
      const fps = ms > 0 ? Math.min(60, Math.max(2, count / (ms / 1e3))) : 12;
      resolve({ frames, fps });
    }).catch(() => resolve(null));
  });
}
var FILTER_PRESETS = [
  { id: "none", name: "Original", css: "" },
  ...LOOKS.map((l) => ({ id: l.id, name: l.name, css: l.css }))
];
var grainTile = null;
var grainPatterns = /* @__PURE__ */ new WeakMap();
function grainTexture() {
  if (grainTile) return grainTile;
  if (typeof document === "undefined") return null;
  const size = 96;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(size, size);
  let seed = 2654435769;
  for (let i = 0; i < img.data.length; i += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    const v = seed & 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}
function paintFinish(ctx, look, W, H, alpha = 1) {
  if (!look || alpha <= 0) return;
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  if (look.tint) {
    ctx.save();
    ctx.globalCompositeOperation = look.tint.mode;
    ctx.globalAlpha = prevAlpha * look.tint.alpha * alpha;
    ctx.fillStyle = look.tint.color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (look.vignette && look.vignette > 0) {
    ctx.save();
    const r = Math.hypot(W, H) / 2;
    const grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${(0.62 * look.vignette * alpha).toFixed(3)})`);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (look.grain && look.grain > 0) {
    const tile = grainTexture();
    if (tile) {
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = prevAlpha * Math.min(0.9, look.grain) * alpha;
      let pat = grainPatterns.get(ctx);
      if (!pat) {
        const made = ctx.createPattern(tile, "repeat");
        if (made) {
          pat = made;
          grainPatterns.set(ctx, made);
        }
      }
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
  }
  if (look.label) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = prevAlpha * 0.85 * alpha;
    const size = Math.max(10, Math.round(H * 0.038));
    ctx.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = size * 0.35;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(look.label, W - size * 0.6, H - size * 0.5);
    ctx.restore();
  }
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevAlpha;
}
function finishFor(filterId) {
  const look = LOOK_BY_ID.get(resolveLookId(filterId));
  if (!look) return void 0;
  const { tint, grain, vignette, label } = look;
  if (!tint && !grain && !vignette && !label) return void 0;
  return { tint, grain, vignette, label };
}
function presetCss(id) {
  const real = resolveLookId(id);
  return FILTER_PRESETS.find((p) => p.id === real)?.css ?? "";
}
function buildFilterCss(clip) {
  const parts = [presetCss(clip.filter)];
  const a = clip.adjust;
  const parts2 = [];
  if (a.brightness !== 100) parts2.push(`brightness(${(a.brightness / 100).toFixed(3)})`);
  if (a.contrast !== 100) parts2.push(`contrast(${(a.contrast / 100).toFixed(3)})`);
  if (a.saturation !== 100) parts2.push(`saturate(${(a.saturation / 100).toFixed(3)})`);
  if (a.hue !== 0) parts2.push(`hue-rotate(${a.hue}deg)`);
  const fade = a.fade ?? 0;
  if (fade > 0) {
    parts2.push(`contrast(${(1 - 0.32 * (fade / 100)).toFixed(3)})`);
    parts2.push(`brightness(${(1 + 0.07 * (fade / 100)).toFixed(3)})`);
  }
  return [...parts, ...parts2].filter(Boolean).join(" ");
}
var clamp012 = (v) => Math.max(0, Math.min(1, v));
var lerp = (a, b, k) => a + (b - a) * k;
function srcW(src) {
  if (src instanceof HTMLVideoElement) return src.videoWidth;
  if (src instanceof HTMLImageElement) return src.naturalWidth;
  if (src instanceof HTMLCanvasElement) return src.width;
  if (src instanceof ImageBitmap) return src.width;
  return 0;
}
function srcH(src) {
  if (src instanceof HTMLVideoElement) return src.videoHeight;
  if (src instanceof HTMLImageElement) return src.naturalHeight;
  if (src instanceof HTMLCanvasElement) return src.height;
  if (src instanceof ImageBitmap) return src.height;
  return 0;
}
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = h * 31 + id.charCodeAt(i) | 0;
  return Math.abs(h) % 1e3;
}
function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function animAt(kfs, base, t) {
  if (!kfs || kfs.length === 0) return base;
  if (t < kfs[0].at) return base;
  const last2 = kfs[kfs.length - 1];
  if (t >= last2.at) return last2.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.at && t < b.at) {
      const span = b.at - a.at;
      const k = span > 1e-4 ? clamp012((t - a.at) / span) : 1;
      return {
        x: lerp(a.v.x, b.v.x, k),
        y: lerp(a.v.y, b.v.y, k),
        scale: lerp(a.v.scale, b.v.scale, k),
        rotation: lerp(a.v.rotation, b.v.rotation, k),
        opacity: lerp(a.v.opacity, b.v.opacity, k)
      };
    }
  }
  return last2.v;
}
var MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4"
];
function exportBlocker() {
  if (typeof MediaRecorder === "undefined") {
    return "This browser has no video recorder (MediaRecorder), so it cannot write a video file. Export a PNG frame or the WAV audio instead \u2014 both work here.";
  }
  if (!pickMime()) {
    return "This browser's recorder supports none of the formats this editor can write (WebM/MP4), so a video file cannot be produced here. Export a PNG frame or the WAV audio instead.";
  }
  return null;
}
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return { mime, ext: mime.includes("mp4") ? "mp4" : "webm" };
      }
    } catch {
    }
  }
  return null;
}
async function pickVpCodec(width, height, fps, bitrate) {
  const Ctor = window.VideoEncoder;
  if (!Ctor?.isConfigSupported) return null;
  const candidates = [
    { config: "vp09.00.10.08", mkv: "V_VP9" },
    { config: "vp8", mkv: "V_VP8" },
    { config: "av01.0.04M.08", mkv: "V_AV1" }
  ];
  for (const c of candidates) {
    try {
      const res = await Ctor.isConfigSupported({
        codec: c.config,
        width,
        height,
        framerate: fps,
        bitrate
      });
      if (res.supported) return c;
    } catch {
    }
  }
  return null;
}
function mp4Supported() {
  return typeof window.VideoEncoder !== "undefined" && typeof window.AudioEncoder !== "undefined" && typeof window.VideoFrame !== "undefined";
}
var AVC_CANDIDATES = ["avc1.640028", "avc1.640021", "avc1.64001f", "avc1.42002a", "avc1.42001f"];
async function pickAvcCodec(width, height, fps, bitrate) {
  const Ctor = window.VideoEncoder;
  if (!Ctor?.isConfigSupported) return null;
  for (const codec of AVC_CANDIDATES) {
    try {
      const r = await Ctor.isConfigSupported({ codec, width, height, framerate: fps, bitrate });
      if (r.supported) return codec;
    } catch {
    }
  }
  return null;
}
async function supportsAacEncoder(sampleRate, numberOfChannels, bitrate) {
  const Ctor = window.AudioEncoder;
  if (!Ctor?.isConfigSupported) return false;
  try {
    const result = await Ctor.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels,
      bitrate
    });
    return result.supported;
  } catch {
    return false;
  }
}
function adjustmentScale(previewMaxSide, W, H) {
  if (previewMaxSide <= 0) return 1;
  return Math.min(1, 1280 / Math.max(1, W, H));
}
var Engine = class {
  project;
  media = /* @__PURE__ */ new Map();
  els = /* @__PURE__ */ new Map();
  canvas = null;
  ctx = null;
  t = 0;
  playing = false;
  /** transport speed multiplier (J/K/L); 1 = real time, clamped to a sane range */
  playbackRate = 1;
  /** when set, playback loops between these two timeline seconds */
  loopRegion = null;
  loop = true;
  raf = 0;
  lastNow = 0;
  /** ms the clock has been held waiting for a frame (reset when ready) */
  stallMs = 0;
  /** measured frame throughput, from measureThroughput() */
  throughput = null;
  /** proxies registered before their element existed */
  pendingProxies = /* @__PURE__ */ new Map();
  lastPaintAt = 0;
  lastUiTimeAt = 0;
  buffering = false;
  onBufferingChange = null;
  audioCtx = null;
  master = null;
  exportDest = null;
  chromaCache = /* @__PURE__ */ new Map();
  keyColorCache = /* @__PURE__ */ new Map();
  lutCache = /* @__PURE__ */ new Map();
  lutOff = null;
  /** scratch copy for the sharpen pass, reused across frames */
  sharpenBuf = null;
  /** scratch buffer for adjustment layers (readback + put-back) */
  adjustBuf = null;
  vhsPattern = null;
  impulse = null;
  /**
   * Hit rectangles of the overlays drawn in the last draw() — canvas-space
   * pixels, in draw order. Used by pickOverlayAt() so "drag the text on the
   * preview" hit-tests the exact pixels that were painted.
   */
  overlayRects = [];
  /** 1 = canvas native, 2 = 4K (export only; draw() resizes the buffer). */
  exportScale = 1;
  /** True while an export is rendering — placeholders draw plain black
   *  (no "loading…" text baked into the exported video). */
  exporting = false;
  /**
   * Live-preview stabilization (from device.ts): longest canvas buffer side
   * allowed for the preview, in pixels. 0 = no cap (full quality). Export
   * always renders at full quality — the export paths temporarily clear this.
   */
  previewMaxSide = 0;
  setLuts(map) {
    this.lutCache = map;
  }
  /** Decode a media blob to an AudioBuffer (cached) — used by pitch FX + captions. */
  async audioBuffer(mediaId) {
    const rec = this.els.get(mediaId);
    if (rec?.audioBuffer) return rec.audioBuffer;
    if (!rec?.url || !this.audioCtx) return null;
    try {
      const blob = await fetch(rec.url).then((r) => r.blob());
      const buf = await this.audioCtx.decodeAudioData(await blob.arrayBuffer());
      rec.audioBuffer = buf;
      return buf;
    } catch {
      return null;
    }
  }
  getMedia(mediaId) {
    return this.media.get(mediaId);
  }
  /** Public span view (used by the captions module). */
  mainSpansPublic() {
    return mainSpans(this.project);
  }
  /** bump whenever the document mutates, so React can autosave/refresh */
  version = 0;
  onVersion = null;
  onTime = null;
  onPlayingChange = null;
  constructor(project) {
    this.project = project;
  }
  // ------------------------------------------------------------------ media
  setMedia(items) {
    this.media = new Map(items.map((m) => [m.id, m]));
  }
  ensureEl(media) {
    const rec = this.els.get(media.id);
    if (rec) return rec;
    let el;
    if (media.kind === "video") {
      el = document.createElement("video");
      const v = el;
      v.preload = "metadata";
      v.playsInline = true;
    } else if (media.kind === "audio") {
      el = document.createElement("audio");
      el.preload = "auto";
    } else {
      el = document.createElement("img");
    }
    const record = { el, url: "" };
    this.els.set(media.id, record);
    this.routeEl(record, media.id);
    return record;
  }
  hasMediaUrl(mediaId) {
    return !!this.els.get(mediaId)?.url;
  }
  /**
   * Register a preview proxy for a media item.
   *
   * The proxy is used for decoding while editing; `attachUrl` is then re-called
   * for the active source. Exports never see this.
   */
  attachProxy(mediaId, proxyUrl) {
    const rec = this.els.get(mediaId);
    if (rec) {
      if (rec.proxyUrl && rec.proxyUrl !== proxyUrl) URL.revokeObjectURL(rec.proxyUrl);
      rec.proxyUrl = proxyUrl;
      return;
    }
    this.pendingProxies.set(mediaId, proxyUrl);
  }
  /** Which URL should a consumer use for this media right now? */
  urlForMedia(mediaId, consumer) {
    const rec = this.els.get(mediaId);
    if (!rec) return void 0;
    return sourceFor(consumer, rec.url, rec.proxyUrl);
  }
  /**
   * Point the element at the right source for a consumer.
   *
   * Preview gets the proxy when one exists, export always gets the original.
   * Everything that chooses between the two goes through sourceFor(), so proxy
   * quality cannot leak into a delivered file.
   */
  applySource(rec, media, mediaId, consumer) {
    const url2 = sourceFor(consumer, rec.url, rec.proxyUrl);
    if (!url2) return;
    if (rec.appliedUrl === url2) return;
    rec.appliedUrl = url2;
    if (rec.el instanceof HTMLImageElement) {
      rec.el.src = url2;
      return;
    }
    const element = rec.el;
    if (media.kind === "video") {
      const video = element;
      video.preload = "metadata";
      video.playsInline = true;
      video.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(video.duration) && video.duration > 0 && (!media.duration || media.duration <= 0)) {
          media.duration = video.duration;
          this.bump();
        }
        if (video.readyState >= 2 && rec.videoLoadTimer) {
          window.clearTimeout(rec.videoLoadTimer);
          rec.videoLoadTimer = void 0;
        }
      });
      const clearWatchdog = () => {
        if (rec.videoLoadTimer) window.clearTimeout(rec.videoLoadTimer);
        rec.videoLoadTimer = void 0;
      };
      video.addEventListener("loadeddata", () => {
        clearWatchdog();
        this.draw();
      });
      video.addEventListener("seeked", () => {
        if (!this.playing) this.draw();
      });
      video.addEventListener("canplay", clearWatchdog);
      video.addEventListener("error", () => {
        clearWatchdog();
        if (consumer === "preview" && rec.proxyUrl && rec.appliedUrl === rec.proxyUrl) {
          rec.proxyUrl = void 0;
          rec.appliedUrl = void 0;
          this.applySource(rec, media, mediaId, "preview");
          return;
        }
        this.markVideoBroken(mediaId, "video decoder rejected this media file");
      });
    }
    element.src = url2;
    element.load();
  }
  /** Re-point every element at the original files, for an export. */
  useOriginalSources() {
    for (const [id, rec] of this.els) {
      const media = this.media.get(id);
      if (!media || !rec.url) continue;
      this.applySource(rec, media, id, "export");
    }
  }
  /** Re-point every element back at preview sources (proxies). */
  usePreviewSources() {
    for (const [id, rec] of this.els) {
      const media = this.media.get(id);
      if (!media || !rec.url) continue;
      this.applySource(rec, media, id, "preview");
    }
  }
  attachUrl(mediaId, url2) {
    const media = this.media.get(mediaId);
    if (!media) return;
    const rec = this.ensureEl(media);
    const proxy = rec.proxyUrl ?? this.pendingProxies.get(mediaId);
    if (proxy) {
      rec.proxyUrl = proxy;
      this.pendingProxies.delete(mediaId);
    }
    rec.url = url2;
    this.chromaCache.forEach((c, k) => {
      void c;
      if (this.clipUsingMedia(k, mediaId)) {
        this.chromaCache.delete(k);
        this.keyColorCache.delete(k);
      }
    });
    this.applySource(rec, media, mediaId, "preview");
    if (media.isGif && !rec.gif) {
      void fetch(url2).then((r) => r.blob()).then((blob) => decodeGifFrames(blob)).then((frames) => {
        const rec2 = this.els.get(mediaId);
        if (frames && rec2 && frames.frames.length > 0) {
          rec2.gif = frames;
          this.bump();
        }
      }).catch(() => void 0);
    }
  }
  /** Load full video data only when a clip becomes active on the timeline. */
  requestVideoLoad(mediaId) {
    const rec = this.els.get(mediaId);
    if (!rec || rec.videoBroken || !(rec.el instanceof HTMLVideoElement)) return;
    const video = rec.el;
    if (video.readyState >= 2) {
      rec.videoLoadRequested = false;
      if (rec.videoLoadTimer) {
        window.clearTimeout(rec.videoLoadTimer);
        rec.videoLoadTimer = void 0;
      }
      return;
    }
    if (rec.videoLoadRequested) return;
    rec.videoLoadRequested = true;
    video.preload = "auto";
    if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      try {
        video.load();
      } catch {
      }
    }
    rec.videoLoadTimer = window.setTimeout(() => {
      rec.videoLoadTimer = void 0;
      if (this.els.get(mediaId) !== rec || rec.videoBroken) return;
      if (video.readyState >= 2) return;
      rec.videoLoadRequested = false;
      if (video.error) {
        this.markVideoBroken(mediaId, `decoder error ${video.error.code}: ${video.error.message}`);
      } else if (!rec.videoSlowLoadRetried) {
        rec.videoSlowLoadRetried = true;
        this.requestVideoLoad(mediaId);
      }
    }, 45e3);
  }
  /** A video track can't be decoded here: switch its sound to a shadow
   *  <audio> element so the editor stays fully usable (audio, captions,
   *  export audio) while the preview shows a clear placeholder. */
  markVideoBroken(mediaId, why) {
    const rec = this.els.get(mediaId);
    if (!rec || rec.videoBroken) return;
    rec.videoBroken = true;
    if (rec.videoLoadTimer) {
      window.clearTimeout(rec.videoLoadTimer);
      rec.videoLoadTimer = void 0;
    }
    console.warn(
      `[mayocut] video not playable on this device \u2014 ${why}: ${this.media.get(mediaId)?.name ?? mediaId}`
    );
    if (rec.sourceNode) {
      try {
        rec.sourceNode.disconnect();
      } catch {
      }
      rec.sourceNode = void 0;
    }
    const a = document.createElement("audio");
    a.preload = "auto";
    a.src = rec.url;
    rec.audioFallback = a;
    this.routeEl(rec, mediaId, a);
    this.bump();
    this.draw();
  }
  /** Is a video's track undecodable on this device (runtime-confirmed)? */
  isVideoBroken(mediaId) {
    return this.els.get(mediaId)?.videoBroken ?? false;
  }
  /** The element record for a media id, creating it if needed. */
  ensureMediaRec(mediaId) {
    const media = this.media.get(mediaId);
    if (!media) throw new Error(`unknown media ${mediaId}`);
    return this.ensureEl(media);
  }
  clipUsingMedia(clipId, mediaId) {
    if (this.project.main.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
    for (const tr of this.project.tracks)
      if (tr.clips.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
    return false;
  }
  audioEl(mediaId) {
    const media = this.media.get(mediaId);
    if (!media || media.kind === "image") return void 0;
    const rec = this.ensureEl(media);
    if (rec.videoBroken && rec.audioFallback) return rec.audioFallback;
    return rec.el;
  }
  // ------------------------------------------------- audio FX (reverb/echo)
  // Every media element's source node flows through a per-media FX chain
  // (dry + delay/feedback echo + convolution reverb) before the master gain,
  // so effects apply to live preview *and* export alike.
  ensureFx(mediaId) {
    const ctx = this.audioCtx;
    if (!ctx) return null;
    const rec = this.els.get(mediaId);
    if (rec?.fx) return rec.fx;
    const inNode = ctx.createGain();
    const out = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.3;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;
    const feedback = ctx.createGain();
    feedback.gain.value = 0;
    const conv = ctx.createConvolver();
    if (!this.impulse) this.impulse = makeImpulse(ctx, 1.8);
    conv.buffer = this.impulse;
    const convWet = ctx.createGain();
    convWet.gain.value = 0;
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 220;
    low.gain.value = 0;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1600;
    mid.Q.value = 1;
    mid.gain.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 4800;
    high.gain.value = 0;
    inNode.connect(low);
    low.connect(mid);
    mid.connect(high);
    const fxIn = ctx.createGain();
    const fxOut = ctx.createGain();
    high.connect(fxIn);
    fxIn.connect(fxOut);
    fxOut.connect(out);
    inNode.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(out);
    delay.connect(feedback);
    feedback.connect(delay);
    inNode.connect(conv);
    conv.connect(convWet);
    convWet.connect(out);
    out.connect(this.master);
    const chain = {
      in: inNode,
      out,
      delay,
      delayWet,
      feedback,
      conv,
      convWet,
      low,
      mid,
      high,
      fxIn,
      fxOut,
      fxNodes: []
    };
    if (rec) {
      if (rec.sourceNode) {
        try {
          rec.sourceNode.disconnect();
          rec.sourceNode.connect(inNode);
        } catch {
        }
      }
      rec.fx = chain;
    }
    return chain;
  }
  /**
   * Route a media element into the WebAudio FX chain exactly once.
   *
   * Every audible element MUST go through WebAudio: once routed, the
   * element's audio can never also leak out the native output (which is how
   * "double audio" / echo happens on Android Chromium when an element plays
   * both ways). Elements created BEFORE the AudioContext exists are
   * back-filled by the syncElements sweep — without that, clips added after
   * the first play would bypass volume/FX AND be silent in exports.
   */
  routeEl(rec, mediaId, target) {
    const ctx = this.audioCtx;
    const el = target ?? rec.el;
    if (!ctx || el instanceof HTMLImageElement || rec.sourceNode) return;
    try {
      rec.sourceNode = ctx.createMediaElementSource(el);
      rec.sourceNode.connect(this.ensureFx(mediaId).in);
    } catch {
    }
  }
  /**
   * Decode a source segment [inS, outS), preserving its channels and also
   * producing a mono waveform for analysis. Powers "Extract audio". Limit: sources
   * up to ~15 min (decodeAudioData needs the whole file in memory).
   */
  async extractAudioWav(mediaId, inS, outS) {
    if (!this.audioBufferAllowed(mediaId)) return null;
    await this.ensureAudio();
    const buf = await this.audioBuffer(mediaId);
    if (!buf) return null;
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(inS * sr));
    const end = Math.min(buf.length, Math.ceil(outS * sr));
    if (end - start < sr * 0.15) return null;
    const n = end - start;
    const chs = buf.numberOfChannels;
    const out = new Float32Array(n);
    for (let c = 0; c < chs; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += d[start + i] / chs;
    }
    const channels = Array.from({ length: chs }, (_, c) => buf.getChannelData(c).slice(start, end));
    return { samples: out, channels, sampleRate: sr, duration: n / sr };
  }
  /** On-device memory guard for full-file audio decode. */
  audioBufferAllowed(mediaId) {
    const m = this.media.get(mediaId);
    if (!m) return false;
    if (m.duration == null) return true;
    return m.duration <= 15 * 60;
  }
  /** Apply the active clip's FX to its media chain (no-op when nothing is active). */
  syncFx() {
    const t = this.t;
    const active = /* @__PURE__ */ new Map();
    for (const tr of this.project.tracks)
      for (const c of tr.clips) {
        if (c.kind !== "audio" || !c.mediaId) continue;
        if (t >= c.start && t < c.start + c.duration) {
          active.set(c.mediaId, {
            reverb: clamp012(c.fx?.reverb ?? 0),
            echo: clamp012(c.fx?.echo ?? 0),
            fx: c.audioFx ?? "none"
          });
        }
      }
    for (const s2 of mainSpans(this.project)) {
      if (!s2.clip.voice) continue;
      if (t >= s2.start && t < s2.end) {
        const cur = active.get(s2.clip.mediaId) ?? { reverb: 0, echo: 0, fx: "none" };
        active.set(s2.clip.mediaId, {
          ...cur,
          low: s2.clip.voice.low,
          mid: s2.clip.voice.mid,
          high: s2.clip.voice.high
        });
      }
    }
    for (const [id, rec] of this.els) {
      if (!rec.el || rec.el instanceof HTMLImageElement) continue;
      const fx = this.ensureFx(id);
      if (!fx) continue;
      const a = active.get(id);
      const reverb = a?.reverb ?? 0;
      const echo = a?.echo ?? 0;
      fx.delay.delayTime.value = 0.22 + 0.18 * echo;
      fx.delayWet.gain.value = echo > 0 ? 0.65 * echo : 0;
      fx.feedback.gain.value = echo > 0 ? 0.45 * echo : 0;
      fx.convWet.gain.value = reverb;
      fx.low.gain.value = (a?.low ?? 0) * 12;
      fx.mid.gain.value = (a?.mid ?? 0) * 10;
      fx.high.gain.value = (a?.high ?? 0) * 12;
      fx.in.gain.value = 1 - 0.35 * Math.max(reverb, echo);
      this.setAudioFx(rec, a?.fx ?? "none");
    }
  }
  /**
   * Put a one-tap audio effect on a media's chain, or clear it.
   *
   * Rebuilds only when the effect actually changes: a rebuild disconnects and
   * reconnects nodes, which would click if it happened on every frame.
   */
  setAudioFx(rec, id) {
    const ctx = this.audioCtx;
    const fx = rec.fx;
    if (!ctx || !fx || !fx.fxIn || !fx.fxOut) return;
    if (fx.fxId === id) return;
    for (const n of fx.fxNodes) {
      try {
        n.disconnect();
      } catch {
      }
      const maybe = n;
      if (typeof maybe.stop === "function") {
        try {
          maybe.stop();
        } catch {
        }
      }
    }
    fx.fxNodes = [];
    try {
      fx.fxIn.disconnect();
    } catch {
    }
    if (id === "none") {
      fx.fxIn.connect(fx.fxOut);
      fx.fxId = id;
      return;
    }
    const chain = buildAudioFx(ctx, id, {
      impulse: (sec) => {
        if (!this.impulse || Math.abs(this.impulse.duration - sec) > 0.05) {
          this.impulse = makeImpulse(ctx, sec);
        }
        return this.impulse;
      }
    });
    fx.fxIn.connect(chain.input);
    chain.output.connect(fx.fxOut);
    fx.fxNodes = [chain.input, chain.output, ...chain.nodes];
    fx.fxId = id;
  }
  /** Pitch-shifted playback of a short overlay audio clip via buffer source. */
  async startBufferSource(c, local) {
    if (!this.audioCtx) return;
    const mediaId = c.mediaId;
    const rec = this.els.get(mediaId);
    if (!rec) return;
    if (rec.bufSrc && rec.bufClip?.clipId === c.id && Math.abs(rec.bufClip.start + (this.audioCtx.currentTime - (rec.bufStartWall ?? 0)) - local) < 0.4)
      return;
    this.stopBufSource(mediaId);
    const buf = rec.audioBuffer ?? await this.audioBuffer(mediaId);
    if (!buf || !rec.fx) return;
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.detune.value = Math.max(-1200, Math.min(1200, (c.fx?.pitch ?? 0) * 100));
    src.connect(rec.fx.in);
    rec.bufSrc = src;
    rec.bufClip = { clipId: c.id, start: local };
    rec.bufStartWall = this.audioCtx.currentTime;
    try {
      src.start(0, Math.min(local, buf.duration));
    } catch {
    }
  }
  stopBufSource(mediaId) {
    const rec = this.els.get(mediaId);
    if (rec?.bufSrc) {
      try {
        rec.bufSrc.onended = null;
        rec.bufSrc.stop();
      } catch {
      }
      rec.bufSrc = void 0;
      rec.bufClip = void 0;
    }
  }
  // ------------------------------------------------------------- timebase
  duration() {
    return projectDuration(this.project);
  }
  seek(t) {
    this.t = Math.max(0, Math.min(this.duration(), t));
    this.syncElements(true);
    this.draw();
    this.onTime?.(this.t);
  }
  async play() {
    if (this.playing) return;
    if (this.duration() === 0) return;
    await this.ensureAudio();
    if (this.t >= this.duration() - 0.02) this.t = 0;
    await this.awaitFrameFor(this.t, 700);
    this.playing = true;
    this.lastNow = performance.now();
    this.lastPaintAt = 0;
    this.lastUiTimeAt = 0;
    this.onPlayingChange?.(true);
    this.syncElements(true);
    const els = this.activeAudioEls();
    for (const e of els) if (!e.clipReverse) void e.el.play().catch(() => void 0);
    this.loopRaf();
  }
  setBuffering(value) {
    if (this.buffering === value) return;
    this.buffering = value;
    this.onBufferingChange?.(value);
  }
  /** Only active visual sources can hold up the timeline. */
  /**
   * Seek an element and remember that a seek is in flight.
   *
   * Every `el.currentTime = x` in this file goes through here so the play loop
   * can tell "we asked it to jump and it is honouring that" from "the decoder
   * has stalled". The old code could not, so it treated both the same way — it
   * paused every element, which on several browsers cancels the very seek that
   * would have cleared the condition, and the transport stayed stuck.
   */
  seekEl(rec, mediaId, to) {
    const el = rec.videoBroken && rec.audioFallback ? rec.audioFallback : rec.el;
    if (el instanceof HTMLImageElement) return;
    const target = Math.max(0, to);
    if (!Number.isFinite(target)) return;
    try {
      rec.seeking = true;
      el.currentTime = target;
    } catch {
      rec.seeking = false;
      return;
    }
    if (rec.seekTimer) window.clearTimeout(rec.seekTimer);
    rec.seekTimer = window.setTimeout(() => {
      rec.seekTimer = void 0;
      rec.seeking = false;
    }, 600);
    const clear = () => {
      rec.seeking = false;
      if (rec.seekTimer) {
        window.clearTimeout(rec.seekTimer);
        rec.seekTimer = void 0;
      }
      el.removeEventListener("seeked", clear);
    };
    el.addEventListener("seeked", clear, { once: true });
  }
  /**
   * Videos that the play loop must not run past yet.
   *
   * This used to be "any active video whose readyState is below HAVE_CURRENT_DATA
   * or is seeking". `readyState < 2` is also what a browser reports for normal
   * re-buffering mid-playback, and seeking is what the loop itself causes by
   * correcting drift every frame — so with an overlay video present the loop
   * kept tripping over its own seeks, pausing every element, and the picture
   * froze for a moment, again and again, until the clip ended.
   *
   * The rule now:
   *   - a seek WE issued and whose `seeked` has not arrived: wait (bounded);
   *   - a clip that has never shown a frame: wait, but do not pause the others;
   *   - anything that has played and dipped below readyState 2: keep going. A
   *     stale frame for a few milliseconds is invisible; a stall is not.
   */
  videosAwaitingFrame() {
    const ids = /* @__PURE__ */ new Set();
    const sample = sampleTimeline(this.project, this.t);
    for (const s of sample.main) ids.add(s.clip.mediaId);
    for (const layer of sample.overlays) {
      const track = this.project.tracks.find((tr) => tr.id === layer.trackId);
      if (!track?.hidden && layer.clip.kind === "video" && layer.clip.mediaId)
        ids.add(layer.clip.mediaId);
    }
    const pending = [];
    for (const id of ids) {
      const rec = this.els.get(id);
      if (!rec || rec.videoBroken || !(rec.el instanceof HTMLVideoElement)) continue;
      this.requestVideoLoad(id);
      const el = rec.el;
      if (el.readyState >= 2) rec.warm = true;
      if (blocksPlayback({
        readyState: el.readyState,
        seeking: !!rec.seeking,
        warm: !!rec.warm,
        videoBroken: !!rec.videoBroken
      })) {
        pending.push(el);
      }
    }
    return pending;
  }
  /** Wait for the first frame before starting a real-time export recording. */
  async prepareExportFrame() {
    this.syncElements(true);
    const pending = this.videosAwaitingFrame();
    await Promise.all(
      pending.map(
        (el) => new Promise((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            el.removeEventListener("loadeddata", check);
            el.removeEventListener("seeked", check);
            el.removeEventListener("error", fail);
          };
          const check = () => {
            if (el.readyState >= 2 && !el.seeking) {
              cleanup();
              resolve();
            }
          };
          const fail = () => {
            cleanup();
            reject(new Error("Video could not be decoded for export"));
          };
          el.addEventListener("loadeddata", check);
          el.addEventListener("seeked", check);
          el.addEventListener("error", fail);
          const timer = setTimeout(() => {
            cleanup();
            reject(
              new Error("Video took too long to load for export. Try a smaller H.264 video.")
            );
          }, 15e3);
          check();
        })
      )
    );
    this.draw();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.setBuffering(false);
    cancelAnimationFrame(this.raf);
    for (const rec of this.els.values()) {
      const e = rec.el;
      if (e && !e.paused) e.pause?.();
      if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
    }
    this.onPlayingChange?.(false);
    this.draw();
    this.onTime?.(this.t);
  }
  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }
  /**
   * Position the timeline at `t` and make sure the picture is actually ready
   * before a frame is captured.
   *
   * The real-time export paths sampled `draw()` on a timer, so any moment where
   * the element was still seeking became a blank (black) frame in the exported
   * file — the same class of bug as the black opening in the preview. Export
   * must never capture a frame it has not confirmed.
   */
  async frameReadyAt(t, budgetMs = 500) {
    this.seek(t);
    const comp = resolveComposition(this.project, t);
    const waits = [];
    for (const layer of comp.main) {
      const rec = this.els.get(layer.clip.mediaId);
      const el = rec?.el;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (el.readyState >= 2 && Math.abs(el.currentTime - layer.src) <= 0.15) continue;
      waits.push(
        new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            el.removeEventListener("seeked", finish);
            el.removeEventListener("loadeddata", finish);
            el.removeEventListener("canplay", finish);
            resolve();
          };
          const timer = window.setTimeout(finish, budgetMs);
          el.addEventListener("seeked", finish);
          el.addEventListener("loadeddata", finish);
          el.addEventListener("canplay", finish);
          try {
            el.currentTime = layer.src;
          } catch {
            finish();
          }
        })
      );
    }
    if (waits.length) await Promise.all(waits);
    this.draw();
  }
  /**
   * Is the picture for `t` actually on screen?
   *
   * Returns "loading" when a visible layer's element has no decoded frame yet,
   * so the transport can hold the clock rather than run over a blank frame.
   * Images and text are always ready; only video can be late.
   */
  visibleLayerReady(t) {
    const comp = resolveComposition(this.project, t);
    for (const layer of comp.main) {
      const rec = this.els.get(layer.clip.mediaId);
      const el = rec?.el;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (el.readyState < 2 || el.videoWidth === 0) return "loading";
    }
    return "ready";
  }
  /**
   * Wait (bounded) until every visible media element has a frame for `t`.
   *
   * Resolves early if everything is already ready, and gives up after
   * `budgetMs` so a genuinely broken source cannot hang the transport. The
   * caller uses this before starting playback, which is what stops the first
   * moments of a clip from being black.
   */
  awaitFrameFor(t, budgetMs = 700) {
    const comp = resolveComposition(this.project, t);
    const pending = [];
    for (const layer of comp.main) {
      const rec = this.els.get(layer.clip.mediaId);
      const el = rec?.el;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (el.readyState >= 2) {
        if (Math.abs(el.currentTime - layer.src) > 0.2) {
          try {
            el.currentTime = layer.src;
          } catch {
          }
        }
        continue;
      }
      this.requestVideoLoad(layer.clip.mediaId);
      pending.push({ el, src: layer.src });
    }
    if (!pending.length) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        for (const p of pending) {
          p.el.removeEventListener("loadeddata", onReady);
          p.el.removeEventListener("canplay", onReady);
          p.el.removeEventListener("seeked", onReady);
        }
        resolve();
      };
      const onReady = () => {
        if (pending.every((p) => p.el.readyState >= 2)) finish();
      };
      const timer = window.setTimeout(finish, budgetMs);
      for (const p of pending) {
        p.el.addEventListener("loadeddata", onReady);
        p.el.addEventListener("canplay", onReady);
        p.el.addEventListener("seeked", onReady);
      }
    });
  }
  loopRaf() {
    cancelAnimationFrame(this.raf);
    const step = (now) => {
      if (!this.playing) return;
      if (!this.exporting && this.videosAwaitingFrame().length) {
        if (!this.buffering) {
          this.setBuffering(true);
          if (this.allActiveVideosCold()) {
            for (const [id, rec] of this.els) {
              const el = rec.el;
              if (el && !el.paused) el.pause?.();
              if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
              if (rec.bufSrc) this.stopBufSource(id);
            }
          }
        }
        this.lastNow = now;
        this.raf = requestAnimationFrame(step);
        return;
      }
      if (this.buffering) {
        this.setBuffering(false);
        this.syncElements(true);
        this.lastNow = now;
      }
      const dt = Math.min(0.25, (now - this.lastNow) / 1e3);
      const dur = this.duration();
      this.lastNow = now;
      const rate = Number.isFinite(this.playbackRate) ? Math.max(0.1, Math.min(8, this.playbackRate)) : 1;
      this.t += dt * rate;
      const region = this.loopRegion;
      const regionEnd = region && region.b > region.a ? Math.min(region.b, dur) : null;
      const regionStart = region ? Math.max(0, region.a) : 0;
      if (regionEnd !== null && this.t >= regionEnd) {
        this.t = regionStart;
        this.syncElements(true);
      } else if (this.t >= dur) {
        if (this.loop && dur > 0) {
          this.t = 0;
          this.syncElements(true);
        } else {
          this.t = dur;
          this.playing = false;
          for (const rec of this.els.values()) {
            const e = rec.el;
            if (e && !e.paused) e.pause?.();
            if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
          }
          this.onPlayingChange?.(false);
          this.draw();
          this.onTime?.(this.t);
          return;
        }
      }
      if (now - this.lastPaintAt >= 1e3 / 30) {
        this.lastPaintAt = now;
        this.syncElements(false);
        this.draw();
      }
      if (now - this.lastUiTimeAt >= 1e3 / 15) {
        this.lastUiTimeAt = now;
        this.onTime?.(this.t);
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  /**
   * True when no active video can show a frame right now.
   *
   * Distinct from `videosAwaitingFrame().length > 0`: one element can be
   * catching up while another is happily showing a frame, and in that case
   * stopping the transport is the wrong call.
   */
  allActiveVideosCold() {
    const sample = sampleTimeline(this.project, this.t);
    const states = [];
    for (const s of sample.main) {
      const rec = this.els.get(s.clip.mediaId);
      if (!rec || !(rec.el instanceof HTMLVideoElement)) continue;
      states.push({
        readyState: rec.el.readyState,
        seeking: !!rec.seeking,
        warm: !!rec.warm,
        videoBroken: !!rec.videoBroken
      });
    }
    for (const layer of sample.overlays) {
      const track = this.project.tracks.find((tr) => tr.id === layer.trackId);
      if (track?.hidden || layer.clip.kind !== "video" || !layer.clip.mediaId) continue;
      const rec = this.els.get(layer.clip.mediaId);
      if (!rec || !(rec.el instanceof HTMLVideoElement)) continue;
      states.push({
        readyState: rec.el.readyState,
        seeking: !!rec.seeking,
        warm: !!rec.warm,
        videoBroken: !!rec.videoBroken
      });
    }
    return shouldHardStop(states);
  }
  /**
   * Glue media elements to the timeline clock.
   * Reverse clips: the element is held paused and re-seeked to the mirrored
   * source position every frame (its audio is muted by the timeline gain).
   */
  syncElements(hard) {
    if (this.audioCtx) {
      for (const [id, rec] of this.els) {
        if (rec.videoBroken && rec.audioFallback) this.routeEl(rec, id, rec.audioFallback);
        else this.routeEl(rec, id);
      }
    }
    const spans = mainSpans(this.project);
    const t = this.t;
    const next = spans.find((s) => s.start > t && s.start - t <= 3);
    if (next) this.requestVideoLoad(next.clip.mediaId);
    const activeIds = /* @__PURE__ */ new Set();
    const sample = sampleTimeline(this.project, t);
    for (const s of sample.main) {
      activeIds.add(s.clip.mediaId);
      const rec = this.els.get(s.clip.mediaId);
      const el = this.audioEl(s.clip.mediaId);
      if (!el) continue;
      if (el instanceof HTMLVideoElement || rec?.videoBroken) {
        if (el instanceof HTMLVideoElement) this.requestVideoLoad(s.clip.mediaId);
        if (s.clip.freeze) {
          const at = s.clip.in + 1 / 60;
          if (Math.abs(el.currentTime - at) > 0.02)
            this.seekEl(rec ?? this.ensureMediaRec(s.clip.mediaId), s.clip.mediaId, at);
          el.volume = 0;
          if (!el.paused) el.pause();
          continue;
        }
        const local = s.sourceTime;
        const tolerance = hard ? 0.08 : this.playing ? 0.3 : 0.2;
        if (Math.abs(el.currentTime - local) > tolerance)
          this.seekEl(rec ?? this.ensureMediaRec(s.clip.mediaId), s.clip.mediaId, local);
        {
          const rate = s.playbackRate;
          const safe = Number.isFinite(rate) && rate > 0 ? Math.min(16, rate) : 1;
          if (el.playbackRate !== safe) el.playbackRate = safe;
        }
        el.volume = Math.max(
          0,
          Math.min(1, s.gain * (this.mainTrackAudible() ? this.duckFactor(t) : 0))
        );
        if (s.clip.reverse) {
          if (!el.paused) el.pause();
        } else if (this.playing && el.paused) {
          void el.play().catch(() => void 0);
        }
      } else if (!this.playing && !el.paused) {
        el.pause();
      }
    }
    for (const layer of sample.overlays) {
      const c = layer.clip;
      if (c.kind === "audio") {
        if (!c.mediaId) continue;
        if (t >= c.start && t < c.start + c.duration) {
          activeIds.add(c.mediaId);
          const el = this.audioEl(c.mediaId);
          if (!el) continue;
          const local = layer.sourceTime;
          const pitch = c.fx?.pitch ?? 0;
          const media = this.media.get(c.mediaId);
          const md = media?.duration ?? 0;
          const canPitch = pitch !== 0 && this.playing && !!media && md > 0 && md <= 120 && !!this.audioCtx;
          if (canPitch) {
            el.volume = 0;
            if (!el.paused) el.pause();
            void this.startBufferSource(c, local);
          } else {
            this.stopBufSource(c.mediaId);
            const tol = hard ? 0.08 : this.playing ? 0.3 : 0.2;
            if (Math.abs(el.currentTime - local) > tol)
              this.seekEl(this.ensureMediaRec(c.mediaId), c.mediaId, local);
            if (el.playbackRate !== 1) el.playbackRate = 1;
            el.volume = this.overlayAudioVolume(c, t) * this.duckFactor(t);
            if (this.playing && el.paused) void el.play().catch(() => void 0);
          }
        }
      } else if (c.kind === "video" && c.mediaId) {
        if (t >= c.start && t < c.start + c.duration) {
          activeIds.add(c.mediaId);
          const el = this.audioEl(c.mediaId);
          if (el instanceof HTMLVideoElement) {
            this.requestVideoLoad(c.mediaId);
            let local = layer.sourceTime;
            if (c.loop) {
              const md = this.media.get(c.mediaId)?.duration ?? 0;
              if (md > 0.05) local %= md;
            }
            const tol = hard ? 0.08 : this.playing ? 0.3 : 0.2;
            if (Math.abs(el.currentTime - local) > tol)
              this.seekEl(this.ensureMediaRec(c.mediaId), c.mediaId, local);
            el.playbackRate = Math.max(0.05, Math.min(16, c.speed ?? 1));
            el.volume = 0;
            if (this.playing && el.paused) void el.play().catch(() => void 0);
          }
        }
      }
    }
    this.syncFx();
    for (const [id, rec] of this.els) {
      if (activeIds.has(id)) continue;
      const e = rec.el;
      if (e && !e.paused) e.pause?.();
      if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
    }
  }
  activeAudioEls() {
    const out = [];
    const sample = sampleTimeline(this.project, this.t);
    for (const s of sample.main) {
      if (s.clip.freeze) continue;
      const rec = this.els.get(s.clip.mediaId);
      if (rec?.videoBroken && rec.el instanceof HTMLVideoElement) {
        rec.el.muted = true;
        if (!rec.el.paused) rec.el.pause();
      }
      const el = this.audioEl(s.clip.mediaId);
      if (el) out.push({ el, clipReverse: !!s.clip.reverse });
    }
    for (const { clip } of sample.overlays) {
      if (clip.kind !== "audio" && clip.kind !== "video" || !clip.mediaId) continue;
      const el = this.audioEl(clip.mediaId);
      if (el) out.push({ el, clipReverse: clip.kind === "video" });
    }
    return out;
  }
  effectiveVolume(clip, t, s) {
    const hasPrevious = this.project.main[0]?.id !== clip.id;
    let v = mainClipGain(clip, s, this.nextMainSpan(s), t, hasPrevious);
    v *= this.mainTrackAudible() ? this.duckFactor(t) : 0;
    return Math.max(0, Math.min(1, v));
  }
  /** The span immediately after `s`, or null when `s` is the last one. */
  nextMainSpan(s) {
    const spans = mainSpans(this.project);
    const i = spans.findIndex((x) => Math.abs(x.start - s.start) < 1e-6);
    return i >= 0 && i + 1 < spans.length ? spans[i + 1] : null;
  }
  overlayAudioVolume(c, t) {
    const fadeIn = c.fadeIn ?? 0.15;
    const fadeOut = c.fadeOut ?? 0.15;
    const inT = t - c.start;
    const outT = c.start + c.duration - t;
    let v = c.volume ?? 1;
    if (fadeIn > 0) v *= clamp012(inT / fadeIn);
    if (fadeOut > 0) v *= clamp012(outT / fadeOut);
    v *= this.trackGain(this.overlayTrackOf(c.id));
    return Math.max(0, Math.min(1, v));
  }
  /**
   * Track-level audio gain from mute/solo. Solo anywhere = every non-solo
   * track goes silent (CapCut behaviour). Applies to main-track sound and all
   * audio overlays, in preview and export alike.
   */
  trackGain(trackId) {
    const tracks = this.project.tracks;
    const anySolo = tracks.some((t) => t.solo);
    if (anySolo) {
      const tr2 = trackId ? tracks.find((t) => t.id === trackId) : null;
      if (!tr2?.solo) return 0;
      return tr2.muted ? 0 : 1;
    }
    const tr = trackId ? tracks.find((t) => t.id === trackId) : null;
    return tr?.muted ? 0 : 1;
  }
  /** Solo/mute for the main track (main sound is muted when any solo is on). */
  mainTrackAudible() {
    return !this.project.tracks.some((t) => t.solo && t.clips.length > 0);
  }
  /**
   * Ducking: how much to pull music down while a `duck` clip is playing.
   *
   * Pure with respect to the project — it reads no live audio state — so the
   * offline scheduler can call it directly and get the same curve the preview
   * uses. It is deliberately *not* duplicated in the export path: music that
   * dips under a voiceover during editing must dip in the file too.
   */
  duckFactor(t) {
    const amount = this.project.duckAmount ?? 0.7;
    if (amount <= 0) return 1;
    let k = 1;
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (!c.duck || c.kind === "text") continue;
        const inK = clamp012((t - c.start) / 0.25);
        const outK = clamp012((c.start + c.duration - t) / 0.25);
        const amt = Math.min(0.98, c.duck) * amount * Math.min(inK, outK);
        if (this.project.tracks.some((x) => x.solo) && this.trackGain(tr.id) === 1) continue;
        k = Math.min(k, 1 - amt);
      }
    }
    return Math.max(0, k);
  }
  // ------------------------------------------------------------- audio graph
  async ensureAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") {
        try {
          await this.audioCtx.resume();
        } catch {
        }
      }
      return;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      this.audioCtx = new Ctor();
      this.master = this.audioCtx.createGain();
      this.master.gain.value = this.project.masterGain ?? 1;
      this.master.connect(this.audioCtx.destination);
      this.exportDest = this.audioCtx.createMediaStreamDestination();
      this.master.connect(this.exportDest);
      for (const [id, rec] of this.els) {
        if (rec.el instanceof HTMLImageElement) continue;
        if (rec.sourceNode) continue;
        try {
          rec.sourceNode = this.audioCtx.createMediaElementSource(rec.el);
          rec.sourceNode.connect(this.ensureFx(id).in);
        } catch {
        }
      }
    } catch {
      this.audioCtx = null;
    }
  }
  // ------------------------------------------------------------- compositing
  bind(canvas) {
    this.canvas = canvas;
    const a = ASPECTS[this.project.aspect];
    canvas.width = a.w;
    canvas.height = a.h;
    this.ctx = canvas.getContext("2d");
    this.draw();
  }
  setAspect(aspect) {
    this.project.aspect = aspect;
    this.bump();
    if (this.canvas) {
      const a = ASPECTS[aspect];
      this.canvas.width = a.w;
      this.canvas.height = a.h;
      this.draw();
    }
  }
  /**
   * Rotate the whole project between landscape and portrait.
   *
   * CapCut's version of this asks which direction to turn and then *flips the
   * picture*, not just the canvas: every main clip and every positioned overlay
   * gets mirrored across the diagonal, so a clip that was framed top-left in
   * landscape is still top-left after the turn. Rotating the canvas alone would
   * silently re-frame everything the user had placed.
   */
  rotateOrientation(dir = "cw") {
    const a = ASPECTS[this.project.aspect];
    const landscape = a.w > a.h;
    const target = landscape ? "9:16" : "16:9";
    const s = dir === "cw" ? 1 : -1;
    const turn = (o) => {
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      o.x = -s * y;
      o.y = s * x;
      if (o.rot !== void 0) o.rot = (o.rot + 90 * s) % 360;
    };
    for (const tr of this.project.tracks) for (const c of tr.clips) if (c.kind !== "text") turn(c);
    this.project.aspect = target;
    this.bump();
    if (this.canvas) {
      const b = ASPECTS[target];
      this.canvas.width = b.w;
      this.canvas.height = b.h;
      this.draw();
    }
    return target;
  }
  /** Base animation values for a clip (used when a param has no keyframes). */
  animBase(clip) {
    if ("kind" in clip && (clip.kind === "image" || clip.kind === "video")) {
      return {
        x: clip.x ?? 0,
        y: clip.y ?? 0,
        scale: clip.scale ?? 0.5,
        rotation: clip.rot ?? 0,
        opacity: 1
      };
    }
    if ("kind" in clip && clip.kind === "text") {
      return { x: clip.x ?? 0, y: clip.y ?? 0, scale: 1, rotation: 0, opacity: 1 };
    }
    return { ...DEFAULT_ANIM };
  }
  /** Which track holds a given overlay clip? */
  overlayTrackOf(clipId) {
    for (const tr of this.project.tracks) {
      if (tr.clips.some((c) => c.id === clipId)) return tr.id;
    }
    return null;
  }
  /**
   * Free placement of a text/image/video overlay (canvas fractions of the
   * half-width/height from center, as painted). Clamped so nothing can be
   * dragged further than 50% of the canvas away from center.
   */
  setOverlayFreePos(clipId, x, y) {
    const tr = this.project.tracks.find((t) => t.clips.some((c2) => c2.id === clipId));
    const c = tr?.clips.find((c2) => c2.id === clipId);
    if (!c || c.kind !== "text" && c.kind !== "image" && c.kind !== "video") return;
    const cl = (v) => Math.max(-1.5, Math.min(1.5, v));
    c.x = cl(x);
    c.y = cl(y);
    this.bump();
    this.draw();
  }
  /**
   * Hit-test the overlays painted in the last draw(). x/y are canvas-space
   * pixels (i.e. in [0, canvas.width] × [0, canvas.height]). Returns the
   * topmost clip id under the point, or null.
   */
  pickOverlayAt(x, y) {
    for (let i = this.overlayRects.length - 1; i >= 0; i--) {
      const r = this.overlayRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.clipId;
    }
    return null;
  }
  /** Remove every clip (main + all overlay tracks) that references a media id. */
  dropMediaRefs(mediaId) {
    let n = 0;
    const before = this.project.main.length;
    this.project.main = this.project.main.filter((c) => c.mediaId !== mediaId);
    n += before - this.project.main.length;
    for (const tr of this.project.tracks) {
      const b = tr.clips.length;
      tr.clips = tr.clips.filter((c) => c.mediaId !== mediaId);
      n += b - tr.clips.length;
    }
    if (n) this.bump();
    return n;
  }
  /** Interpolated animation values at the playhead for a clip. */
  animAtPlayhead(clip, clipStart) {
    const local = Math.max(0, Math.min(this.duration(), this.t) - clipStart);
    return animAt(clip.keyframes, this.animBase(clip), local);
  }
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const base = ASPECTS[this.project.aspect];
    const maxSide = Math.max(base.w, base.h);
    const cap = this.previewMaxSide > 0 ? Math.min(1, this.previewMaxSide / maxSide) : 1;
    const k = this.exportScale * cap;
    const W = Math.max(2, Math.round(base.w * k));
    const H = Math.max(2, Math.round(base.h * k));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const t = this.t;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this.project.background || "#000";
    ctx.fillRect(0, 0, W, H);
    const comp = resolveComposition(this.project, t);
    const spans = mainSpans(this.project);
    if (comp.transition) {
      const from = comp.transition.from;
      const to = comp.transition.to;
      this.composeTransition(
        ctx,
        spans[from.index],
        spans[to.index],
        comp.transition.kind,
        comp.transition.progress,
        W,
        H,
        t
      );
    } else {
      for (const layer of comp.main) {
        this.drawMainItem(ctx, spans[layer.index], layer.alpha, W, H, t);
      }
    }
    for (const layer of comp.overlays) {
      if (layer.clip.kind !== "adjustment") continue;
      const tr = this.project.tracks.find((track) => track.id === layer.trackId);
      if (tr?.hidden) continue;
      this.paintAdjustmentBand(ctx, layer.clip, W, H, t);
    }
    this.overlayRects.length = 0;
    for (const layer of comp.overlays) {
      const tr = this.project.tracks.find((track) => track.id === layer.trackId);
      if (tr?.hidden) continue;
      const c = layer.clip;
      const localT = layer.local;
      const rampIn = Math.min(1, localT / 0.4);
      const rampOut = Math.min(1, (c.start + c.duration - t) / 0.3);
      const fadeAlpha = c.anim === "none" ? 1 : rampIn * rampOut;
      const anim = animAt(c.keyframes, this.animBase(c), localT);
      if (c.kind === "adjustment") continue;
      if (c.kind === "text")
        this.drawText(ctx, c, W, H, fadeAlpha * clamp012(anim.opacity), localT, c.duration, anim);
      if ((c.kind === "image" || c.kind === "video") && c.mediaId) {
        const rec = this.els.get(c.mediaId);
        if (!rec || !rec.url) continue;
        let src = rec.el;
        if (rec.gif && rec.gif.frames.length > 0) {
          src = rec.gif.frames[Math.floor(localT * rec.gif.fps) % rec.gif.frames.length];
        }
        const sw = srcW(src);
        const sh = srcH(src);
        if (!sw || !sh) continue;
        const size = Math.max(1, anim.scale * W);
        const ar = sw / sh;
        const cx = W / 2 + anim.x * (W / 2);
        const cy = H / 2 + anim.y * (H / 2);
        this.overlayRects.push({
          clipId: c.id,
          x: cx - size / 2,
          y: cy - size / (2 * ar),
          w: size,
          h: size / ar
        });
        const rot = anim.rotation * Math.PI / 180;
        const alpha = clamp012(fadeAlpha * anim.opacity);
        const blend = c.blend && c.blend !== "normal" ? c.blend : null;
        if (c.chroma && sw * sh > 4) {
          this.drawChroma(
            ctx,
            rec.el,
            c,
            size,
            ar,
            alpha,
            cx,
            cy,
            rot,
            blend
          );
        } else {
          ctx.save();
          ctx.globalAlpha = alpha;
          if (blend) ctx.globalCompositeOperation = blend;
          if (c.filter && c.filter !== "none") {
            ctx.filter = presetCss(c.filter) || "none";
          }
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          if (c.flipX || c.flipY) ctx.scale(c.flipX ? -1 : 1, c.flipY ? -1 : 1);
          if (c.mask && c.mask !== "none") this.applyMask(ctx, c.mask, size, ar);
          const dw = size;
          const dh = size / ar;
          if (c.fit === "contain" || c.fit === "blur") {
            const k2 = Math.min(dw / sw, dh / sh);
            const iw = sw * k2;
            const ih = sh * k2;
            if (c.fit === "blur") {
              const s2 = Math.max(dw / sw, dh / sh) * 1.1;
              const bx = ctx.filter;
              ctx.filter = `${bx ? bx + " " : ""}blur(${Math.max(2, dh * 0.06).toFixed(1)}px)`;
              ctx.drawImage(src, (dw - sw * s2) / 2, (dh - sh * s2) / 2, sw * s2, sh * s2);
              ctx.filter = bx || "none";
            }
            ctx.drawImage(src, -iw / 2, -ih / 2, iw, ih);
          } else {
            ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
          }
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }
  // ------------------------------------------------------------ main render
  /**
   * Composite an A→B transition at progress k (0..1). Handles crossfade,
   * dip-to-black/white, directional slides, wipes, a zoom punch and a blur
   * dissolve. Both clips render through the exact same path as normal playback
   * (filters, keyframes, LUTs, effects), so preview and export stay identical.
   */
  composeTransition(ctx, a, b, kind, k, W, H, t) {
    const dip = isDipTo(kind);
    if (dip) {
      if (k < 0.5) {
        this.drawMainItem(ctx, a, 1 - 2 * k, W, H, t);
        ctx.save();
        ctx.globalAlpha = k * 2;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = dip === "white" ? "#fff" : "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = dip === "white" ? "#fff" : "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        this.drawMainItem(ctx, b, 2 * k - 1, W, H, t);
      }
      return;
    }
    if (kind === "crossfade") {
      this.drawMainItem(ctx, a, 1, W, H, t);
      this.drawMainItem(ctx, b, k, W, H, t);
      return;
    }
    if (kind === "blur") {
      const blurPx = Math.sin(Math.PI * k) * Math.max(3, H * 0.012);
      this.drawMainItem(ctx, a, 1, W, H, t, blurPx);
      this.drawMainItem(ctx, b, k, W, H, t, blurPx);
      return;
    }
    if (kind === "zoom") {
      this.drawMainItem(ctx, a, 1, W, H, t, 0, 1 + 0.22 * k);
      this.drawMainItem(ctx, b, clamp012(k * 1.15), W, H, t, 0, 1.18 - 0.18 * k);
      return;
    }
    if (kind === "flash") {
      const peak = Math.pow(Math.sin(Math.PI * k), 2);
      if (k < 0.5) this.drawMainItem(ctx, a, 1, W, H, t);
      else this.drawMainItem(ctx, b, 1, W, H, t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, peak * 1.15);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    if (kind === "spin") {
      const ease = k * k * (3 - 2 * k);
      this.drawMainItem(ctx, a, 1, W, H, t);
      const rot = (1 - ease) * Math.PI * 0.5;
      const sc = 0.7 + 0.3 * ease;
      ctx.save();
      ctx.globalAlpha = clamp012(ease * 1.6);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -H / 2);
      this.drawMainItem(ctx, b, 1, W, H, t);
      ctx.restore();
      return;
    }
    if (kind === "glitch") {
      this.drawMainItem(ctx, b, Math.min(1, k * 1.4), W, H, t);
      ctx.save();
      const bands = 9;
      const seed = Math.sin(k * 61.7) * 1e3;
      for (let i = 0; i < bands; i++) {
        const f = (i / bands + seed % 1 * 0.05) % 1;
        const bh = H / bands;
        const jitter = (Math.sin(seed + i * 2.3) * 0.5 + 0.5) * 0.5;
        if (jitter < 0.55) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, f * H, W, bh);
        ctx.clip();
        const dx = Math.sin(seed * (i + 1)) * W * 0.08 * Math.sin(Math.PI * k);
        ctx.translate(dx, 0);
        this.drawMainItem(ctx, a, 0.9, W, H, t);
        ctx.restore();
      }
      const fringe = Math.sin(Math.PI * k);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.14 * fringe;
      ctx.fillStyle = "#ff0044";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#00e5ff";
      ctx.globalAlpha = 0.1 * fringe;
      ctx.fillRect(W * 0.012, 0, W, H);
      ctx.restore();
      return;
    }
    if (kind === "lightleak") {
      this.drawMainItem(ctx, a, 1 - k * 0.6, W, H, t);
      this.drawMainItem(ctx, b, k, W, H, t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const cx = W * (-0.25 + 1.5 * k);
      const r = Math.hypot(W, H) * (0.55 + 0.15 * Math.sin(Math.PI * k));
      const grad = ctx.createRadialGradient(cx, H * 0.5, r * 0.05, cx, H * 0.5, r);
      const a0 = Math.sin(Math.PI * k);
      grad.addColorStop(0, `rgba(255,214,140,${(0.55 * a0).toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(255,120,60,${(0.28 * a0).toFixed(3)})`);
      grad.addColorStop(1, "rgba(120,20,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    if (kind === "luma") {
      this.drawMainItem(ctx, a, 1, W, H, t);
      const scale = Math.min(1, 720 / Math.max(W, H));
      const bw = Math.max(2, Math.round(W * scale));
      const bh = Math.max(2, Math.round(H * scale));
      const buf = document.createElement("canvas");
      buf.width = bw;
      buf.height = bh;
      const bctx = buf.getContext("2d");
      if (!bctx) {
        this.drawMainItem(ctx, b, clamp012(k * 1.2), W, H, t);
        return;
      }
      bctx.scale(bw / W, bh / H);
      this.drawMainItem(bctx, b, 1, W, H, t);
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      const edge = -0.3 + 1.6 * clamp012(k);
      const shoulder = 0.35;
      bctx.globalCompositeOperation = "destination-in";
      const g = bctx.createLinearGradient(0, 0, bw, 0);
      const A0 = (v) => `rgba(0,0,0,${v})`;
      g.addColorStop(0, A0(clamp012(edge) > 0 ? 1 : 0));
      g.addColorStop(clamp012(edge), A0(clamp012(edge) > 0 ? 1 : 0));
      g.addColorStop(clamp012(edge + shoulder), A0(clamp012(edge + shoulder) >= 1 ? 0 : 1));
      g.addColorStop(1, A0(clamp012(edge + shoulder) >= 1 ? 0 : 1));
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, bw, bh);
      bctx.globalCompositeOperation = "source-over";
      ctx.drawImage(buf, 0, 0, W, H);
      return;
    }
    if (kind === "zoomblur") {
      const blurPx = Math.sin(Math.PI * k) * Math.max(4, H * 0.022);
      this.drawMainItem(ctx, a, 1, W, H, t, blurPx * 0.6, 1 + 0.3 * k);
      this.drawMainItem(ctx, b, clamp012(k * 1.2), W, H, t, blurPx, 1.3 - 0.3 * k);
      return;
    }
    if (kind === "whipl" || kind === "whipr") {
      const dir = kind === "whipl" ? -1 : 1;
      const blurPx = Math.sin(Math.PI * k) * Math.max(5, W * 0.03);
      const travel = W * 0.35 * k * dir;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(travel, 0);
      this.drawMainItem(ctx, a, 1, W, H, t, blurPx);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(travel - W * 0.35 * dir, 0);
      this.drawMainItem(ctx, b, 1, W, H, t, blurPx);
      ctx.restore();
      return;
    }
    const e = k;
    const soft = wipeDir(kind);
    if (soft?.soft) {
      this.drawMainItem(ctx, a, 1, W, H, t);
      this.drawFeatheredWipe(ctx, b, W, H, t, soft.dir, e);
      return;
    }
    this.drawMainItem(ctx, a, 1, W, H, t);
    ctx.save();
    if (kind === "slideleft" || kind === "slideright" || kind === "slideup" || kind === "slidedown") {
      let dx = 0;
      let dy = 0;
      if (kind === "slideleft") dx = W - W * e;
      if (kind === "slideright") dx = -(W - W * e);
      if (kind === "slideup") dy = H - H * e;
      if (kind === "slidedown") dy = -(H - H * e);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(dx, dy);
      this.drawMainItem(ctx, b, 1, W, H, t);
    } else if (kind === "slide") {
      const span = Math.hypot(W, H);
      const ux = W / span;
      const uy = H / span;
      const d = span * e;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(d * ux, d * uy);
      this.drawMainItem(ctx, a, 1, W, H, t);
      ctx.translate(-span * ux, -span * uy);
      this.drawMainItem(ctx, b, 1, W, H, t);
    } else if (soft) {
      const w = W * e;
      const h = H * e;
      ctx.beginPath();
      if (soft.dir === "left") ctx.rect(W - w, 0, w, H);
      else if (soft.dir === "right") ctx.rect(0, 0, w, H);
      else if (soft.dir === "up") ctx.rect(0, H - h, W, h);
      else ctx.rect(0, 0, W, h);
      ctx.clip();
      this.drawMainItem(ctx, b, 1, W, H, t);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.5 * Math.sin(Math.PI * k);
      ctx.fillStyle = "#fff";
      if (soft.dir === "left") ctx.fillRect(W - w - 1, 0, 2, H);
      else if (soft.dir === "right") ctx.fillRect(w - 1, 0, 2, H);
      else if (soft.dir === "up") ctx.fillRect(0, H - h - 1, W, 2);
      else ctx.fillRect(0, h - 1, W, 2);
    }
    ctx.restore();
  }
  /**
   * Feathered (gradient-masked) wipe.
   *
   * The incoming frame renders into an offscreen buffer at preview scale and is
   * composited back through a `destination-in` linear gradient, so the reveal
   * edge is soft instead of a hard line — CapCut's "soft wipe". The edge
   * travels from fully outside the near side to fully outside the far side, so
   * k = 0 shows none of B and k = 1 shows all of it (no half-faded sliver).
   */
  drawFeatheredWipe(ctx, b, W, H, t, dir, e) {
    const scale = Math.min(1, 720 / Math.max(W, H));
    const bw = Math.max(2, Math.round(W * scale));
    const bh = Math.max(2, Math.round(H * scale));
    const buf = document.createElement("canvas");
    buf.width = bw;
    buf.height = bh;
    const bctx = buf.getContext("2d");
    if (!bctx) return;
    bctx.scale(bw / W, bh / H);
    this.drawMainItem(bctx, b, 1, W, H, t);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    const vertical = dir === "up" || dir === "down";
    const span = vertical ? bh : bw;
    const feather = Math.max(1, span * 0.12);
    const k = clamp012(e);
    const lowSide = dir === "right" || dir === "down";
    const edge = lowSide ? -feather + k * (span + feather * 2) : span + feather - k * (span + feather * 2);
    const t0 = clamp012((edge - feather) / span);
    const t1 = clamp012((edge + feather) / span);
    const g = vertical ? bctx.createLinearGradient(0, 0, 0, bh) : bctx.createLinearGradient(0, 0, bw, 0);
    const A = (v) => `rgba(0,0,0,${v})`;
    g.addColorStop(0, A(lowSide ? 1 : 0));
    g.addColorStop(t0, A(lowSide ? 1 : 0));
    g.addColorStop(t1, A(lowSide ? 0 : 1));
    g.addColorStop(1, A(lowSide ? 0 : 1));
    bctx.globalCompositeOperation = "destination-in";
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, bw, bh);
    bctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.drawImage(buf, 0, 0, W, H);
    ctx.restore();
  }
  drawMainItem(ctx, s, alpha, W, H, t, blurPx = 0, scaleMul = 1) {
    const c = s.clip;
    const rec = this.els.get(c.mediaId);
    const localT = t - s.start;
    const anim = animAt(c.keyframes, DEFAULT_ANIM, localT);
    const a = clamp012(alpha * anim.opacity);
    if (!rec || !rec.url) {
      this.drawPlaceholder(ctx, W, H, c.mediaId, a);
      return;
    }
    const el = rec.el;
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
      const ready = el instanceof HTMLImageElement || el.readyState >= 2 && el.videoWidth > 0;
      if (!ready) {
        const hasFrame = el instanceof HTMLVideoElement && el.videoWidth > 0;
        if (rec.videoBroken || !hasFrame && !this.playing) {
          this.drawPlaceholder(ctx, W, H, c.mediaId, a, rec.videoBroken);
        }
        return;
      }
    } else {
      this.drawPlaceholder(ctx, W, H, c.mediaId, a, rec.videoBroken);
      return;
    }
    const eff = c.effect ?? "none";
    const ef = c.freeze ? { tx: 0, ty: 0, scale: 1, rot: 0 } : this.effectTransform(c, localT, W, H, mainClipDuration(c));
    ctx.save();
    ctx.globalAlpha = a;
    let filterCss = buildFilterCss(c);
    if (eff === "blur-in") {
      const ramp = clamp012(localT / 0.45);
      const px = Math.round((1 - ramp) * H * 0.018 * 10) / 10;
      if (px > 0.05) filterCss = (filterCss + ` blur(${px}px)`).trim();
    }
    if (blurPx > 0.05) filterCss = (filterCss + ` blur(${blurPx.toFixed(2)}px)`).trim();
    ctx.filter = filterCss || "none";
    if (scaleMul !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(scaleMul, scaleMul);
      ctx.translate(-W / 2, -H / 2);
    }
    if (anim.x !== 0 || anim.y !== 0 || anim.scale !== 1 || anim.rotation !== 0) {
      ctx.translate(W / 2 + anim.x * (W / 2), H / 2 + anim.y * (H / 2));
      ctx.rotate(anim.rotation * Math.PI / 180);
      ctx.scale(anim.scale, anim.scale);
      ctx.translate(-W / 2, -H / 2);
    }
    if (c.flipX || c.flipY) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(c.flipX ? -1 : 1, c.flipY ? -1 : 1);
      ctx.translate(-W / 2, -H / 2);
    }
    if (ef.scale !== 1 || ef.rot !== 0 || ef.tx !== 0 || ef.ty !== 0) {
      ctx.translate(W / 2 + ef.tx, H / 2 + ef.ty);
      ctx.rotate(ef.rot);
      ctx.scale(ef.scale, ef.scale);
      ctx.translate(-W / 2, -H / 2);
    }
    const lut = c.lut ? this.lutCache.get(c.lut) : null;
    const glitching = eff === "glitch" && this.glitchWindow(localT);
    const needsGrade = this.gradeActive(c.adjust) || curvesActive(c.curves) || hslActive(c.hsl);
    if (lut || needsGrade) {
      this.drawMainGrade(ctx, el, W, H, c, lut ?? null);
    } else if (glitching || eff === "vhs") {
      this.drawMainSliced(ctx, el, W, H, glitching, localT);
    } else {
      this.drawImageFit(ctx, el, W, H, c.fit, c.frame);
    }
    if (eff === "pulse-color") {
      const pulse = 0.5 + 0.5 * Math.sin(localT / 0.7 * Math.PI * 2);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = a * 0.22 * pulse;
      ctx.fillStyle = "#ff5ea8";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (eff === "flash-in") {
      const k = 1 - clamp012(localT / 0.18);
      if (k > 0.01) {
        ctx.globalAlpha = a * k * 0.85;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-W, -H, W * 3, H * 3);
        ctx.globalAlpha = a;
      }
    }
    if (eff === "glow") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = a * (0.28 + 0.06 * Math.sin(localT * 2.2));
      ctx.filter = `blur(${Math.max(3, H * 0.02).toFixed(1)}px) brightness(1.15)`;
      ctx.drawImage(el, 0, 0, W, H);
      ctx.restore();
    }
    if (eff === "chroma") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const off = Math.max(1, W * 4e-3);
      ctx.globalAlpha = a * 0.35;
      ctx.filter = "sepia(1) saturate(6) hue-rotate(-40deg)";
      ctx.drawImage(el, -off, 0, W, H);
      ctx.filter = "sepia(1) saturate(6) hue-rotate(160deg)";
      ctx.drawImage(el, off, 0, W, H);
      ctx.restore();
    }
    if (eff === "light-rays") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const flicker = 0.55 + 0.12 * Math.sin(localT * 1.3) + 0.06 * Math.sin(localT * 3.1);
      const gx = W * (0.15 + 0.1 * Math.sin(localT * 0.4));
      const grad = ctx.createLinearGradient(gx, 0, gx + W * 0.5, H);
      grad.addColorStop(0, `rgba(255,240,200,${(0.16 * flicker * a).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(255,220,160,${(0.07 * flicker * a).toFixed(3)})`);
      grad.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = grad;
      for (let i = 0; i < 4; i++) {
        const x = gx + i * W * 0.09;
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(0.18 + i * 0.02);
        ctx.fillRect(0, -H, W * (0.05 + i * 0.012), H * 3);
        ctx.restore();
      }
      ctx.restore();
    }
    if (eff === "motion-blur") {
      const trail = Math.max(2, Math.round(W * 0.02));
      ctx.save();
      ctx.globalAlpha = a * 0.22;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = a * (0.2 / i);
        ctx.drawImage(el, -i * trail, 0, W, H);
        ctx.drawImage(el, i * trail, 0, W, H);
      }
      ctx.restore();
      ctx.globalAlpha = a;
    }
    const finish = finishFor(c.filter);
    if (finish) paintFinish(ctx, finish, W, H, a);
    if (eff === "vhs") {
      ctx.globalAlpha = a * 0.5;
      const pat = this.vhsPatternLazy;
      if (pat) {
        try {
          ctx.globalCompositeOperation = "source-over";
          const p = ctx.createPattern(pat, "repeat");
          if (p) {
            ctx.globalAlpha = a * 0.35;
            ctx.fillStyle = p;
            ctx.fillRect(0, 0, W, H);
          }
        } catch {
        }
      }
      ctx.globalAlpha = a * (0.05 + 0.02 * Math.sin(localT * 30));
      ctx.fillStyle = "rgba(80,200,255,0.25)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
    }
    ctx.restore();
  }
  /** Deterministic per-clip motion-effect transform (seeded by clip id). */
  effectTransform(c, localT, W, H, dur) {
    const r = { tx: 0, ty: 0, scale: 1, rot: 0 };
    switch (c.effect ?? "none") {
      case "zoom-pulse":
        r.scale = 1.04 + 0.05 * Math.sin(localT / 0.6 * Math.PI * 2);
        break;
      case "heartbeat": {
        const t0 = localT % 0.95;
        const bump = Math.pow(Math.max(0, Math.sin(t0 / 0.32 * Math.PI)), 3) + 0.55 * Math.pow(Math.max(0, Math.sin((t0 - 0.18) / 0.3 * Math.PI)), 3);
        r.scale = 1 + 0.045 * bump;
        break;
      }
      case "shake": {
        const seed = hashId(c.id);
        const m = H * 6e-3;
        r.tx = Math.sin(localT * 31 + seed) * m;
        r.ty = Math.cos(localT * 27 + seed * 2) * m;
        r.rot = Math.sin(localT * 19 + seed) * 8e-3;
        break;
      }
      case "spin":
        r.rot = localT / Math.max(1e-3, dur) * Math.PI * 2;
        break;
      case "zoom-out":
        r.scale = 1.16 - 0.16 * clamp012(localT / Math.max(0.6, dur * 0.6));
        break;
      case "pan-left":
        r.tx = -(W * 0.05) * clamp012(localT / Math.max(0.6, dur));
        r.scale = 1.08;
        break;
      case "pan-right":
        r.tx = W * 0.05 * clamp012(localT / Math.max(0.6, dur));
        r.scale = 1.08;
        break;
      case "tilt-up":
        r.ty = H * 0.045 * (1 - clamp012(localT / Math.max(0.6, dur)));
        r.scale = 1.06;
        break;
      case "kenburns": {
        const k = clamp012(localT / Math.max(1e-3, dur));
        r.scale = 1.04 + 0.07 * k;
        r.tx = (k - 0.5) * W * 0.035;
        r.ty = (k - 0.5) * H * -0.02;
        break;
      }
      case "sway": {
        const seed = hashId(c.id);
        r.rot = Math.sin(localT * 1.6 + seed) * 0.012;
        r.tx = Math.sin(localT * 1.1 + seed) * W * 8e-3;
        break;
      }
      case "tilt-down":
        r.ty = H * 0.045 * clamp012(localT / Math.max(0.6, dur));
        r.scale = 1.06;
        break;
      case "roll":
        r.rot = (clamp012(localT / Math.max(1e-3, dur)) - 1) * Math.PI * 2;
        r.scale = 1.12;
        break;
      case "float": {
        const seed = hashId(c.id);
        r.ty = Math.sin(localT * 2.1 + seed) * H * 0.012;
        r.tx = Math.cos(localT * 1.4 + seed) * W * 4e-3;
        r.scale = 1.04;
        break;
      }
      case "breathe":
        r.scale = 1.02 + 0.028 * (0.5 - 0.5 * Math.cos(localT / 4 * Math.PI * 2));
        break;
      case "jitter": {
        const seed = hashId(c.id);
        const n = (a) => Math.sin(localT * a + seed) * Math.sin(localT * (a * 0.37) + seed * 3);
        r.tx = n(47) * W * 7e-3;
        r.ty = n(53) * H * 7e-3;
        r.rot = n(41) * 4e-3;
        break;
      }
      case "whip-left":
      case "whip-right": {
        const k = clamp012(localT / Math.max(1e-3, dur));
        const e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const dirSign = (c.effect ?? "") === "whip-left" ? -1 : 1;
        r.tx = dirSign * (1 - e2) * W * 0.5;
        r.scale = 1.18;
        break;
      }
      case "dolly-in":
        r.scale = 1 + 0.16 * clamp012(localT / Math.max(1e-3, dur));
        break;
      case "dolly-out":
        r.scale = 1.16 - 0.16 * clamp012(localT / Math.max(1e-3, dur));
        break;
      case "tilt-shift":
        r.scale = 1.08;
        r.ty = (clamp012(localT / Math.max(1e-3, dur)) - 0.5) * H * 0.03;
        break;
      case "earthquake": {
        const seed = hashId(c.id);
        const env = Math.exp(-(localT % 1.6 / 0.9));
        r.tx = Math.sin(localT * 63 + seed) * W * 0.012 * env;
        r.ty = Math.cos(localT * 57 + seed * 2) * H * 0.012 * env;
        r.rot = Math.sin(localT * 39 + seed) * 6e-3 * env;
        break;
      }
      case "orbit": {
        const a2 = localT / Math.max(1e-3, dur) * Math.PI * 2;
        r.tx = Math.sin(a2) * W * 0.035;
        r.ty = (1 - Math.cos(a2)) * H * 0.035;
        r.scale = 1.12;
        break;
      }
      // --- third wave: transform part of the effect --------------------
      // Each of these also has a paint step in drawMainItem; this half only
      // decides where the frame sits. Splitting them keeps the transform
      // function free of canvas work, which is what lets the audit test it.
      case "speed-push": {
        const k2 = clamp012(localT / Math.max(1e-3, dur));
        r.scale = 1 + 0.16 * k2 * k2;
        break;
      }
      case "beat-zoom": {
        const beat = localT % 0.5 / 0.5;
        r.scale = 1 + 0.09 * Math.pow(1 - beat, 3);
        break;
      }
      case "drift-up":
        r.ty = -0.06 * (localT / Math.max(1e-3, dur)) * H;
        r.scale = 1.08;
        break;
      case "drift-down":
        r.ty = 0.06 * (localT / Math.max(1e-3, dur)) * H;
        r.scale = 1.08;
        break;
      case "focus-in": {
        const k2 = clamp012(localT / 0.6);
        r.scale = 1.03 - 0.03 * k2;
        break;
      }
      case "chroma":
        r.scale = 1.01 + 0.01 * Math.sin(localT * 1.7);
        break;
      default:
        break;
    }
    return r;
  }
  /** Glitch bursts: ~70 ms window every ~500 ms, deterministic per clip. */
  glitchWindow(localT) {
    const seed = hashId("g") + localT * 10 | 0;
    void seed;
    const p = localT % 0.5;
    return p < 0.07 || p > 0.31 && p < 0.36;
  }
  /** Horizontal-slice draw (glitch bursts / VHS wobble) with cover geometry. */
  drawMainSliced(ctx, el, W, H, hard, localT) {
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!sw || !sh) return;
    const seed = hashId(el instanceof HTMLVideoElement ? "v" : "i");
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    const slices = hard ? 7 : 4;
    const amp = hard ? W * 0.03 : W * 4e-3;
    for (let i = 0; i < slices; i++) {
      const sy = dh / slices * i;
      const shh = dh / slices + 1;
      const jitter = Math.sin(localT * (60 + i * 7) + seed * (i + 1)) * amp * (hard ? 1 : 0.4);
      ctx.drawImage(el, 0, sy / dh * sh, sw, shh / dh * sh, dx + jitter, dy + sy, dw, shh);
    }
  }
  /** LUT pass: render the clip to a reduced offscreen canvas, map, upscale. */
  drawMainLut(ctx, el, W, H, lut) {
    const s = Math.min(1, 1280 / Math.max(W, H));
    const W2 = Math.max(4, Math.round(W * s));
    const H2 = Math.max(4, Math.round(H * s));
    if (!this.lutOff) this.lutOff = document.createElement("canvas");
    if (this.lutOff.width !== W2 || this.lutOff.height !== H2) {
      this.lutOff.width = W2;
      this.lutOff.height = H2;
    }
    const octx = this.lutOff.getContext("2d", { willReadFrequently: true });
    if (!octx) {
      this.drawImageCover(ctx, el, W, H);
      return;
    }
    octx.filter = "none";
    octx.globalAlpha = 1;
    octx.drawImage(el, 0, 0, W2, H2);
    const img = octx.getImageData(0, 0, W2, H2);
    applyLut(lut, img.data);
    octx.putImageData(img, 0, 0);
    ctx.drawImage(this.lutOff, 0, 0, W, H);
  }
  /** Shape mask in the overlay's local (rotated/scaled) frame. */
  applyMask(ctx, mask, size, ar) {
    const w = size;
    const h = size / ar;
    ctx.beginPath();
    if (mask === "spotlight") {
      ctx.arc(0, 0, Math.min(w, h) * 0.5, 0, Math.PI * 2);
    } else if (mask === "bar") {
      ctx.rect(-w / 2, -h * 0.3, w, h * 0.6);
    } else if (mask === "line") {
      ctx.rect(-w, 0, w * 2, h);
    } else {
      return;
    }
    ctx.clip();
  }
  get vhsPatternLazy() {
    if (!this.vhsPattern) {
      const c = document.createElement("canvas");
      c.width = 4;
      c.height = 4;
      const x = c.getContext("2d");
      if (x) {
        x.fillStyle = "rgba(0,0,0,0.28)";
        x.fillRect(0, 0, 4, 1);
      }
      this.vhsPattern = c;
    }
    return this.vhsPattern;
  }
  /**
   * Green-screen keying: the source is drawn to a reduced offscreen canvas and
   * pixels close to the sampled key color (corners of the source) get their
   * alpha cut, with a soft feather. Rendered small then upscaled to stay fast.
   */
  drawChroma(ctx, src, c, size, ar, alpha, cx, cy, rot, blend = null) {
    const maxW = 480;
    const s = Math.min(1, maxW / ar);
    const cw = Math.max(8, Math.round(size * s));
    const ch = Math.max(8, Math.round(size / ar * s));
    let off = this.chromaCache.get(c.id);
    if (!off || off.width !== cw || off.height !== ch) {
      off = document.createElement("canvas");
      off.width = cw;
      off.height = ch;
      this.chromaCache.set(c.id, off);
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return;
    octx.clearRect(0, 0, cw, ch);
    octx.drawImage(src, 0, 0, cw, ch);
    const img = octx.getImageData(0, 0, cw, ch);
    const d = img.data;
    let key = this.keyColorCache.get(c.id);
    if (!key) {
      const pts = [
        [0, 0],
        [cw - 1, 0],
        [0, ch - 1],
        [cw - 1, ch - 1],
        [cw / 2 | 0, 0],
        [cw / 2 | 0, ch - 1]
      ];
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [px, py] of pts) {
        const i = (py * cw + px) * 4;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      key = [r / pts.length, g / pts.length, b / pts.length];
      this.keyColorCache.set(c.id, key);
    }
    const tol = Math.max(8, Math.min(255, c.chromaTol ?? 90));
    const tol2 = tol * tol * 3;
    const fea2 = tol * tol * 3 * 2.9;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - key[0];
      const dg = d[i + 1] - key[1];
      const db = d[i + 2] - key[2];
      const dist2 = dr * dr + dg * dg + db * db;
      if (dist2 < tol2) d[i + 3] = 0;
      else if (dist2 < fea2) d[i + 3] = Math.round(d[i + 3] * (dist2 - tol2) / (fea2 - tol2));
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blend) ctx.globalCompositeOperation = blend;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, -size / 2, -size / (2 * ar), size, size / ar);
    ctx.restore();
  }
  /** Does this adjust need a pixel pass (anything CSS filters can't do)? */
  gradeActive(a) {
    return (a.temperature ?? 0) !== 0 || (a.tint ?? 0) !== 0 || (a.vignette ?? 0) > 0 || (a.sharpen ?? 0) > 0 || (a.splitTone ?? 0) > 0;
  }
  /**
   * Main-clip render with pixel grading and/or a LUT applied.
   *
   * The source is drawn (cover/contain/blur fit) to a reduced offscreen canvas
   * (≤1280px long side), graded with one pass over the pixels, then upscaled in
   * a single drawImage. That keeps 4K exports and phone previews affordable
   * while filters, motion and transitions stay exact.
   */
  drawMainGrade(ctx, el, W, H, c, lut) {
    const scale = Math.min(1, 1280 / Math.max(W, H));
    const W2 = Math.max(4, Math.round(W * scale));
    const H2 = Math.max(4, Math.round(H * scale));
    if (!this.lutOff) this.lutOff = document.createElement("canvas");
    const off = this.lutOff;
    if (off.width !== W2 || off.height !== H2) {
      off.width = W2;
      off.height = H2;
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) {
      this.drawImageFit(ctx, el, W, H, c.fit, c.frame);
      return;
    }
    octx.filter = "none";
    octx.globalAlpha = 1;
    octx.clearRect(0, 0, W2, H2);
    this.paintFit(octx, el, W2, H2, c.fit, c.frame);
    const img = octx.getImageData(0, 0, W2, H2);
    this.gradePixels(img.data, W2, H2, c.adjust);
    if (lut) applyLut(lut, img.data);
    const curveLuts = buildCurveLuts(c.curves);
    if (curveLuts) applyCurveLuts(img.data, curveLuts);
    if (hslActive(c.hsl)) applyHsl(img.data, c.hsl);
    octx.putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0, W, H);
  }
  /**
   * Paint an adjustment band over everything drawn so far.
   *
   * Reads back the frame, applies the same `gradePixels` the per-clip path uses
   * (so a band and a hand-graded clip cannot drift apart), and puts it back.
   *
   * The readback is the cost, so it is skipped when the band has no effect —
   * an empty adjustment layer must not halve the frame rate just by existing.
   * It also runs at preview resolution while previewing, because a grade is
   * smooth: nobody can see that the multiply happened at 960px instead of 1920.
   */
  paintAdjustmentBand(ctx, band, W, H, t) {
    const a = band.adjust;
    const look = band.filter ? LOOK_BY_ID.get(resolveLookId(band.filter)) : void 0;
    const hasGrade = a ? this.gradeActive(a) : false;
    const hasLook = !!(look && look.css);
    const hasFinish = !!(look && (look.tint || look.grain || look.vignette));
    if (!hasGrade && !hasLook && !hasFinish) return;
    const rampIn = Math.min(1, (t - band.start) / 0.25);
    const rampOut = Math.min(1, (band.start + band.duration - t) / 0.25);
    const alpha = Math.max(0, Math.min(1, rampIn * rampOut));
    if (alpha <= 1e-3) return;
    if (!this.adjustBuf) this.adjustBuf = document.createElement("canvas");
    const off = this.adjustBuf;
    const scale = adjustmentScale(this.previewMaxSide, W, H);
    const W2 = Math.max(4, Math.round(W * scale));
    const H2 = Math.max(4, Math.round(H * scale));
    if (off.width !== W2 || off.height !== H2) {
      off.width = W2;
      off.height = H2;
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return;
    octx.filter = "none";
    octx.globalAlpha = 1;
    octx.clearRect(0, 0, W2, H2);
    octx.drawImage(this.canvas, 0, 0, W2, H2);
    if (hasGrade) {
      const img = octx.getImageData(0, 0, W2, H2);
      this.gradePixels(img.data, W2, H2, a);
      octx.putImageData(img, 0, 0);
    }
    if (hasLook || hasFinish) {
      octx.save();
      if (look?.css) octx.filter = look.css;
      octx.globalAlpha = alpha;
      octx.drawImage(off, 0, 0);
      octx.restore();
      if (hasFinish) {
        const finish = finishFor(band.filter);
        if (finish) paintFinish(octx, finish, W2, H2, alpha);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(off, 0, 0, W, H);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.restore();
  }
  /**
   * One-pass colour grade over RGBA pixels:
   *  • temperature — warm/cool channel push
   *  • tint        — green↔magenta balance
   *  • splitTone   — teal shadows, orange highlights
   *  • sharpen     — 3×1 luma unsharp mask (cheap but effective)
   *  • vignette    — radial darkening that follows the canvas aspect
   */
  gradePixels(d, W, H, a) {
    const temp = (a.temperature ?? 0) / 100;
    const tint = (a.tint ?? 0) / 100;
    const split = (a.splitTone ?? 0) / 100;
    const sharp = (a.sharpen ?? 0) / 100;
    const vig = (a.vignette ?? 0) / 100;
    if (temp !== 0 || tint !== 0 || split > 0) {
      const tr = temp * 26;
      const tb = -temp * 26;
      const tg = tint * 20;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        r += tr;
        b += tb;
        g += tg;
        if (split > 0) {
          const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const kHigh = Math.max(0, l - 0.5) * 2 * split;
          const kLow = Math.max(0, 0.5 - l) * 2 * split;
          r += 26 * kHigh - 10 * kLow;
          g += 8 * kHigh + 12 * kLow;
          b += -18 * kHigh + 30 * kLow;
        }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
    if (sharp > 0) {
      const stride = W * 4;
      if (!this.sharpenBuf || this.sharpenBuf.length !== d.length) {
        this.sharpenBuf = new Uint8ClampedArray(d.length);
      }
      const centre = this.sharpenBuf;
      centre.set(d);
      const amt = 0.85 * sharp;
      for (let y = 1; y < H - 1; y++) {
        let i = y * stride + 4;
        for (let x = 1; x < W - 1; x++, i += 4) {
          const up = i - stride;
          const dn = i + stride;
          const vR = centre[i];
          const vG = centre[i + 1];
          const vB = centre[i + 2];
          const bR = (centre[i - 4] + centre[i + 4] + centre[up] + centre[dn]) * 0.25;
          const bG = (centre[i - 3] + centre[i + 5] + centre[up + 1] + centre[dn + 1]) * 0.25;
          const bB = (centre[i - 2] + centre[i + 6] + centre[up + 2] + centre[dn + 2]) * 0.25;
          d[i] = vR + (vR - bR) * amt;
          d[i + 1] = vG + (vG - bG) * amt;
          d[i + 2] = vB + (vB - bB) * amt;
        }
      }
    }
    if (vig > 0) {
      const cx = W / 2;
      const cy = H / 2;
      const maxD = Math.hypot(cx, cy);
      const RAMP = new Float32Array(1025);
      for (let k = 0; k <= 1024; k++) {
        const r = k / 1024 * 1.6;
        RAMP[k] = r < 0.55 ? 1 : 1 - vig * 0.85 * Math.min(1, (r - 0.55) / 0.45) ** 1.4;
      }
      const scale = 1024 / 1.6;
      for (let y = 0; y < H; y++) {
        const dy = (y - cy) / maxD;
        const dy2 = dy * dy;
        const row = y * W;
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / maxD;
          const r = Math.sqrt(dx * dx + dy2);
          if (r < 0.55) continue;
          const k = RAMP[Math.min(1024, r * scale | 0)];
          const i = (row + x) * 4;
          d[i] *= k;
          d[i + 1] *= k;
          d[i + 2] *= k;
        }
      }
    }
  }
  /** Frame-fit modes: cover (crop) · contain (letterbox) · blur (blurred fill). */
  drawImageFit(ctx, src, W, H, fit, frame) {
    this.paintFit(ctx, src, W, H, fit, frame);
  }
  paintFit(ctx, src, W, H, fit, frame) {
    const sw = srcW(src);
    const sh = srcH(src);
    if (!sw || !sh) return;
    const mode = fit ?? "cover";
    const geo = frame && !isDefaultGeometry(frame) ? clampGeometry(frame) : null;
    if (geo && geo.rot !== 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(geo.rot * Math.PI / 180);
      const rad = Math.abs(geo.rot * Math.PI / 180);
      const grow = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad));
      ctx.scale(grow, grow);
      ctx.translate(-W / 2, -H / 2);
      this.paintFit(ctx, src, W, H, mode, { ...geo, rot: 0 });
      ctx.restore();
      return;
    }
    if (mode === "cover") {
      if (geo) {
        const rect = coverSourceRect(sw, sh, W, H, geo);
        ctx.drawImage(src, rect.sx, rect.sy, rect.swp, rect.shp, 0, 0, W, H);
        return;
      }
      const scale2 = Math.max(W / sw, H / sh);
      const dw2 = sw * scale2;
      const dh2 = sh * scale2;
      ctx.drawImage(src, (W - dw2) / 2, (H - dh2) / 2, dw2, dh2);
      return;
    }
    if (geo) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      const rect = coverSourceRect(sw, sh, W, H, geo);
      ctx.drawImage(src, rect.sx, rect.sy, rect.swp, rect.shp, 0, 0, W, H);
      ctx.restore();
      return;
    }
    const scale = Math.min(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    if (mode === "blur") {
      ctx.save();
      ctx.filter = `blur(${Math.max(6, Math.round(Math.min(W, H) * 0.035))}px)`;
      const s2 = Math.max(W / sw, H / sh) * 1.12;
      ctx.drawImage(src, (W - sw * s2) / 2, (H - sh * s2) / 2, sw * s2, sh * s2);
      ctx.restore();
    }
    ctx.drawImage(src, dx, dy, dw, dh);
  }
  drawImageCover(ctx, src, W, H) {
    let sw = 0;
    let sh = 0;
    if (src instanceof HTMLVideoElement) {
      sw = src.videoWidth;
      sh = src.videoHeight;
    } else if (src instanceof HTMLImageElement) {
      sw = src.naturalWidth;
      sh = src.naturalHeight;
    }
    if (!sw || !sh) return;
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  drawPlaceholder(ctx, W, H, mediaId, alpha, broken) {
    const m = this.media.get(mediaId);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (this.exporting) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#101625");
    g.addColorStop(1, "#1b1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    if (broken) {
      ctx.fillStyle = "rgba(255,196,88,0.95)";
      ctx.font = `600 ${Math.round(H * 0.024)}px system-ui, sans-serif`;
      ctx.fillText("\u26A0  video can't play on this device", W / 2, H / 2 - H * 0.05);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `500 ${Math.round(H * 0.019)}px system-ui, sans-serif`;
      ctx.fillText("(codec not supported \u2014 often HEVC camera clips)", W / 2, H / 2 + H * 5e-3);
      ctx.fillStyle = "rgba(125,255,210,0.85)";
      ctx.fillText("audio + captions still work", W / 2, H / 2 + H * 0.045);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `500 ${Math.round(H * 0.016)}px system-ui, sans-serif`;
      ctx.fillText(m?.name ?? "", W / 2, H / 2 + H * 0.085);
    }
    ctx.restore();
  }
  /** Text is drawn centered on the anchor point after the anim transform. */
  drawText(ctx, c, W, H, alpha, localT, dur, anim) {
    const rawText = c.text ?? "";
    if (!rawText) return;
    const text = c.upper ? rawText.toUpperCase() : rawText;
    const px = Math.max(4, (c.size ?? 64) * (H / 1080) * anim.scale);
    const weight = c.bold ? 700 : 500;
    const italic = c.italic ? "italic " : "";
    const anim2 = c.anim ?? "none";
    ctx.save();
    ctx.globalAlpha = alpha * clamp012(c.opacity ?? 1);
    let kbScale = 1;
    let kbX = 0;
    if (anim2 === "kenburns" && dur > 0.01) {
      const k = clamp012(localT / dur);
      kbScale = 1 + 0.09 * k;
      kbX = (k - 0.5) * W * 0.03;
    }
    let yOff = 0;
    let xOff = 0;
    let popScale = 1;
    let riseAlpha = 1;
    let swingAngle = 0;
    let blurPx2 = 0;
    let flipScale = 1;
    let skewX = 0;
    let trackMul = 1;
    let wavePhase = 0;
    if (anim2 === "bounce") yOff = -px * 0.9 * (1 - easeOutBounce(clamp012(localT / 0.55)));
    if (anim2 === "slideup") yOff = (1 - clamp012(localT / 0.4)) * H * 0.03;
    if (anim2 === "slideleft") xOff = (1 - clamp012(localT / 0.4)) * W * 0.06;
    if (anim2 === "zoom-in") popScale = 0.72 + 0.28 * easeOutBounce(clamp012(localT / 0.5));
    if (anim2 === "rise") {
      const k = clamp012(localT / 0.55);
      yOff = (1 - k) * H * 0.06;
      riseAlpha = k;
    }
    if (anim2 === "wipe-in") riseAlpha = 1;
    if (anim2 === "pop") popScale = 0.4 + 0.6 * easeOutBack(clamp012(localT / 0.42));
    if (anim2 === "drop-in") yOff = -H * 0.28 * (1 - easeOutBounce(clamp012(localT / 0.7)));
    if (anim2 === "swing") swingAngle = (1 - easeOutBack(clamp012(localT / 0.75))) * -0.9;
    if (anim2 === "blur-in") blurPx2 = (1 - clamp012(localT / 0.5)) * px * 0.55;
    if (anim2 === "flip") {
      const k = clamp012(localT / 0.5);
      flipScale = Math.max(0.02, Math.abs(Math.cos(k * Math.PI)));
    }
    if (anim2 === "skew-in") skewX = (1 - clamp012(localT / 0.5)) * 0.55;
    if (anim2 === "tracking-in") {
      const k = easeOutCubic(clamp012(localT / 0.8));
      trackMul = 6 + (1 - 6) * k;
      riseAlpha = clamp012(localT / 0.25);
    }
    if (anim2 === "wave") wavePhase = localT * 3.4;
    ctx.font = `${italic}${weight} ${Math.round(px)}px ${fontCss(c.font, this.project.fonts)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tracking = (c.tracking ?? 0) * trackMul * px / 100;
    ctx.globalAlpha = alpha * clamp012(c.opacity ?? 1) * riseAlpha;
    if (anim2 === "karaoke" && (c.words?.length ?? 0) > 0) {
      this.drawTextKaraoke(ctx, c, W, H, px, localT);
      ctx.restore();
      return;
    }
    let reveal = Infinity;
    if (anim2 === "typewriter") reveal = Math.floor(Math.max(0, localT - 0.05) / 0.05) + 1;
    const rawLines = text.split("\n");
    let prefix = 0;
    const lines = rawLines.map((l) => {
      const n = Math.max(0, Math.min(l.length, reveal - prefix));
      prefix += l.length + 1;
      return l.slice(0, n);
    });
    const totalChars = text.length;
    const doneTyping = reveal >= totalChars;
    const lineH = px * (c.leading ?? 1.18);
    const measure = (l) => ctx.measureText(l).width + Math.max(0, l.length - 1) * tracking;
    const maxW = Math.max(...lines.map((l) => measure(l)), 0);
    const rawMaxW = Math.max(...rawLines.map((l) => measure(l)), 0);
    const totalH = lines.length * lineH;
    const pos = c.pos ?? "mc";
    const mx = W * 0.08;
    const my = H * 0.08;
    let x = W / 2;
    let y = H / 2;
    const col = pos[1];
    const widest = Math.max(maxW, rawMaxW);
    if (col === "l") x = mx + widest / 2 + px * 0.4;
    if (col === "r") x = W - mx - widest / 2 - px * 0.4;
    const row = pos[0];
    if (row === "t") y = my + totalH / 2;
    if (row === "b") y = H - my - totalH / 2;
    const xC = x + anim.x * (W / 2) + kbX + xOff;
    const yC = y + anim.y * (H / 2) + yOff;
    this.overlayRects.push({
      clipId: c.id,
      x: xC - widest / 2 - px * 0.4,
      y: yC - totalH / 2 - px * 0.28,
      w: widest + px * 0.8,
      h: totalH + px * 0.56
    });
    ctx.translate(xC, yC);
    const rot = anim.rotation + swingAngle * 180 / Math.PI;
    if (rot !== 0) ctx.rotate(rot * Math.PI / 180);
    if (skewX !== 0) ctx.transform(1, 0, skewX, 1, 0, 0);
    const sc = kbScale * popScale;
    if (sc !== 1) ctx.scale(sc, sc);
    if (flipScale !== 1) ctx.scale(flipScale, 1);
    if (blurPx2 > 0.05) ctx.filter = `blur(${blurPx2.toFixed(2)}px)`;
    if (c.bg && (anim2 !== "typewriter" || doneTyping)) {
      ctx.fillStyle = c.bg;
      const padX = px * 0.5;
      const padY = px * 0.28;
      const bw = widest + padX * 2;
      const bh = totalH + padY * 2;
      const radius = c.radius != null ? c.radius * px / 100 : Math.min(bh / 2, px * 0.4);
      roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, Math.max(0, Math.min(bh / 2, radius)));
      ctx.fill();
    }
    const color = c.color ?? "#ffffff";
    const drawLine = (l, yy) => {
      const startX = -measure(l) / 2;
      if (tracking > 0.01 || anim2 === "wave") {
        let cx = startX;
        let gi = 0;
        for (const ch of l) {
          const gw = ctx.measureText(ch).width;
          const bob = anim2 === "wave" ? Math.sin(wavePhase + gi * 0.55) * px * 0.16 : 0;
          const tilt = anim2 === "wave" ? Math.sin(wavePhase + gi * 0.55) * 0.09 : 0;
          if (bob !== 0 || tilt !== 0) {
            ctx.save();
            ctx.translate(cx + gw / 2, yy + bob);
            ctx.rotate(tilt);
            ctx.fillText(ch, 0, 0);
            if (c.stroke && c.stroke > 0) ctx.strokeText(ch, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(ch, cx + gw / 2, yy);
            if (c.stroke && c.stroke > 0) ctx.strokeText(ch, cx + gw / 2, yy);
          }
          cx += gw + tracking;
          gi++;
        }
      } else {
        ctx.fillText(l, 0, yy);
        if (c.stroke && c.stroke > 0) ctx.strokeText(l, 0, yy);
      }
      if (c.underline) {
        const w = measure(l);
        const uy = yy + px * 0.58;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = ctx.globalAlpha * 0.95;
        ctx.fillRect(-w / 2, uy, w, Math.max(1.5, px * 0.06));
        ctx.restore();
      }
    };
    const strokeW = c.stroke && c.stroke > 0 ? c.stroke * px / 100 : 0;
    if (strokeW > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = c.strokeColor || "rgba(0,0,0,0.85)";
      ctx.lineWidth = strokeW;
    }
    const shadowStrength = c.shadow ?? 0.55;
    if (anim2 === "neon") {
      ctx.shadowColor = color;
      ctx.shadowBlur = px * (0.3 + 0.14 * Math.sin(localT * 5));
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = color;
      lines.forEach((l, i) => {
        const yy = -totalH / 2 + lineH / 2 + i * lineH;
        drawLine(l, yy);
        drawLine(l, yy);
      });
    } else {
      ctx.fillStyle = color;
      if (shadowStrength > 0.02) {
        ctx.shadowColor = `rgba(0,0,0,${Math.min(1, 0.75 * shadowStrength)})`;
        ctx.shadowBlur = px * 0.12 * shadowStrength * (1 / 0.55);
        ctx.shadowOffsetY = px * 0.04 * (shadowStrength / 0.55);
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      lines.forEach((l, i) => {
        drawLine(l, -totalH / 2 + lineH / 2 + i * lineH);
      });
      if (anim2 === "typewriter" && !doneTyping && localT < dur - 0.1) {
        let count = 0;
        let caretLine = 0;
        let caretX = 0;
        for (let i = 0; i < lines.length; i++) {
          if (reveal <= count) break;
          caretLine = i;
          caretX = ctx.measureText(lines[i]).width / 2;
          count += lines[i].length + 1;
        }
        const blink = Math.floor(localT * 3) % 2 === 0;
        if (blink) {
          ctx.fillStyle = color;
          ctx.shadowBlur = 0;
          ctx.fillRect(
            caretX + 2,
            -totalH / 2 + lineH / 2 + caretLine * lineH - px * 0.4,
            px * 0.12,
            px * 0.8
          );
        }
      }
    }
    ctx.restore();
  }
  /** Karaoke: per-word highlight using c.words timing (clip-local seconds). */
  drawTextKaraoke(ctx, c, W, H, px, localT) {
    const words = (c.words ?? []).map((w) => ({
      t: w.t,
      w: w.text,
      ws: ctx.measureText(w.text).width
    }));
    const gap = px * 0.32;
    const maxLineW = W * 0.84;
    const lines = [];
    let cur = { items: [], width: 0 };
    for (const it of words) {
      const add = it.ws + (cur.items.length ? gap : 0);
      if (cur.items.length && cur.width + add > maxLineW) {
        lines.push(cur);
        cur = { items: [], width: 0 };
      }
      cur.items.push(it);
      cur.width += add;
    }
    if (cur.items.length) lines.push(cur);
    const lineH = px * 1.4;
    const totalW = Math.max(...lines.map((l) => l.width), 0);
    const totalH = lines.length * lineH;
    const pos = c.pos ?? "bc";
    let x = W / 2;
    let y = H / 2;
    const mx = W * 0.08;
    const my = H * 0.08;
    const col = pos[1];
    if (col === "l") x = mx + totalW / 2 + px * 0.3;
    if (col === "r") x = W - mx - totalW / 2 - px * 0.3;
    const row = pos[0];
    if (row === "t") y = my + totalH / 2;
    if (row === "b") y = H - my - totalH / 2;
    x += (c.x ?? 0) * (W / 2);
    y += (c.y ?? 0) * (H / 2);
    this.overlayRects.push({
      clipId: c.id,
      x: x - totalW / 2 - px * 0.4,
      y: y - totalH / 2 - px * 0.18,
      w: totalW + px * 0.8,
      h: totalH + px * 0.36
    });
    ctx.translate(x, y);
    ctx.fillStyle = c.bg || "rgba(0,0,0,0.35)";
    roundRectPath(
      ctx,
      -totalW / 2 - px * 0.4,
      -totalH / 2 - px * 0.18,
      totalW + px * 0.8,
      totalH + px * 0.36,
      px * 0.3
    );
    ctx.fill();
    let activeIndex = -1;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let cx = -line.width / 2;
      for (let wi = 0; wi < line.items.length; wi++) {
        const it = line.items[wi];
        const on = localT >= it.t;
        if (on) activeIndex = li * 1e3 + wi;
        ctx.fillStyle = on ? c.color ?? "#ffffff" : "rgba(255,255,255,0.38)";
        ctx.shadowColor = on ? "rgba(0,0,0,0.6)" : "transparent";
        ctx.shadowBlur = on ? px * 0.1 : 0;
        ctx.fillText(it.w, cx + it.ws / 2, -totalH / 2 + lineH / 2 + li * lineH);
        cx += it.ws + gap;
      }
    }
    if (activeIndex >= 0) {
      const li = Math.floor(activeIndex / 1e3);
      const wi = activeIndex % 1e3;
      const line = lines[li];
      if (line) {
        let cx = -line.width / 2;
        for (let i = 0; i < wi; i++) cx += line.items[i].ws + gap;
        const it = line.items[wi];
        ctx.fillStyle = c.color ?? "#ffffff";
        ctx.fillRect(
          cx,
          -totalH / 2 + lineH / 2 + li * lineH + px * 0.62,
          it.ws,
          Math.max(2, px * 0.07)
        );
      }
    }
  }
  // ------------------------------------------------------------- mutations
  /** Notify the editor after a direct model edit and update playback immediately. */
  commitChange() {
    this.bump();
    this.syncElements(false);
    this.draw();
  }
  bump() {
    this.version++;
    this.onVersion?.();
  }
  addMainClip(media, atEnd = true) {
    const dur = media.kind === "video" ? media.duration ?? 5 : media.kind === "audio" ? media.duration ?? 3 : 3;
    const clip = {
      id: uid("mc"),
      mediaId: media.id,
      in: 0,
      out: media.kind === "image" ? 3 : Math.max(0.5, dur),
      speed: 1,
      reverse: false,
      filter: "none",
      adjust: { ...DEFAULT_ADJUST },
      volume: 1,
      muted: false,
      transitionIn: "none",
      transitionDur: 0
    };
    if (!atEnd) this.project.main.unshift(clip);
    else this.project.main.push(clip);
    this.bump();
    return clip;
  }
  /**
   * Split the main clip under the playhead. Keyframes are carried over to the
   * two halves at their clip-local offsets. Returns true on success.
   */
  splitAt(t) {
    const spans = mainSpans(this.project);
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (t <= s.start || t >= s.end) continue;
      const c = s.clip;
      if (c.freeze || c.rampTo != null || (c.curve?.length ?? 0) >= 2) return false;
      const srcAt = mainSrcAt(c, t - s.start);
      if (srcAt - c.in < 0.08 || c.out - srcAt < 0.08) return false;
      const local = t - s.start;
      const kfsA = c.keyframes?.filter((k) => k.at < local);
      const kfsB = c.keyframes?.filter((k) => k.at >= local).map((k) => ({ at: k.at - local, v: { ...k.v } }));
      const a = {
        ...c,
        id: uid("mc"),
        in: c.reverse ? srcAt : c.in,
        out: c.reverse ? c.out : srcAt,
        keyframes: kfsA && kfsA.length ? kfsA : void 0
      };
      const b = {
        ...c,
        id: uid("mc"),
        in: c.reverse ? c.in : srcAt,
        out: c.reverse ? srcAt : c.out,
        transitionIn: "none",
        transitionDur: 0,
        keyframes: kfsB && kfsB.length ? kfsB : void 0
      };
      this.project.main.splice(i, 1, a, b);
      this.bump();
      return true;
    }
    return false;
  }
  /**
   * Remove a main clip, keeping the rest of the timeline attached to it.
   *
   * The main track is a spine, so splicing a clip out slides every later clip
   * left — while overlays sit at absolute times and do not move. Before this,
   * deleting one clip near the start silently desynced every caption, sticker
   * and music cue after it. `removeMainClip` shifts them together; "lift" keeps
   * the hole instead and trims what was in it.
   */
  deleteMainClip(id, mode = "ripple") {
    const spans = mainSpans(this.project);
    const result = removeMainClip(
      this.project,
      id,
      mode,
      (i) => spans[i]?.start ?? 0,
      (i) => spans[i] ? spans[i].end - spans[i].start : 0
    );
    if (!result) return null;
    this.project.main = result.main;
    this.project.tracks = result.tracks;
    this.bump();
    return result;
  }
  duplicateMainClip(id) {
    const i = this.project.main.findIndex((c) => c.id === id);
    if (i === -1) return;
    const src = this.project.main[i];
    this.project.main.splice(i + 1, 0, {
      ...src,
      id: uid("mc"),
      adjust: { ...src.adjust },
      keyframes: src.keyframes?.map((k) => ({ at: k.at, v: { ...k.v } })),
      transitionIn: "none",
      transitionDur: 0
    });
    this.bump();
  }
  replaceMainClipMedia(id, media) {
    const c = this.project.main.find((x) => x.id === id);
    if (!c) return;
    const maxOut = media.kind === "image" ? media.duration ?? 3 : media.duration ?? c.out - c.in;
    const keepDur = c.out - c.in;
    c.mediaId = media.id;
    c.in = 0;
    c.out = media.kind === "image" ? Math.min(3, keepDur || 3) : Math.min(maxOut, Math.max(0.5, keepDur));
    c.reverse = false;
    this.bump();
  }
  moveMainClip(id, dir) {
    const i = this.project.main.findIndex((c) => c.id === id);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= this.project.main.length) return;
    const arr = this.project.main;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.bump();
  }
  addTextClip(trackId, start, overrides) {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks[0];
    const clip = {
      id: uid("tc"),
      kind: "text",
      start: Math.max(0, start),
      duration: Math.max(1, Math.min(3, this.duration() - start || 3)),
      text: "Your text",
      size: 72,
      color: "#ffffff",
      bg: "",
      bold: true,
      pos: "bc",
      anim: "fade",
      ...overrides
    };
    clip.id = uid("tc");
    clip.kind = "text";
    track.clips.push(clip);
    this.bump();
    return clip;
  }
  /**
   * Add an adjustment band: a grade that applies to everything under it.
   *
   * Deliberately not a variant of addTextClip — a band has no text, no colour
   * and no picture, and giving it text defaults would put "Your text" on screen
   * the moment it was created.
   */
  addAdjustmentClip(trackId, start, duration) {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks.find((t) => t.id === "t_adjust") ?? this.project.tracks[this.project.tracks.length - 1];
    const clip = {
      id: uid("adj"),
      kind: "adjustment",
      start: Math.max(0, start),
      duration: Math.max(0.2, duration),
      adjust: { brightness: 100, contrast: 106, saturation: 106, hue: 0 }
    };
    track.clips.push(clip);
    this.bump();
    return clip;
  }
  addImageOverlay(trackId, media, start) {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks[1];
    const isStickerVideo = media.kind === "video" && (media.duration ?? 0) <= 6;
    const clip = {
      id: uid("ic"),
      kind: media.kind === "video" ? "video" : "image",
      mediaId: media.id,
      start: Math.max(0, start),
      // full source length: silently cutting to 6s truncated real footage
      duration: media.kind === "video" ? Math.max(0.5, media.duration ?? 6) : 3,
      scale: isStickerVideo ? 1 : 0.5,
      x: 0,
      y: isStickerVideo ? 0 : -0.4,
      rot: 0,
      chroma: false,
      ...isStickerVideo ? { blend: "screen", loop: true } : {}
    };
    track.clips.push(clip);
    this.bump();
    return clip;
  }
  addAudioClip(trackId, media, start) {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks[2];
    const clip = {
      id: uid("ac"),
      kind: "audio",
      mediaId: media.id,
      start: Math.max(0, start),
      duration: Math.max(1, media.duration ?? 10),
      volume: 1,
      fadeIn: 0.15,
      fadeOut: 0.15
    };
    track.clips.push(clip);
    this.bump();
    return clip;
  }
  updateOverlay(clipId, patch) {
    for (const tr of this.project.tracks) {
      const c = tr.clips.find((x) => x.id === clipId);
      if (c) {
        Object.assign(c, patch);
        this.bump();
        return;
      }
    }
  }
  deleteOverlay(clipId) {
    for (const tr of this.project.tracks) {
      const i = tr.clips.findIndex((x) => x.id === clipId);
      if (i !== -1) {
        tr.clips.splice(i, 1);
        this.bump();
        return;
      }
    }
  }
  /** Public lookup used by the Assist tools. */
  getClip(clipId) {
    return this.findClipAny(clipId);
  }
  /**
   * Beat-cut: replace the main timeline with one hard-cut clip per beat
   * segment of the given media, keeping that media's filter/volume if it was
   * already on the timeline.
   */
  applyBeatCuts(media, segments) {
    const src = this.project.main.find((c) => c.mediaId === media.id);
    this.project.main = segments.map((sg, i) => ({
      id: uid("mc"),
      mediaId: media.id,
      in: sg.in,
      out: sg.out,
      speed: 1,
      reverse: false,
      filter: src?.filter ?? "none",
      adjust: src ? { ...src.adjust } : { ...DEFAULT_ADJUST },
      volume: src?.volume ?? 1,
      muted: src?.muted ?? false,
      transitionIn: i === 0 ? "none" : "none",
      transitionDur: 0
    }));
    this.bump();
  }
  /**
   * Freeze the frame under the playhead: splits the main clip at the playhead
   * and inserts a held-frame clip (CapCut's Freeze). Returns the new clip.
   */
  freezeAt(t, hold = 3) {
    const spans = mainSpans(this.project);
    const idx = spans.findIndex((s2) => t >= s2.start && t < s2.end);
    if (idx === -1) return false;
    const s = spans[idx];
    const c = s.clip;
    const srcAt = mainSrcAt(c, t - s.start);
    const atEnd = t - s.start > s.end - s.start - 0.2;
    if (atEnd) {
      const f2 = freezeClipFrom(c, srcAt, hold);
      this.project.main.splice(idx + 1, 0, f2);
      this.bump();
      return f2;
    }
    if (!this.splitAt(t)) return false;
    const spans2 = mainSpans(this.project);
    const idx2 = spans2.findIndex((sp) => t >= sp.start - 1e-3 && t < sp.start + 0.02);
    const f = freezeClipFrom(c, srcAt, hold);
    const insertAt = idx2 === -1 ? idx + 1 : idx2;
    this.project.main.splice(insertAt, 0, f);
    this.bump();
    return f;
  }
  /** Apply a transition to a clip (also used by the batch "apply to all"). */
  setTransition(clipId, kind, dur) {
    const c = this.project.main.find((x) => x.id === clipId);
    if (!c) return;
    c.transitionIn = kind;
    c.transitionDur = kind === "none" ? 0 : Math.max(0.1, dur);
    this.bump();
  }
  /** Apply one transition to every clip after the first (CapCut "apply to all"). */
  setTransitionAll(kind, dur) {
    this.project.main.forEach((c, i) => {
      if (i === 0) {
        c.transitionIn = "none";
        c.transitionDur = 0;
        return;
      }
      c.transitionIn = kind;
      c.transitionDur = kind === "none" ? 0 : Math.max(0.1, dur);
    });
    this.bump();
  }
  /** Duplicate every overlay clip on a track (CapCut "duplicate track"). */
  duplicateTrack(trackId) {
    const tr = this.project.tracks.find((t) => t.id === trackId);
    if (!tr || tr.clips.length === 0) return 0;
    const copies = tr.clips.map((c) => ({
      ...c,
      id: uid("ov"),
      start: c.start + 0.05,
      keyframes: c.keyframes?.map((k) => ({ at: k.at, v: { ...k.v } }))
    }));
    tr.clips.push(...copies);
    this.bump();
    return copies.length;
  }
  /** Move an overlay clip to another track (CapCut drag between lanes). */
  moveOverlayToTrack(clipId, trackId) {
    let found = null;
    let from = null;
    for (const tr of this.project.tracks) {
      const i = tr.clips.findIndex((c) => c.id === clipId);
      if (i !== -1) {
        found = tr.clips[i];
        from = tr;
        break;
      }
    }
    const to = this.project.tracks.find((t) => t.id === trackId);
    if (!found || !from || !to || from.id === to.id) return false;
    const wantsAudio = found.kind === "audio";
    if (wantsAudio && to.id !== "t_audio") return false;
    if (!wantsAudio && to.id === "t_audio") return false;
    from.clips = from.clips.filter((c) => c.id !== clipId);
    to.clips.push(found);
    this.bump();
    return true;
  }
  /**
   * Drag-reorder on the main track: move a clip to a new index. Keeps
   * transitions sane (a clip moved to the head can't fade in from nothing).
   */
  reorderMainClip(id, toIndex) {
    const from = this.project.main.findIndex((c2) => c2.id === id);
    if (from === -1) return false;
    const to = Math.max(0, Math.min(this.project.main.length - 1, toIndex));
    if (to === from) return false;
    const [c] = this.project.main.splice(from, 1);
    this.project.main.splice(to, 0, c);
    if (to === 0) {
      c.transitionIn = "none";
      c.transitionDur = 0;
    }
    this.bump();
    return true;
  }
  /** Split the main track at every beat marker (whole-project beat sync). */
  splitAtAllBeats() {
    const beats = (this.project.beats ?? []).slice().sort((a, b) => a - b);
    if (beats.length === 0) return 0;
    let n = 0;
    for (let i = beats.length - 1; i >= 0; i--) {
      if (this.splitAt(beats[i])) n++;
    }
    return n;
  }
  setBeats(beats) {
    this.project.beats = beats.slice(0, 400).sort((a, b) => a - b);
    this.bump();
  }
  /** Track mute/solo/hidden (visual tracks use hidden, audio ones mute/solo). */
  setTrackFlag(trackId, patch) {
    const tr = this.project.tracks.find((t) => t.id === trackId);
    if (!tr) return;
    Object.assign(tr, patch);
    this.bump();
    this.draw();
  }
  /** Patch a clip wherever it lives (main or overlay). */
  patchClip(clipId, patch) {
    const c = this.findClipAny(clipId);
    if (!c) return false;
    Object.assign(c, patch);
    this.bump();
    return true;
  }
  // ------------------------------------------------------------- keyframes
  findClipAny(clipId) {
    const m = this.project.main.find((c) => c.id === clipId);
    if (m) return m;
    for (const tr of this.project.tracks) {
      const c = tr.clips.find((x) => x.id === clipId);
      if (c) return c;
    }
    return null;
  }
  /** Add (or update, if one sits within 50 ms) a keyframe at clip-local time. */
  addKeyframe(clipId, at) {
    const c = this.findClipAny(clipId);
    if (!c) return null;
    const clamped = Math.max(0, at);
    const cur = animAt(c.keyframes, this.animBase(c), clamped);
    const existing = c.keyframes?.find((k) => Math.abs(k.at - clamped) < 0.05);
    if (existing) {
      existing.v = { ...cur };
      this.bump();
      return existing;
    }
    c.keyframes ??= [];
    const kf = { at: clamped, v: { ...cur } };
    c.keyframes.push(kf);
    c.keyframes.sort((a, b) => a.at - b.at);
    this.bump();
    return kf;
  }
  /** The keyframe nearest `at` within eps seconds, if any. */
  keyframeNear(clipId, at, eps = 0.12) {
    const c = this.findClipAny(clipId);
    if (!c?.keyframes?.length) return null;
    let best = null;
    let bestD = eps;
    for (const k of c.keyframes) {
      const d = Math.abs(k.at - at);
      if (d <= bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }
  /** Patch the values of the keyframe within eps of `at` (CapCut-style edit). */
  updateKeyframeAt(clipId, at, patch) {
    const kf = this.keyframeNear(clipId, at);
    if (!kf) return false;
    Object.assign(kf.v, patch);
    this.bump();
    return true;
  }
  deleteKeyframe(clipId, at, eps = 0.05) {
    const c = this.findClipAny(clipId);
    if (!c?.keyframes) return false;
    const i = c.keyframes.findIndex((k) => Math.abs(k.at - at) < eps);
    if (i === -1) return false;
    c.keyframes.splice(i, 1);
    if (c.keyframes.length === 0) c.keyframes = void 0;
    this.bump();
    return true;
  }
  // ------------------------------------------------------------- undo/redo
  snapshot() {
    return JSON.stringify(this.project);
  }
  /**
   * Read the current preview frame and compute the three scopes.
   *
   * Sampled, not exhaustive: a 1080p readback is 8 MB and the scopes are a UI
   * panel that updates while you drag a slider. Step 3 on each axis is 9x less
   * work and indistinguishable at these bin counts. Returns null when there is
   * no canvas yet, so the panel can show "nothing to measure" instead of lying.
   */
  scopes(step = 3) {
    if (!this.canvas || !this.ctx) return null;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w < 2 || h < 2) return null;
    try {
      const img = this.ctx.getImageData(0, 0, w, h);
      return buildScopes(img.data, { step, width: w, height: h });
    } catch {
      return null;
    }
  }
  restore(snap) {
    this.project = JSON.parse(snap);
    this.t = Math.min(this.t, this.duration());
    this.bump();
    this.draw();
  }
  // ------------------------------------------------------------- export (WebM)
  async exportMedia(opts, onProgress) {
    if (!this.canvas)
      throw new Error("Canvas not ready \u2014 wait for the preview to appear, then retry.");
    const blocked = exportBlocker();
    if (blocked) throw new Error(blocked);
    const picked = pickMime();
    if (!picked)
      throw new Error(
        "This browser does not support video recording, so a video file cannot be written here. Export a PNG frame or the WAV audio instead."
      );
    await this.ensureAudio();
    if (!this.audioCtx || !this.exportDest) {
      throw new Error(
        "Could not start the audio engine. Tap anywhere in the editor first (browsers block audio until you interact), then retry."
      );
    }
    if (this.duration() <= 0.05) {
      throw new Error("Nothing to export \u2014 add a clip to the timeline first.");
    }
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0;
    const wasLoop = this.loop;
    let canvasStream;
    let recorder;
    this.loop = false;
    try {
      this.useOriginalSources();
      for (const [id, rec2] of this.els) {
        if (rec2.el instanceof HTMLImageElement) continue;
        const target = rec2.videoBroken ? rec2.audioFallback : rec2.el;
        if (!target) continue;
        if (!rec2.sourceNode) {
          rec2.sourceNode = this.audioCtx.createMediaElementSource(target);
          rec2.sourceNode.connect(this.ensureFx(id).in);
        }
      }
      if (this.playing) this.pause();
      this.seek(0);
      await this.prepareExportFrame();
      canvasStream = this.canvas.captureStream(opts.fps);
      const mixed = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...this.exportDest.stream.getAudioTracks()
      ]);
      recorder = new MediaRecorder(mixed, {
        mimeType: picked.mime,
        videoBitsPerSecond: opts.videoBitsPerSecond,
        audioBitsPerSecond: opts.audioBitsPerSecond
      });
      const rec = recorder;
      const chunks = [];
      let recorderError;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise((resolve) => {
        rec.onstop = () => resolve();
        rec.onerror = (event) => {
          recorderError = event.error ?? new Error("Video recording failed");
          resolve();
        };
      });
      const dur = this.duration();
      rec.start(500);
      await this.play();
      const deadline = performance.now() + (dur + 15) * 1e3;
      while (rec.state === "recording" && !recorderError) {
        onProgress(Math.min(1, this.t / Math.max(1e-3, dur)));
        if (!this.playing) break;
        if (performance.now() > deadline)
          throw new Error("Export timed out before playback finished");
        await new Promise((r) => setTimeout(r, 200));
      }
      const endedEarly = this.t < dur - 0.03;
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      if (recorderError) throw recorderError;
      if (endedEarly) throw new Error("Recording stopped before the timeline finished");
      const blob = new Blob(chunks, { type: picked.mime });
      if (blob.size < 1e3) throw new Error("Export produced no data \u2014 try again");
      onProgress(1);
      return blob;
    } finally {
      this.pause();
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
        }
      }
      canvasStream?.getTracks().forEach((track) => track.stop());
      this.loop = wasLoop;
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
    }
  }
  // ------------------------------------------- export (MP4, frame-stepped)
  //
  // The reliable path. Instead of playing the timeline in real time and hoping
  // the recorder samples each frame, this walks the timeline one output frame at
  // a time:
  //
  //   for each frame index f:
  //     t = f / fps
  //     seek every visible element and WAIT for its decoded frame
  //     draw
  //     hand the canvas to the encoder with an explicit timestamp
  //
  // Wall-clock no longer matters. A slow phone produces the same file as a fast
  // laptop, just later — no dropped frames, no black frames from a half-seeked
  // element, no audio drifting out of sync. Audio is rendered offline from the
  // same resolver gains the preview uses, so what you hear while editing is what
  // lands in the file.
  /** Can this device export frame-stepped MP4? */
  async canExportStepped() {
    if (!mp4Supported()) return false;
    const { w, h } = ASPECTS[this.project.aspect];
    return !!await pickAvcCodec(w, h, 30, 4e6);
  }
  /**
   * Can this device export frame-stepped WebM?
   *
   * This matters on Safari and Firefox, which have no H.264 *encoder*: until
   * now those users got the real-time recorder and all of its dropped frames.
   * `VideoEncoder` + VP9 closes that gap without adding a codec of our own.
   */
  async canExportSteppedWebm() {
    const Ctor = window.VideoEncoder;
    if (!Ctor) return false;
    const { w, h } = ASPECTS[this.project.aspect];
    return !!await pickVpCodec(w, h, 30, 4e6);
  }
  /**
   * Render the project's audio to PCM, offline.
   *
   * Used by the frame-stepped exporter. Returns null when there is no audio at
   * all (a timeline of stills), so the caller can produce a valid video-only
   * file instead of failing.
   */
  async renderOfflineAudioTrack() {
    const dur = this.duration();
    if (dur <= 0.05) return null;
    const OCtor = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
    if (!OCtor) return null;
    const sampleRate = 48e3;
    const frames = Math.ceil(dur * sampleRate);
    const off = new OCtor(2, frames, sampleRate);
    const ids = /* @__PURE__ */ new Set();
    for (const c of this.project.main) ids.add(c.mediaId);
    for (const tr of this.project.tracks)
      for (const c of tr.clips) if (c.mediaId) ids.add(c.mediaId);
    const bufs = await this.decodeAllAudio(off, ids);
    await this.scheduleOfflineAudio(off, off.destination, bufs);
    const rendered = await off.startRendering();
    const channels = [];
    for (let i = 0; i < rendered.numberOfChannels; i++) {
      channels.push(rendered.getChannelData(i).slice(0));
    }
    if (channels.length === 0) return null;
    if (channels.length === 1) channels.push(channels[0].slice(0));
    return { channels, sampleRate, frames: rendered.length };
  }
  /**
   * Measure how fast THIS device can render frames.
   *
   * Frame-stepped export is slower than real time, and how much slower varies by
   * an order of magnitude across devices. Rather than guess, we time a small
   * number of real frames through the same path the exporter uses (seek, wait,
   * draw, hand to the encoder) and keep the result.
   *
   * The sample is intentionally small — 12 frames — so calling this before an
   * export costs well under a second on any device.
   */
  async measureThroughput(sampleFrames = 12) {
    if (!this.canvas || !mp4Supported()) return null;
    const dur = this.duration();
    if (dur <= 0.05) return null;
    const { w, h } = ASPECTS[this.project.aspect];
    const fps = 30;
    const codec = await pickAvcCodec(w, h, fps, 2e6);
    if (!codec) return null;
    const W_ = window;
    let counted = 0;
    let encError = null;
    const probe = new W_.VideoEncoder({
      output: () => {
        counted++;
      },
      error: (e) => {
        encError = encError ?? e;
      }
    });
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    try {
      await probe.configure({ codec, width: w, height: h, framerate: fps, bitrate: 2e6 });
      const n = Math.max(4, Math.min(24, sampleFrames));
      const started = performance.now();
      for (let f = 0; f < n; f++) {
        if (encError) break;
        const t = f / n * dur;
        await this.frameReadyAt(t, 1500);
        const vf = new W_.VideoFrame(this.canvas, { timestamp: f * 33333 });
        probe.encode(vf, { keyFrame: f === 0 });
        vf.close();
      }
      await probe.flush();
      const elapsed = performance.now() - started;
      if (encError || counted === 0) return null;
      const throughput = recordThroughput(counted, elapsed, { width: w, height: h });
      this.throughput = throughput;
      return planSteppedExport({ durationSec: dur, fps, width: w, height: h }, throughput);
    } catch {
      return null;
    } finally {
      try {
        probe.close();
      } catch {
      }
      this.exportScale = prevScale;
      this.previewMaxSide = prevCap;
      this.seek(this.t);
      if (wasPlaying) void this.play();
    }
  }
  /** Plan an export from the last measurement, if any. */
  planExport(opts) {
    const { w, h } = ASPECTS[this.project.aspect];
    const scale = opts.scale ?? 1;
    return planSteppedExport(
      {
        durationSec: this.duration(),
        fps: opts.fps,
        width: Math.round(w * scale),
        height: Math.round(h * scale)
      },
      this.throughput
    );
  }
  async exportMP4Stepped(opts, onProgress) {
    if (!this.canvas) throw new Error("Canvas not ready \u2014 wait for the preview, then retry.");
    if (!mp4Supported()) {
      throw new Error(
        "This browser cannot encode H.264, so frame-accurate MP4 is unavailable here. The frame-accurate WebM path produces the same result."
      );
    }
    const dur0 = this.duration();
    if (dur0 <= 0.05) throw new Error("Nothing to export \u2014 add a clip to the timeline first.");
    const { w: W, h: H } = ASPECTS[this.project.aspect];
    const fps = Math.max(1, Math.round(opts.fps));
    const codec = await pickAvcCodec(W, H, fps, opts.videoBitsPerSecond);
    if (!codec) {
      throw new Error(`H.264 encoding is not available at ${W}\xD7${H} here \u2014 try WebM.`);
    }
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0;
    this.loop = false;
    this.useOriginalSources();
    const W_ = window;
    const W2Audio = window;
    const audio = await this.renderOfflineAudioTrack();
    const sampleRate = audio?.sampleRate ?? 48e3;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width: W, height: H, frameRate: fps },
      ...audio ? { audio: { codec: "aac", numberOfChannels: 2, sampleRate } } : {},
      fastStart: "in-memory"
    });
    let encError = null;
    const videoEncoder = new W_.VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          encError = encError ?? e;
        }
      },
      error: (e) => {
        encError = encError ?? e;
      }
    });
    try {
      const totalFrames = Math.max(1, Math.round(dur0 * fps));
      await videoEncoder.configure({
        codec,
        width: W,
        height: H,
        framerate: fps,
        bitrate: opts.videoBitsPerSecond,
        latencyMode: "quality"
      });
      const keyEvery = Math.max(1, fps * 2);
      const frameDurUs = Math.round(1e6 / fps);
      for (let f = 0; f < totalFrames; f++) {
        if (encError) break;
        const t = Math.min(dur0, f / fps);
        await this.frameReadyAt(t, 3e3);
        const vf = new W_.VideoFrame(this.canvas, { timestamp: f * frameDurUs });
        videoEncoder.encode(vf, { keyFrame: f % keyEvery === 0 });
        vf.close();
        onProgress(Math.min(0.99, (f + 1) / totalFrames));
        if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await videoEncoder.flush();
      if (audio && !encError) {
        const audioEncoder = new W2Audio.AudioEncoder({
          output: (chunk, meta) => {
            try {
              muxer.addAudioChunk(chunk, meta);
            } catch (e) {
              encError = encError ?? e;
            }
          },
          error: (e) => {
            encError = encError ?? e;
          }
        });
        await audioEncoder.configure({
          codec: "mp4a.40.2",
          sampleRate,
          numberOfChannels: 2,
          bitrate: opts.audioBitsPerSecond
        });
        const chunkFrames = sampleRate;
        const data = audio.channels;
        for (let off = 0; off < audio.frames; off += chunkFrames) {
          const n = Math.min(chunkFrames, audio.frames - off);
          const l = data[0].slice(off, off + n);
          const r = data[1].slice(off, off + n);
          const ad = new W2Audio.AudioData({
            format: "f32-planar",
            sampleRate,
            numberOfFrames: n,
            numberOfChannels: 2,
            timestamp: Math.round(off / sampleRate * 1e6),
            data: [l, r]
          });
          audioEncoder.encode(ad);
          ad.close();
          if (off % (chunkFrames * 20) === 0) await new Promise((r2) => setTimeout(r2, 0));
        }
        await audioEncoder.flush();
        try {
          audioEncoder.close();
        } catch {
        }
      }
      if (encError) {
        throw encError instanceof Error ? encError : new Error(String(encError));
      }
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      if (blob.size < 1e3) throw new Error("Export produced no data \u2014 try again.");
      onProgress(1);
      return blob;
    } finally {
      try {
        videoEncoder.close();
      } catch {
      }
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
      this.seek(0);
      if (wasPlaying) void this.play();
    }
  }
  // ------------------------------------------ export (WebM, frame-stepped)
  //
  // The same frame-by-frame guarantee as the MP4 path, for the browsers that
  // cannot encode H.264 (Safari, Firefox). WebCodecs + VP8/VP9 + webm-muxer,
  // so this is still the platform's encoder — not a codec of our own.
  //
  // Audio is Opus, fed from the same offline PCM render the MP4 path uses, so
  // muting, crossfades and extracted-and-muted sources sound identical in
  // both formats.
  async exportWebmStepped(opts, onProgress) {
    if (!this.canvas) throw new Error("Canvas not ready \u2014 wait for the preview, then retry.");
    const dur0 = this.duration();
    if (dur0 <= 0.05) throw new Error("Nothing to export \u2014 add a clip to the timeline first.");
    const { w: W, h: H } = ASPECTS[this.project.aspect];
    const fps = Math.max(1, Math.round(opts.fps));
    const vp = await pickVpCodec(W, H, fps, opts.videoBitsPerSecond);
    if (!vp) {
      throw new Error("Frame-accurate WebM needs WebCodecs VP8/VP9 \u2014 this browser can't do it.");
    }
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0;
    this.loop = false;
    this.useOriginalSources();
    const W_ = window;
    const W2Audio = window;
    const audio = await this.renderOfflineAudioTrack();
    const sampleRate = audio?.sampleRate ?? 48e3;
    const opusRate = 48e3;
    if (audio && audio.sampleRate !== opusRate) {
      const ratio = opusRate / audio.sampleRate;
      const n = Math.max(1, Math.round(audio.frames * ratio));
      const resampled = [];
      for (let ch = 0; ch < 2; ch++) {
        const src = audio.channels[ch] ?? audio.channels[0];
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = i / ratio;
          const i0 = Math.floor(x);
          const i1 = Math.min(src.length - 1, i0 + 1);
          const frac = x - i0;
          out[i] = (src[i0] ?? 0) * (1 - frac) + (src[i1] ?? 0) * frac;
        }
        resampled.push(out);
      }
      audio.channels = resampled;
      audio.frames = n;
      audio.sampleRate = opusRate;
    }
    const target = new ArrayBufferTarget2();
    const muxer = new Muxer2({
      target,
      video: { codec: vp.mkv, width: W, height: H, frameRate: fps },
      ...audio ? { audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: opusRate } } : {}
    });
    let encError = null;
    const videoEncoder = new W_.VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          encError = encError ?? e;
        }
      },
      error: (e) => {
        encError = encError ?? e;
      }
    });
    try {
      const totalFrames = Math.max(1, Math.round(dur0 * fps));
      await videoEncoder.configure({
        codec: vp.config,
        width: W,
        height: H,
        framerate: fps,
        bitrate: opts.videoBitsPerSecond,
        latencyMode: "quality"
      });
      const keyEvery = Math.max(1, fps * 2);
      const frameDurUs = Math.round(1e6 / fps);
      for (let f = 0; f < totalFrames; f++) {
        if (encError) break;
        const t = Math.min(dur0, f / fps);
        await this.frameReadyAt(t, 3e3);
        const vf = new W_.VideoFrame(this.canvas, { timestamp: f * frameDurUs });
        videoEncoder.encode(vf, { keyFrame: f % keyEvery === 0 });
        vf.close();
        onProgress(Math.min(0.99, (f + 1) / totalFrames));
        if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await videoEncoder.flush();
      if (audio && !encError) {
        const audioEncoder = new W2Audio.AudioEncoder({
          output: (chunk, meta) => {
            try {
              muxer.addAudioChunk(chunk, meta);
            } catch (e) {
              encError = encError ?? e;
            }
          },
          error: (e) => {
            encError = encError ?? e;
          }
        });
        await audioEncoder.configure({
          codec: "opus",
          sampleRate: opusRate,
          numberOfChannels: 2,
          bitrate: opts.audioBitsPerSecond
        });
        const data = audio.channels;
        const chunkFrames = sampleRate;
        for (let off = 0; off < audio.frames; off += chunkFrames) {
          if (encError) break;
          const n = Math.min(chunkFrames, audio.frames - off);
          const l = data[0].slice(off, off + n);
          const r = data[1].slice(off, off + n);
          const ad = new W2Audio.AudioData({
            format: "f32-planar",
            sampleRate,
            numberOfFrames: n,
            numberOfChannels: 2,
            timestamp: Math.round(off / sampleRate * 1e6),
            data: [l, r]
          });
          audioEncoder.encode(ad);
          ad.close();
          if (off % (chunkFrames * 20) === 0) await new Promise((r2) => setTimeout(r2, 0));
        }
        await audioEncoder.flush();
        try {
          audioEncoder.close();
        } catch {
        }
      }
      if (encError) {
        throw encError instanceof Error ? encError : new Error(String(encError));
      }
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/webm" });
      if (blob.size < 1e3) throw new Error("Export produced no data \u2014 try again.");
      onProgress(1);
      return blob;
    } finally {
      try {
        videoEncoder.close();
      } catch {
      }
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
      this.seek(0);
      if (wasPlaying) void this.play();
    }
  }
  // ------------------------------------------------------------- export (MP4)
  // WebCodecs: H.264 video + AAC audio, muxed by mp4-muxer. Real-time render
  // (the timeline plays once while frames are captured), same as the WebM path.
  async exportMP4(opts, onProgress) {
    if (!this.canvas) throw new Error("Canvas not ready");
    if (!mp4Supported())
      throw new Error(
        "This browser cannot encode H.264 through WebCodecs, so MP4 is unavailable here. WebM works and can be exported frame-accurately."
      );
    const baseSize = ASPECTS[this.project.aspect];
    const W = baseSize.w * (opts.scale ?? 1);
    const H = baseSize.h * (opts.scale ?? 1);
    const codec = await pickAvcCodec(W, H, opts.fps, opts.videoBitsPerSecond);
    if (!codec)
      throw new Error("H.264 encoding is not supported at this resolution here \u2014 use WebM.");
    await this.ensureAudio();
    if (!this.audioCtx || !this.exportDest) throw new Error("Audio engine unavailable");
    const aacConfig = {
      codec: "mp4a.40.2",
      sampleRate: this.audioCtx.sampleRate,
      numberOfChannels: 2,
      bitrate: opts.audioBitsPerSecond
    };
    if (!await supportsAacEncoder(
      aacConfig.sampleRate,
      aacConfig.numberOfChannels,
      aacConfig.bitrate
    )) {
      throw new Error(
        "This device cannot encode AAC audio for a standard MP4 file. Choose WebM or use a device with AAC WebCodecs encoding support."
      );
    }
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0;
    const wasLoop = this.loop;
    const wasPlaying = this.playing;
    this.loop = false;
    let videoEncoder;
    let audioEncoder;
    let streamSource;
    let sp;
    let silence;
    let audioArmed = false;
    try {
      this.useOriginalSources();
      for (const [id, rec] of this.els) {
        if (rec.el instanceof HTMLImageElement) continue;
        const target2 = rec.videoBroken ? rec.audioFallback : rec.el;
        if (!target2) continue;
        if (!rec.sourceNode) {
          rec.sourceNode = this.audioCtx.createMediaElementSource(target2);
          rec.sourceNode.connect(this.ensureFx(id).in);
        }
      }
      if (wasPlaying) this.pause();
      this.seek(0);
      await this.prepareExportFrame();
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: "avc", width: W, height: H, frameRate: opts.fps },
        audio: { codec: "aac", numberOfChannels: 2, sampleRate: this.audioCtx.sampleRate },
        fastStart: "in-memory"
      });
      let encError = null;
      const W_ = window;
      videoEncoder = new W_.VideoEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addVideoChunk(chunk, meta);
          } catch (e) {
            encError = e;
          }
        },
        error: (e) => {
          encError = e;
        }
      });
      await videoEncoder.configure({
        codec,
        width: W,
        height: H,
        framerate: opts.fps,
        bitrate: opts.videoBitsPerSecond
      });
      audioEncoder = new W_.AudioEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addAudioChunk(chunk, meta);
          } catch (e) {
            encError = e;
          }
        },
        error: (e) => {
          encError = e;
        }
      });
      await audioEncoder.configure(aacConfig);
      streamSource = this.audioCtx.createMediaStreamSource(this.exportDest.stream);
      sp = this.audioCtx.createScriptProcessor(4096, 2, 2);
      silence = this.audioCtx.createGain();
      silence.gain.value = 0;
      streamSource.connect(sp);
      sp.connect(silence);
      silence.connect(this.audioCtx.destination);
      let audioT0 = null;
      sp.onaudioprocess = (e) => {
        if (!audioArmed || encError) return;
        const ab = e.inputBuffer;
        const rawTs = (this.audioCtx.currentTime - ab.length / ab.sampleRate) * 1e6;
        if (audioT0 == null) audioT0 = rawTs;
        try {
          const ch0 = ab.getChannelData(0);
          const ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
          const samples = new Float32Array(ab.length * 2);
          samples.set(ch0, 0);
          samples.set(ch1, ab.length);
          const ad = new AudioData({
            format: "f32-planar",
            sampleRate: ab.sampleRate,
            numberOfFrames: ab.length,
            numberOfChannels: 2,
            timestamp: Math.max(0, Math.round(rawTs - audioT0)),
            data: samples
          });
          try {
            audioEncoder.encode(ad);
          } finally {
            ad.close();
          }
        } catch (er) {
          encError = encError ?? er;
        }
      };
      const dur = this.duration();
      const frameDurUs = 1e6 / opts.fps;
      const keyEvery = opts.fps * 2;
      let frame = 0;
      let lastKeyFrame = -keyEvery;
      await this.play();
      audioArmed = true;
      const deadline = performance.now() + (dur + 15) * 1e3;
      while (this.playing || this.t < dur - 0.03) {
        const targetT = frame / opts.fps;
        if (this.t >= targetT - 2e-3) {
          try {
            frame = Math.max(frame, Math.floor(this.t * opts.fps));
            const wantKey = frame - lastKeyFrame >= keyEvery;
            const vf = new W_.VideoFrame(this.canvas, {
              timestamp: Math.round(frame * frameDurUs)
            });
            try {
              videoEncoder.encode(vf, { keyFrame: wantKey });
            } finally {
              vf.close();
            }
            if (wantKey) lastKeyFrame = frame;
            frame++;
          } catch (e) {
            encError = encError ?? e;
          }
        }
        onProgress(Math.min(1, this.t / Math.max(1e-3, dur)));
        if (encError) break;
        if (performance.now() > deadline) {
          encError = new Error("MP4 export timed out before the timeline finished");
          break;
        }
        await new Promise((r) => setTimeout(r, 16));
      }
      audioArmed = false;
      await videoEncoder.flush();
      await audioEncoder.flush();
      if (encError)
        throw encError instanceof Error ? encError : new Error("Encoder failed: " + String(encError));
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      if (blob.size < 1e3) throw new Error("Export produced no data \u2014 try again");
      onProgress(1);
      return blob;
    } finally {
      audioArmed = false;
      if (sp) sp.onaudioprocess = null;
      for (const node of [sp, silence, streamSource]) {
        try {
          node?.disconnect();
        } catch {
        }
      }
      for (const encoder of [audioEncoder, videoEncoder]) {
        try {
          if (encoder && encoder.state !== "closed") encoder.close();
        } catch {
        }
      }
      this.pause();
      this.loop = wasLoop;
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
    }
  }
  // ------------------------------------------------------------- export (GIF)
  /**
   * Animated GIF export (CapCut ships one; ours works fully offline).
   * Renders the timeline at a reduced grid with a per-frame web-safe palette.
   * Sizes are capped so a phone can actually finish the encode.
   */
  async exportGIF(opts, onProgress) {
    if (!this.canvas) throw new Error("Canvas not ready");
    const fps = Math.min(20, Math.max(6, opts.fps ?? 12));
    const maxSide = Math.min(720, Math.max(160, opts.maxSide ?? 480));
    const maxSeconds = Math.min(120, Math.max(1, opts.maxSeconds ?? 20));
    const base = ASPECTS[this.project.aspect];
    const k = maxSide / Math.max(base.w, base.h);
    const W = Math.max(16, Math.round(base.w * k / 2) * 2);
    const H = Math.max(16, Math.round(base.h * k / 2) * 2);
    const dur = Math.min(maxSeconds, this.duration());
    if (dur <= 0.05) throw new Error("Nothing to export \u2014 add media first");
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    const wasLoop = this.loop;
    const wasPlaying = this.playing;
    this.exporting = true;
    this.loop = false;
    this.previewMaxSide = 0;
    this.exportScale = W / base.w;
    try {
      if (wasPlaying) this.pause();
      this.seek(0);
      await this.ensureAudio();
      const palette = [];
      for (let r = 0; r < 6; r++)
        for (let g = 0; g < 6; g++)
          for (let b = 0; b < 6; b++) palette.push(r * 51 << 16 | g * 51 << 8 | b * 51);
      for (let i = 0; i < 40; i++) {
        const v = Math.round(i / 39 * 255);
        palette.push(v << 16 | v << 8 | v);
      }
      const frames = Math.max(1, Math.floor(dur * fps));
      const buf = new Uint8Array(W * H * frames + 1024 * 1024);
      const writer = new import_omggif.GifWriter(buf, W, H, { loop: 0, palette });
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) throw new Error("No 2D canvas context");
      const delayCs = Math.max(2, Math.round(100 / fps));
      const frameDur = dur / frames;
      void this.play();
      for (let f = 0; f < frames; f++) {
        const targetT = f * frameDur;
        const deadline = performance.now() + 400;
        while (this.t < targetT && performance.now() < deadline) {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
        await this.frameReadyAt(Math.min(dur, targetT), 400);
        octx.filter = "none";
        octx.globalAlpha = 1;
        octx.drawImage(this.canvas, 0, 0, W, H);
        const img = octx.getImageData(0, 0, W, H);
        writer.addFrame(0, 0, W, H, gifIndices(img.data, palette, opts.dither !== false), {
          delay: delayCs,
          disposal: 1
        });
        onProgress(Math.min(1, (f + 1) / frames));
      }
      if (!wasPlaying) this.pause();
      this.loop = wasLoop;
      return new Blob([buf.subarray(0, writer.end())], { type: "image/gif" });
    } finally {
      if (!wasPlaying) this.pause();
      this.loop = wasLoop;
      this.exportScale = prevScale;
      this.previewMaxSide = prevCap;
      this.exporting = false;
    }
  }
  /**
   * Audio-only export: render the full mix offline through an
   * OfflineAudioContext, then encode 16-bit WAV. Used for podcast / voiceover
   * workflows and as the audio half of the WAV download option.
   */
  /**
   * Decode every media blob to an AudioBuffer once, for the offline mixers.
   *
   * Shared by the WAV export and the frame-stepped MP4/WebM export so both get
   * identical audio. Returns null for media whose audio cannot be decoded
   * (silent videos, broken files) rather than throwing.
   */
  async decodeAllAudio(ctx, mediaIds) {
    const bufs = /* @__PURE__ */ new Map();
    for (const mediaId of mediaIds) {
      if (bufs.has(mediaId)) continue;
      const rec = this.els.get(mediaId);
      let buf = null;
      try {
        if (rec?.url) {
          const blob = await fetch(rec.url).then((r) => r.blob());
          buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        }
      } catch {
        buf = null;
      }
      bufs.set(mediaId, buf);
    }
    return bufs;
  }
  /**
   * Schedule the whole project's audio into an offline context.
   *
   * This is the audio half of a frame-stepped export. The gains come from
   * `mainClipGain` — the SAME function the preview's clock uses — so a muted
   * clip, a transition crossfade or an extracted-and-muted source behaves
   * identically in the exported file. The previous recorder path sampled a live
   * graph and could not guarantee that.
   *
   * Fades are written with short ramps rather than steps so transitions do not
   * click.
   */
  async scheduleOfflineAudio(off, dest, bufs, opts = {}) {
    const spans = mainSpans(this.project);
    const from = Math.max(0, opts.from ?? 0);
    const to = Math.min(this.duration(), opts.to ?? this.duration());
    if (to <= from) return;
    const step = Math.max(4e-3, opts.step ?? 1 / 60);
    const hasSolo = this.project.tracks.some((t) => t.solo);
    const master = off.createGain();
    master.gain.value = this.project.masterGain ?? 1;
    master.connect(dest);
    const rampedSource = (buf, startAt, srcOffset, length, rate, gainAt, fxId = "none") => {
      const src = off.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.05, rate);
      const g = off.createGain();
      src.connect(g);
      const fx = fxId !== "none" ? buildAudioFx(off, fxId, {
        impulse: (sec) => makeImpulse(off, sec)
      }) : null;
      if (fx) {
        g.connect(fx.input);
        fx.output.connect(master);
      } else {
        g.connect(master);
      }
      let last2 = Math.max(0, Math.min(2, gainAt(0)));
      g.gain.setValueAtTime(last2, startAt);
      for (let dt = step; dt < length; dt += step) {
        const v = Math.max(0, Math.min(2, gainAt(dt)));
        if (Math.abs(v - last2) > 1e-4) {
          g.gain.linearRampToValueAtTime(v, startAt + dt);
          last2 = v;
        }
      }
      const dur2 = Math.min(length, buf.duration - srcOffset);
      if (dur2 > 1e-3) src.start(startAt, Math.max(0, srcOffset), dur2);
    };
    if (!hasSolo) {
      for (const s of spans) {
        if (s.clip.freeze || s.clip.reverse || s.clip.muted) continue;
        if (s.end <= from || s.start >= to) continue;
        const buf = bufs.get(s.clip.mediaId);
        if (!buf) continue;
        const idx = spans.indexOf(s);
        const nextSpan = idx + 1 < spans.length ? spans[idx + 1] : null;
        const clipDur = Math.max(0.01, s.end - s.start);
        const mainFx = s.clip.audioFx ?? "none";
        rampedSource(
          buf,
          Math.max(from, s.start),
          s.clip.in,
          clipDur,
          s.clip.speed * audioFxRecipe(mainFx).rate,
          (dt) => mainClipGain(s.clip, s, nextSpan, s.start + dt, idx > 0) * this.duckFactor(s.start + dt),
          mainFx
        );
      }
    }
    for (const tr of this.project.tracks) {
      if (tr.hidden) continue;
      const trackGain = hasSolo ? tr.solo ? 1 : 0 : tr.muted ? 0 : 1;
      if (trackGain === 0) continue;
      for (const c of tr.clips) {
        if (!c.mediaId) continue;
        if (c.kind === "text") continue;
        if (c.kind === "video") continue;
        const start = Math.max(0, c.start);
        const end = start + Math.max(0, c.duration);
        if (end <= from || start >= to) continue;
        const buf = bufs.get(c.mediaId);
        if (!buf) continue;
        const vol = Math.max(0, Math.min(1, c.volume ?? 1));
        const fadeIn = Math.max(0, c.fadeIn ?? 0.15);
        const fadeOut = Math.max(0, c.fadeOut ?? 0.15);
        const fxId = c.audioFx ?? "none";
        const fxRate = audioFxRecipe(fxId).rate;
        rampedSource(
          buf,
          Math.max(from, start),
          0,
          end - start,
          fxRate,
          (dt) => {
            let v = vol;
            if (fadeIn > 0) v *= Math.min(1, dt / fadeIn);
            if (fadeOut > 0) v *= Math.min(1, (end - start - dt) / fadeOut);
            return v * trackGain * this.duckFactor(start + dt);
          },
          fxId
        );
      }
    }
  }
  /**
   * Export the project's audio as a 16-bit stereo WAV.
   *
   * This used to carry its OWN copy of the mix logic — a second scheduler with
   * its own idea of fades, solos and muted clips. That copy is why audio
   * effects, curves and ducking only ever appeared in the video exports: every
   * fix had to be made twice, and the second time was forgotten.
   *
   * It now renders through `scheduleOfflineAudio`, the same function the MP4
   * and WebM exporters use, so there is exactly one description of what the
   * project sounds like. A change to the mix cannot land in one format only.
   */
  async exportAudioWav(onProgress, opts = {}) {
    const sr = Math.min(48e3, Math.max(22050, opts.sampleRate ?? 44100));
    const from = Math.max(0, opts.from ?? 0);
    const to = Math.min(opts.to ?? this.duration(), 60 * 30);
    if (to - from <= 0.05) throw new Error("Nothing to export \u2014 add media first");
    const OCtor = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
    if (!OCtor) throw new Error("Offline audio rendering isn't available in this browser");
    const frames = Math.ceil((to - from) * sr);
    const off = new OCtor(2, frames, sr);
    onProgress(0.1);
    const ids = /* @__PURE__ */ new Set();
    for (const c of this.project.main) ids.add(c.mediaId);
    for (const tr of this.project.tracks)
      for (const c of tr.clips) if (c.mediaId) ids.add(c.mediaId);
    const bufs = await this.decodeAllAudio(off, ids);
    onProgress(0.4);
    await this.scheduleOfflineAudio(off, off.destination, bufs, { from, to });
    onProgress(0.6);
    const rendered = await off.startRendering();
    onProgress(0.9);
    const L = rendered.getChannelData(0);
    const R = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L;
    const n = L.length;
    const ab = new ArrayBuffer(44 + n * 4);
    const v = new DataView(ab);
    const tag = (o2, t) => {
      for (let i = 0; i < t.length; i++) v.setUint8(o2 + i, t.charCodeAt(i));
    };
    tag(0, "RIFF");
    v.setUint32(4, 36 + n * 4, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    tag(36, "data");
    v.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      o += 2;
      v.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      o += 2;
    }
    onProgress(1);
    return new Blob([ab], { type: "audio/wav" });
  }
  /** PNG still of the current frame — instant thumbnail/cover export. */
  /**
   * Render one frame at an arbitrary time, guaranteeing it is real.
   *
   * This is the primitive a frame-stepping (non-real-time) exporter needs: it
   * seeks, waits for the decoder, and only then reports the canvas as valid.
   * The real-time recorder paths cannot use it directly, but the GIF path and
   * any future offline encoder can — and, importantly, it is the same code the
   * tests exercise.
   */
  async renderFrameAt(t, budgetMs = 500) {
    if (!this.canvas) return null;
    await this.frameReadyAt(t, budgetMs);
    return this.canvas;
  }
  async exportStill(width = 1080) {
    if (!this.canvas) throw new Error("Canvas not ready");
    this.draw();
    const base = ASPECTS[this.project.aspect];
    const k = width / base.w;
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(base.w * k));
    c.height = Math.max(2, Math.round(base.h * k));
    const x = c.getContext("2d");
    if (!x) throw new Error("No 2D canvas context");
    x.drawImage(this.canvas, 0, 0, c.width, c.height);
    return new Promise(
      (resolve, reject) => c.toBlob((b) => b ? resolve(b) : reject(new Error("PNG encode failed")), "image/png")
    );
  }
  destroy() {
    this.pause();
    for (const [id, rec] of this.els) {
      this.stopBufSource(id);
      if (rec.videoLoadTimer) window.clearTimeout(rec.videoLoadTimer);
      const e = rec.el;
      if (e) e.pause?.();
      if (rec.audioFallback) rec.audioFallback.pause();
      if (rec.url) URL.revokeObjectURL(rec.url);
      rec.el.src = "";
    }
    this.els.clear();
    this.chromaCache.clear();
    this.keyColorCache.clear();
    try {
      void this.audioCtx?.close();
    } catch {
    }
    this.audioCtx = null;
  }
};
function gifIndices(rgba, palette, dither) {
  const px = rgba.length / 4;
  const out = new Uint8Array(px);
  const pal = palette.map((v) => [v >> 16 & 255, v >> 8 & 255, v & 255]);
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const key = r >> 3 << 10 | g >> 3 << 5 | b >> 3;
    let best = cache[key];
    if (best < 0) {
      best = 0;
      let bd = Infinity;
      for (let p = 0; p < pal.length; p++) {
        const dr = r - pal[p][0];
        const dg = g - pal[p][1];
        const db = b - pal[p][2];
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      cache[key] = best;
    }
    out[i] = best;
    if (dither && i + 1 < px) {
      const o2 = o + 4;
      const er = (r - pal[best][0]) * 0.5;
      const eb = (b - pal[best][2]) * 0.5;
      rgba[o2] = Math.max(0, Math.min(255, rgba[o2] + er));
      rgba[o2 + 2] = Math.max(0, Math.min(255, rgba[o2 + 2] + eb));
    }
  }
  return out;
}
export {
  Engine,
  FILTER_PRESETS,
  adjustmentScale,
  animAt,
  buildFilterCss,
  exportBlocker,
  finishFor,
  grainTexture,
  mp4Supported,
  paintFinish,
  pickMime,
  presetCss
};
