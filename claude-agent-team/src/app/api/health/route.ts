/**
 * Health check endpoint — server liveness probe
 *
 * Like a hospital heartbeat monitor: checks vital signs (memory, uptime,
 * environment) and reports whether the patient (server) is healthy.
 *
 * Used by:
 * - start-pm2-prod.bat (post-start verification)
 * - start-background.js (self-test after boot)
 * - Docker HEALTHCHECK
 * - External monitoring
 *
 * No authentication required (liveness probes must be publicly accessible).
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = performance.now();

  const mem = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());
  const rssInMB = Math.round(mem.rss / 1024 / 1024);

  const checks: Record<string, { readonly status: string; readonly detail?: string }> = {};

  // Memory check — warn if RSS > 400MB (PM2 restarts at 512M)
  checks.memory = {
    status: rssInMB < 400 ? "pass" : "warn",
    detail: `${rssInMB}MB RSS`,
  };

  // Uptime check
  checks.uptime = {
    status: "pass",
    detail: `${uptimeSeconds}s`,
  };

  // Environment check
  const hasMode = !!process.env.CLAUDE_CODE_MODE;
  const hasPort = !!process.env.PORT;
  checks.environment = {
    status: hasMode && hasPort ? "pass" : "warn",
    detail: `mode=${process.env.CLAUDE_CODE_MODE ?? "unset"} port=${process.env.PORT ?? "unset"}`,
  };

  const overallStatus = Object.values(checks).every(
    (c) => c.status === "pass" || c.status === "warn",
  )
    ? "pass"
    : "fail";

  const responseTimeMs = Math.round(performance.now() - startTime);

  return Response.json(
    {
      status: overallStatus,
      version: process.env.npm_package_version ?? "unknown",
      nodeVersion: process.version,
      uptime: uptimeSeconds,
      responseTime: `${responseTimeMs}ms`,
      memory: {
        rss: `${rssInMB}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      },
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: overallStatus === "pass" ? 200 : 503 },
  );
}
