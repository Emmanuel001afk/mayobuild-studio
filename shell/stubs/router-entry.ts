/**
 * Shell-build stub for TanStack Start's plugin-injected "#tanstack-router-entry".
 * Only reachable from start-client-core's hydrateStart(), which the shell SPA
 * never calls (it mounts getRouter() from src/router directly).
 */
export async function getRouter(): Promise<never> {
  throw new Error("shell build: #tanstack-router-entry must not be used at runtime");
}
