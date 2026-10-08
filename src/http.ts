// Streamable HTTP transport, stateless: a fresh McpServer and transport per POST /mcp, no sessions, JSON
// responses (clients that prefer SSE still work; the SDK negotiates). Behind nginx on the production box,
// which terminates TLS at https://antseedstats.com/mcp and hands us X-Real-IP.
import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "./config.js";
import { ApiClient, type ForwardHeaders } from "./lib/api-client.js";
import { createServer, TOOL_COUNT } from "./server.js";

/** Fixed window per IP, module state, same shape as the API's own limiter. Fails open without an IP. */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;
  constructor(private readonly limit: number, private readonly windowMs = 60_000) {}
  /**
   * `weight` is the number of JSON-RPC messages in the request: a batch of 5 costs 5. A request that does not
   * fit is refused without being charged, so a refused batch cannot lock out the single requests that would
   * still fit in the window.
   */
  hit(ip: string | null, now = Date.now(), weight = 1): { limited: boolean; retryAfterS: number } {
    if (!ip || this.limit <= 0) return { limited: false, retryAfterS: 0 };
    if (now - this.lastSweep > this.windowMs) {
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
      this.lastSweep = now;
    }
    let b = this.buckets.get(ip);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + this.windowMs }; this.buckets.set(ip, b); }
    const w = Math.max(1, weight);
    const retryAfterS = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    if (b.count + w > this.limit) return { limited: true, retryAfterS };
    b.count += w;
    return { limited: false, retryAfterS };
  }
}

/**
 * Largest JSON-RPC batch accepted in one POST; each message costs one unit of the per-IP budget. The SDK has its
 * own ceiling of 100 beneath this one.
 */
export const MAX_BATCH = 10;
/** Request body ceiling, shared by the parser and the 413 message. */
export const BODY_LIMIT = "1mb";

function xffHops(req: Request): string[] {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff.join(",") : xff ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * The end client's IP. Behind the trusted proxy, X-Real-IP (nginx sets it from the socket) wins; failing that,
 * the LAST X-Forwarded-For hop, which is the one the proxy appended. The first hop is whatever the client
 * typed, so it is never used.
 */
export function clientIp(req: Request, trustProxy: boolean): string | null {
  if (trustProxy) {
    const xr = req.headers["x-real-ip"];
    if (typeof xr === "string" && xr.trim()) return xr.trim();
    const hops = xffHops(req);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket.remoteAddress ?? null;
}

/** Headers forwarded to the API so its per-IP budget lands on the end client. */
export function forwardHeaders(req: Request, ip: string | null): ForwardHeaders {
  const out: ForwardHeaders = {};
  if (ip) out["x-real-ip"] = ip;
  const hops = xffHops(req);
  if (ip && !hops.includes(ip)) hops.unshift(ip);
  if (hops.length) out["x-forwarded-for"] = hops.join(", ");
  return out;
}

const rpcError = (res: Response, status: number, code: number, message: string, extra: Record<string, string> = {}) =>
  res.status(status).set(extra).json({ jsonrpc: "2.0", error: { code, message }, id: null });

export function createHttpApp(cfg: Config) {
  const app = express();
  app.disable("x-powered-by");
  const limiter = new RateLimiter(cfg.rateLimitPerMin);
  const health = new ApiClient(cfg);
  const over = (res: Response, retryAfterS: number) =>
    rpcError(res, 429, -32000, `Over ${cfg.rateLimitPerMin} requests per minute; retry in ${retryAfterS} s.`, { "Retry-After": String(retryAfterS) });

  // One unit is charged BEFORE the body is read, so an IP over its budget never gets a 1 MB parse out of us.
  const preCharge = (req: Request, res: Response, next: NextFunction) => {
    const rate = limiter.hit(clientIp(req, cfg.trustProxy));
    if (rate.limited) { over(res, rate.retryAfterS); return; }
    next();
  };

  app.post("/mcp", preCharge, express.json({ limit: BODY_LIMIT }), async (req, res) => {
    const ip = clientIp(req, cfg.trustProxy);
    // A JSON-RPC batch is N requests in one POST: it costs N and is capped, otherwise one POST could
    // fan out into hundreds of API calls while the limiter counted one. The first unit is already paid.
    const messages = Array.isArray(req.body) ? req.body.length : 1;
    if (messages > MAX_BATCH) {
      limiter.hit(ip, Date.now(), MAX_BATCH - 1); // parsing it was the expensive part; it is not free
      rpcError(res, 400, -32600, `Batch too large: at most ${MAX_BATCH} messages per request.`);
      return;
    }
    if (cfg.rateLimitPerMin > 0 && messages > cfg.rateLimitPerMin) {
      rpcError(res, 400, -32600, `Batch of ${messages} exceeds the ${cfg.rateLimitPerMin}-message budget per minute; it can never be served.`);
      return;
    }
    if (messages > 1) {
      const rate = limiter.hit(ip, Date.now(), messages - 1);
      if (rate.limited) { over(res, rate.retryAfterS); return; }
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

  // /health asks the API for /status, which is never cached there. One in-flight check at a time (the promise
  // is what gets cached), a good answer is kept for 30 s and a bad one for 5 s, so a loop on /health cannot
  // become a loop on the API and the probe recovers quickly once the API is back. Not rate limited: monitors
  // and the deploy script must be able to read it regardless of the tool budget.
  let healthCheck: { promise: Promise<boolean>; at: number; ttlMs: number } | null = null;
  app.get("/health", async (_req, res) => {
    const now = Date.now();
    if (!healthCheck || now - healthCheck.at > healthCheck.ttlMs) {
      const entry = { promise: health.reachable(), at: now, ttlMs: HEALTH_OK_TTL_MS };
      healthCheck = entry;
      void entry.promise.then((ok) => { if (!ok) entry.ttlMs = HEALTH_BAD_TTL_MS; });
    }
    const apiOk = await healthCheck.promise;
    res.status(apiOk ? 200 : 503).json({ status: apiOk ? "ok" : "degraded", name: cfg.name, version: cfg.version, tools: TOOL_COUNT, api_ok: apiOk });
  });

  // Body-parser failures and anything else: JSON-RPC errors, never Express's HTML page. Client-side 4xx keep
  // their status and message; a client that hung up mid-upload is not an error worth a stack trace.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { type?: string; status?: number; message?: string };
    if (e.type === "request.aborted" || res.headersSent || res.destroyed) return;
    if (e.type === "entity.parse.failed") { rpcError(res, 400, -32700, "Parse error: body is not valid JSON."); return; }
    if (e.type === "entity.too.large") { rpcError(res, 413, -32600, `Request body too large (${BODY_LIMIT} limit).`); return; }
    if (e.status && e.status >= 400 && e.status < 500) { rpcError(res, e.status, -32600, `Invalid request: ${e.message ?? e.type ?? "bad request"}`); return; }
    console.error("[antseedstats-mcp] request failed:", err);
    rpcError(res, 500, -32603, "Internal server error");
  });

  return app;
}

export const HEALTH_OK_TTL_MS = 30_000;
export const HEALTH_BAD_TTL_MS = 5_000;
