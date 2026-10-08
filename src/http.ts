// Streamable HTTP transport, stateless: a fresh McpServer and transport per POST /mcp, no sessions, JSON
// responses (clients that prefer SSE still work; the SDK negotiates). Behind nginx on the production box,
// which terminates TLS at https://antseedstats.com/mcp and hands us X-Real-IP.
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "./config.js";
import { ApiClient, type ForwardHeaders } from "./lib/api-client.js";
import { createServer, TOOL_COUNT } from "./server.js";

/** Fixed window per IP, module state, same shape as the API's own limiter. Fails open without an IP. */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;
  constructor(private readonly limit: number, private readonly windowMs = 60_000) {}
  hit(ip: string | null, now = Date.now()): { limited: boolean; retryAfterS: number } {
    if (!ip || this.limit <= 0) return { limited: false, retryAfterS: 0 };
    if (now - this.lastSweep > this.windowMs) {
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
      this.lastSweep = now;
    }
    let b = this.buckets.get(ip);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + this.windowMs }; this.buckets.set(ip, b); }
    b.count++;
    return { limited: b.count > this.limit, retryAfterS: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
}

export function clientIp(req: Request, trustProxy: boolean): string | null {
  if (trustProxy) {
    const xr = req.headers["x-real-ip"];
    if (typeof xr === "string" && xr.trim()) return xr.trim();
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? null;
}

/** Headers forwarded to the API so its per-IP budget lands on the end client. */
function forwardHeaders(req: Request, ip: string | null): ForwardHeaders {
  const out: ForwardHeaders = {};
  if (ip) out["x-real-ip"] = ip;
  const xff = req.headers["x-forwarded-for"];
  const chain = Array.isArray(xff) ? xff.join(", ") : xff;
  out["x-forwarded-for"] = chain ? (ip && !chain.includes(ip) ? `${ip}, ${chain}` : chain) : (ip ?? undefined);
  return out;
}

const rpcError = (res: Response, status: number, code: number, message: string, extra: Record<string, string> = {}) =>
  res.status(status).set(extra).json({ jsonrpc: "2.0", error: { code, message }, id: null });

export function createHttpApp(cfg: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  const limiter = new RateLimiter(cfg.rateLimitPerMin);
  const health = new ApiClient(cfg);

  app.post("/mcp", async (req, res) => {
    const ip = clientIp(req, cfg.trustProxy);
    const rate = limiter.hit(ip);
    if (rate.limited) {
      rpcError(res, 429, -32000, `Over ${cfg.rateLimitPerMin} requests per minute; retry in ${rate.retryAfterS} s.`, { "Retry-After": String(rate.retryAfterS) });
      return;
    }
    try {
      const server = createServer(cfg, forwardHeaders(req, ip));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[antseedstats-mcp] POST /mcp failed:", err);
      if (!res.headersSent) rpcError(res, 500, -32603, "Internal server error");
    }
  });

  // Stateless: no SSE stream to resume, no session to delete.
  app.get("/mcp", (_req, res) => { rpcError(res, 405, -32000, "Method not allowed. POST JSON-RPC to /mcp (stateless Streamable HTTP).", { Allow: "POST" }); });
  app.delete("/mcp", (_req, res) => { rpcError(res, 405, -32000, "Method not allowed. This server keeps no sessions.", { Allow: "POST" }); });

  app.get("/health", async (_req, res) => {
    const apiOk = await health.reachable();
    res.status(apiOk ? 200 : 503).json({ status: apiOk ? "ok" : "degraded", name: cfg.name, version: cfg.version, tools: TOOL_COUNT, api_ok: apiOk });
  });

  return app;
}
