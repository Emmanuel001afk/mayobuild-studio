export function normalizeSupabaseUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  const normalized = trimmed.replace(/\/(?:rest|auth|storage|functions)\/v1\/?$/i, "");

  try {
    const url = new URL(normalized);
    url.pathname = url.pathname.replace(/\/$/, "");
    return `${url.origin}${url.pathname}`;
  } catch {
    return normalized.replace(/\/$/, "");
  }
}