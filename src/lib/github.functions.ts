import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import { resolveGithubToken } from "@/lib/integrations.server";

const API = "https://api.github.com";

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "Mayobuild-Studio",
  };
}

async function gh(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...init, headers: ghHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[github] ${path} -> ${res.status} ${body.slice(0, 300)}`);
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Who does this token belong to, and what can it see? */
export const githubStatus = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const token = await resolveGithubToken(context.admin, context.user.id);
    if (!token) return { connected: false as const };
    try {
      const me = await gh(token, "/user");
      return {
        connected: true as const,
        login: me.login as string,
        name: (me.name ?? null) as string | null,
        avatar: (me.avatar_url ?? null) as string | null,
      };
    } catch (e: any) {
      return { connected: false as const, error: e.message as string };
    }
  });

/**
 * List every repo the token can reach — user repos AND org repos.
 * The old code never listed repos at all, so a single hard-coded repo name
 * was the only thing that ever got touched.
 */
export const githubListRepos = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const token = await resolveGithubToken(context.admin, context.user.id);
    if (!token) throw new Error("No GitHub connection. Add a token in the AI console first.");
    const repos: any[] = [];
    for (let page = 1; page <= 4; page++) {
      const batch = await gh(
        token,
        `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      );
      repos.push(...batch);
      if (batch.length < 100) break;
    }
    return {
      repos: repos.map((r) => ({
        full_name: r.full_name as string,
        private: !!r.private,
        default_branch: r.default_branch as string,
        updated_at: r.updated_at as string,
        html_url: r.html_url as string,
      })),
    };
  });

const RepoInput = z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/) });

/** Read a repo's file tree + text file contents (bidirectional sync: the "pull" half). */
export const githubImportRepo = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) =>
    RepoInput.extend({ maxFiles: z.number().min(1).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await resolveGithubToken(context.admin, context.user.id);
    if (!token) throw new Error("No GitHub connection. Add a token in the AI console first.");

    const meta = await gh(token, `/repos/${data.repo}`);
    const branch = meta.default_branch as string;
    const tree = await gh(token, `/repos/${data.repo}/git/trees/${branch}?recursive=1`);

    const TEXT = /\.(tsx?|jsx?|css|scss|html?|json|md|ya?ml|txt|svg|toml|sql|ino|cpp|h|py)$/i;
    const blobs = (tree.tree ?? [])
      .filter((n: any) => n.type === "blob" && TEXT.test(n.path) && n.size < 200_000)
      .slice(0, data.maxFiles ?? 60);

    const files: Record<string, string> = {};
    for (const b of blobs) {
      try {
        const blob = await gh(token, `/repos/${data.repo}/git/blobs/${b.sha}`);
        files[b.path] = Buffer.from(blob.content ?? "", "base64").toString("utf-8");
      } catch {
        /* skip unreadable blob */
      }
    }

    return {
      repo: data.repo,
      branch,
      fileCount: Object.keys(files).length,
      allPaths: (tree.tree ?? []).filter((n: any) => n.type === "blob").map((n: any) => n.path),
      files,
    };
  });

/** Push files to any repo the token can reach (bidirectional sync: the "push" half). */
export const githubPushFiles = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) =>
    RepoInput.extend({
      files: z.record(z.string(), z.string()),
      message: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const token = await resolveGithubToken(context.admin, context.user.id);
    if (!token) throw new Error("No GitHub connection. Add a token in the AI console first.");

    const results: { path: string; ok: boolean; reason?: string }[] = [];
    for (const [path, content] of Object.entries(data.files)) {
      try {
        const getRes = await fetch(`${API}/repos/${data.repo}/contents/${path}`, {
          headers: ghHeaders(token),
        });
        const current = getRes.ok ? await getRes.json() : null;
        const existing = current?.content
          ? Buffer.from(current.content, "base64").toString("utf-8")
          : null;
        if (existing === content) {
          results.push({ path, ok: true, reason: "unchanged" });
          continue;
        }
        const put = await fetch(`${API}/repos/${data.repo}/contents/${path}`, {
          method: "PUT",
          headers: ghHeaders(token),
          body: JSON.stringify({
            message: data.message ?? `Mayobuild Studio: update ${path}`,
            content: Buffer.from(content).toString("base64"),
            sha: current?.sha ?? undefined,
          }),
        });
        if (!put.ok) {
          const body = await put.text().catch(() => "");
          results.push({ path, ok: false, reason: `${put.status}: ${body.slice(0, 160)}` });
          continue;
        }
        results.push({ path, ok: true });
      } catch (e: any) {
        results.push({ path, ok: false, reason: e?.message ?? "network error" });
      }
    }
    return { repo: data.repo, results, pushed: results.filter((r) => r.ok && !r.reason).length };
  });
