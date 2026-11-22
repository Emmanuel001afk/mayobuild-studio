#!/usr/bin/env bash
# Generate the real-video fixtures used to test import / probe / proxy policy.
#
# Why these exist: every video path in MayoCut was verified against synthetic
# canvases and source greps. That cannot tell you whether an HEVC phone clip
# decodes, whether a 4K clip trips the proxy threshold, or whether a silent clip
# is mistaken for a broken one. Those questions need real, encoded files.
#
# The fixtures are generated, never downloaded: ffmpeg draws a synthetic pattern
# (so there is no licence question and no network), and every clip is deliberately
# small — the 4K one runs at 12 fps because frame RATE is irrelevant to a size
# policy, only frame SIZE is. The whole set is ~3 MB and checked in: a fixture
# that has to be regenerated is a fixture that silently changes.
#
# Usage:  bash scripts/make-fixtures.sh            # regenerate all
#         bash scripts/make-fixtures.sh --check    # verify present, don't write
#
# Requires ffmpeg on PATH or FFMPEG=/path/to/ffmpeg.
set -euo pipefail

FFMPEG="${FFMPEG:-ffmpeg}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/fixtures/video"

# --check must work anywhere: CI verifies the checked-in fixtures exist without
# having ffmpeg installed at all. Only regenerating needs the encoder.
if [[ "${1:-}" == "--check" ]]; then
  missing=0
  for f in h264-720p-2s.mp4 hevc-1080p-2s.mp4 h264-4k-1s.mp4 silent-1080p-2s.mp4 \
           h264-vertical-2s.mp4 vp9-720p-2s.webm fragmented-720p-2s.mp4; do
    if [[ ! -s "$OUT/$f" ]]; then echo "missing: $f" >&2; missing=1; fi
  done
  [[ $missing -eq 0 ]] && echo "fixtures present"
  exit $missing
fi

if ! command -v "$FFMPEG" >/dev/null 2>&1; then
  echo "ffmpeg not found — set FFMPEG=/path/to/ffmpeg" >&2
  exit 1
fi

mkdir -p "$OUT"

# A moving pattern, not a flat colour: a flat frame can be decoded correctly by
# accident and still look right, while motion exposes frame-ordering bugs.
SRC="testsrc2"

echo "→ h264-720p-2s.mp4        the baseline: small enough that a proxy is a waste"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=1280x720:duration=2" \
  -f lavfi -i "sine=frequency=440:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 30 -c:a aac -b:a 64k \
  -movflags +faststart "$OUT/h264-720p-2s.mp4"

echo "→ hevc-1080p-2s.mp4       an iPhone-style HEVC clip, 1080p"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=1920x1080:duration=2" \
  -f lavfi -i "sine=frequency=330:duration=2" \
  -c:v libx265 -pix_fmt yuv420p -preset ultrafast -crf 32 -tag:v hvc1 \
  -c:a aac -b:a 64k -movflags +faststart "$OUT/hevc-1080p-2s.mp4"

echo "→ h264-4k-1s.mp4          large enough to be worth a proxy, short enough to commit"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=3840x2160:duration=1" \
  -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 40 -r 12 \
  -movflags +faststart "$OUT/h264-4k-1s.mp4"

echo "→ silent-1080p-2s.mp4     no audio track at all — must not read as broken"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=1920x1080:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 32 -an \
  -movflags +faststart "$OUT/silent-1080p-2s.mp4"

echo "→ h264-vertical-2s.mp4    a phone held upright (1080x1920)"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=1080x1920:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 32 -an \
  -movflags +faststart "$OUT/h264-vertical-2s.mp4"

# A second container entirely. The codec hint reads Matroska CodecIDs as well as
# MP4 sample entries, and the MP4 box reader must decline this file rather than
# misread it — both are worth pinning to a real file.
echo "→ vp9-720p-2s.webm        a non-MP4 container; must be sniffed, not misparsed"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=1280x720:duration=2" \
  -c:v libvpx-vp9 -b:v 200k -crf 45 -an "$OUT/vp9-720p-2s.webm"

# Fragmented MP4 keeps its metadata in `moof` boxes, so a reader that only looks
# at `moov` finds nothing. The import path must say "I cannot read this" instead
# of reporting a 0x0, 0-second clip.
echo "→ fragmented-720p-2s.mp4  moov is split into fragments — must fail soft"
"$FFMPEG" -y -loglevel error -f lavfi -i "$SRC=rate=30:size=1280x720:duration=2" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 34 -an \
  -movflags +frag_keyframe+empty_moov "$OUT/fragmented-720p-2s.mp4"

echo
ls -lh "$OUT"
echo
echo "Total:"; du -sh "$OUT"
