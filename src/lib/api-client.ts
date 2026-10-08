// Thin client for the AntSeedStats REST API (/api/v1). One GET per tool call; the envelope comes back as is.
// In HTTP mode the end client's IP is forwarded (X-Real-IP, X-Forwarded-For) so the API's per-IP budget applies
// to the person asking, not to the MCP host. Without those headers a localhost call would be unlimited.
import type { Config } from "../config.js";
import { USER_AGENT } from "../config.js";

export type Meta = {
  version: string;
  endpoint: string;
  as_of_block: number | null;
  as_of_ts: number | null;
  indexer_lag_blocks: number | null;
  generated_at: number;
  max_age_s: number;
  sources: Record<string, string>;
};

export type Envelope<T = unknown> = { data: T; meta: Meta };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterS?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Headers to forward from the incoming MCP request to the API (HTTP mode only). */
export type ForwardHeaders = { "x-real-ip"?: string; "x-forwarded-for"?: string };

export class ApiClient {
  constructor(private readonly cfg: Pick<Config, "apiUrl" | "timeoutMs" | "retries">, private readonly forward: ForwardHeaders = {}) {}

  async get<T = unknown>(pathUnderV1: string): Promise<Envelope<T>> {
    const url = `${this.cfg.apiUrl}/api/v1${pathUnderV1}`;
    const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/json" };
    if (this.forward["x-real-ip"]) headers["X-Real-IP"] = this.forward["x-real-ip"];
    if (this.forward["x-forwarded-for"]) headers["X-Forwarded-For"] = this.forward["x-forwarded-for"];

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.cfg.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        const text = await res.text();
        if (!res.ok) {
          let code = `http_${res.status}`, message = text.slice(0, 300);
          try {
            const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
            if (parsed.error) { code = parsed.error.code ?? code; message = parsed.error.message ?? message; }
          } catch { /* not JSON */ }
          const retryAfter = res.headers.get("retry-after");
          const err = new ApiError(res.status, code, message, retryAfter ? Number(retryAfter) : undefined);
          if (res.status >= 500 && attempt < this.cfg.retries) { lastError = err; await sleep(800); continue; }
          throw err;
        }
        return JSON.parse(text) as Envelope<T>;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        const isAbort = err instanceof Error && err.name === "AbortError";
        lastError = isAbort ? new Error(`AntSeedStats API timed out after ${this.cfg.timeoutMs} ms for ${pathUnderV1}`) : (err instanceof Error ? err : new Error(String(err)));
        if (attempt < this.cfg.retries) { await sleep(800); continue; }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error(`Failed to fetch ${pathUnderV1}`);
  }

  /** True when GET /status answers 200 (used by /health). */
  async reachable(timeoutMs = 3_000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.cfg.apiUrl}/api/v1/status`, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
