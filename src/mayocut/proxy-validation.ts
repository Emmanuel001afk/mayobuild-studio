/**
 * Fail-closed metadata gate for a future native proxy pipeline. These checks
 * detect common incomplete/misaligned proxies, but do NOT prove sample-level
 * sync or fidelity. A proxy must not be enabled based on this gate alone.
 */
export interface ProxyStreamInfo {
  type: "video" | "audio";
  start: number;
  duration: number;
  channels?: number;
  sampleRate?: number;
}
export interface ProxyMediaInfo {
  duration: number;
  streams: ProxyStreamInfo[];
}
export function validateProxyMetadata(
  source: ProxyMediaInfo,
  proxy: ProxyMediaInfo,
): { ok: boolean; reason?: string } {
  const fail = (reason: string) => ({ ok: false, reason });
  const validDuration = (n: number) => Number.isFinite(n) && n > 0;
  if (!validDuration(source.duration) || !validDuration(proxy.duration))
    return fail("Missing duration");
  // Allow encoder rounding, not a visibly different timeline length.
  const tolerance = 0.1;
  if (Math.abs(source.duration - proxy.duration) > tolerance) return fail("Duration differs");
  const sourceVideo = source.streams.filter((stream) => stream.type === "video");
  const proxyVideo = proxy.streams.filter((stream) => stream.type === "video");
  const sourceAudio = source.streams.filter((stream) => stream.type === "audio");
  const proxyAudio = proxy.streams.filter((stream) => stream.type === "audio");
  if (sourceVideo.length !== 1 || proxyVideo.length !== 1) return fail("Unsupported video streams");
  if (sourceAudio.length !== proxyAudio.length || sourceAudio.length > 1)
    return fail("Audio streams differ or are unsupported");
  for (const [a, b] of [
    [sourceVideo[0], proxyVideo[0]],
    ...sourceAudio.map((stream, i) => [stream, proxyAudio[i]]),
  ]) {
    if (
      !Number.isFinite(a.start) ||
      !Number.isFinite(b.start) ||
      !validDuration(a.duration) ||
      !validDuration(b.duration)
    )
      return fail("Incomplete stream timing");
    if (Math.abs(a.start - b.start) > tolerance || Math.abs(a.duration - b.duration) > tolerance)
      return fail("Stream timing differs");
    if (
      a.type === "audio" &&
      (!a.channels ||
        !b.channels ||
        a.channels !== b.channels ||
        !a.sampleRate ||
        !b.sampleRate ||
        a.sampleRate !== b.sampleRate)
    )
      return fail("Audio format differs");
  }
  return { ok: true };
}
