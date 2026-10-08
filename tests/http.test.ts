// End-to-end over Streamable HTTP against a running AntSeedStats API. Set MCP_TEST_API (default
// http://127.0.0.1:3199, the dev box); the live calls are skipped when that API is unreachable so the unit
// tests still pass offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "../src/config.js";
import { clientIp, createHttpApp, RateLimiter } from "../src/http.js";
import { TOOL_COUNT } from "../src/server.js";

const API = process.env.MCP_TEST_API ?? "http://127.0.0.1:3199";

async function apiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/v1/status`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function listen(cfg = loadConfig({ ANTSEEDSTATS_API_URL: API }, [])) {
  const app = createHttpApp(cfg);
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => srv.close() });
    });
  });
}

test("rate limiter: the 61st hit in a minute is limited, unknown IPs fail open", () => {
  const rl = new RateLimiter(60);
  const t0 = 1_000_000;
  for (let i = 0; i < 60; i++) assert.equal(rl.hit("1.2.3.4", t0 + i).limited, false);
  const over = rl.hit("1.2.3.4", t0 + 60);
  assert.equal(over.limited, true);
  assert.ok(over.retryAfterS >= 59 && over.retryAfterS <= 60);
  assert.equal(rl.hit("5.6.7.8", t0 + 61).limited, false, "another IP has its own bucket");
  assert.equal(rl.hit("1.2.3.4", t0 + 60_001).limited, false, "window rolled over");
  assert.equal(rl.hit(null, t0).limited, false);
});

test("clientIp: proxy headers only when trusted", () => {
  const req = { headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "8.8.8.8, 10.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } } as never;
  assert.equal(clientIp(req, true), "9.9.9.9");
  assert.equal(clientIp(req, false), "127.0.0.1");
  const xffOnly = { headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } } as never;
  assert.equal(clientIp(xffOnly, true), "8.8.8.8");
});

test("rate limiter: a batch of 5 costs 5, and a refused batch is not charged", () => {
  const rl = new RateLimiter(10);
  assert.equal(rl.hit("1.1.1.1", 0, 5).limited, false);
  assert.equal(rl.hit("1.1.1.1", 1, 4).limited, false); // 9 used
  assert.equal(rl.hit("1.1.1.1", 2, 5).limited, true, "9 + 5 does not fit");
  assert.equal(rl.hit("1.1.1.1", 3, 1).limited, false, "the refused batch left the single request's slot free");
  assert.equal(rl.hit("1.1.1.1", 4, 1).limited, true, "now full");
});

test("malformed JSON, oversized bodies and oversized batches come back as JSON-RPC errors", async () => {
  const s = await listen();
  try {
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    const bad = await fetch(`${s.url}/mcp`, { method: "POST", headers: h, body: "{not json" });
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as { error: { code: number } }).error.code, -32700);
    const big = await fetch(`${s.url}/mcp`, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(1_100_000) } }) });
    assert.equal(big.status, 413);
    assert.equal(((await big.json()) as { jsonrpc: string }).jsonrpc, "2.0");
    const batch = await fetch(`${s.url}/mcp`, { method: "POST", headers: h, body: JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }))) });
    assert.equal(batch.status, 400);
    assert.match(((await batch.json()) as { error: { message: string } }).error.message, /Batch too large/);
    const charset = await fetch(`${s.url}/mcp`, { method: "POST", headers: { ...h, "content-type": "application/json; charset=x-unknown" }, body: "{}" });
    assert.equal(charset.status, 415);
    assert.equal(((await charset.json()) as { error: { code: number } }).error.code, -32600, "a client-side 4xx keeps its status and is not reported as internal");
  } finally {
    s.close();
  }
});

test("a batch larger than the per-minute budget is refused as 400, not as a retryable 429", async () => {
  const s = await listen(loadConfig({ ANTSEEDSTATS_API_URL: API, MCP_RATE_LIMIT_PER_MIN: "3", TRUST_PROXY: "1" }, []));
  try {
    const h = { "content-type": "application/json", accept: "application/json, text/event-stream", "x-real-ip": "203.0.113.8" };
    const r = await fetch(`${s.url}/mcp`, { method: "POST", headers: h, body: JSON.stringify(Array.from({ length: 4 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }))) });
    assert.equal(r.status, 400);
    assert.match(((await r.json()) as { error: { message: string } }).error.message, /can never be served/);
  } finally {
    s.close();
  }
});

test("/health hits the API once for concurrent probes and keeps a good answer for 30 s", async () => {
  // A stub API that counts /api/v1/status hits stands in for AntSeedStats.
  let hits = 0;
  const stub = createServer((req, res) => {
    if (req.url === "/api/v1/status") { hits++; setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end('{"data":{}}'); }, 150); return; }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  const stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  const s = await listen(loadConfig({ ANTSEEDSTATS_API_URL: stubUrl }, []));
  try {
    const rs = await Promise.all(Array.from({ length: 5 }, () => fetch(`${s.url}/health`)));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(hits, 1, "five concurrent probes share one in-flight API check");
    await fetch(`${s.url}/health`);
    assert.equal(hits, 1, "and a later probe inside the TTL reuses it");
  } finally {
    s.close();
    stub.close();
  }
});

test("GET and DELETE /mcp answer 405 as JSON-RPC errors", async () => {
  const s = await listen();
  try {
    const get = await fetch(`${s.url}/mcp`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    const body = (await get.json()) as { jsonrpc: string; error: { code: number } };
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.error.code, -32000);
    const del = await fetch(`${s.url}/mcp`, { method: "DELETE" });
    assert.equal(del.status, 405);
  } finally {
    s.close();
  }
});

test("over the MCP budget, POST /mcp is 429 with Retry-After", async () => {
  const s = await listen(loadConfig({ ANTSEEDSTATS_API_URL: API, MCP_RATE_LIMIT_PER_MIN: "2", TRUST_PROXY: "1" }, []));
  try {
    const post = () => fetch(`${s.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-real-ip": "203.0.113.7" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
    const r1 = await post(), r2 = await post(), r3 = await post();
    assert.notEqual(r1.status, 429);
    assert.notEqual(r2.status, 429);
    assert.equal(r3.status, 429);
    assert.ok(Number(r3.headers.get("retry-after")) >= 1);
  } finally {
    s.close();
  }
});

test("MCP client: initialize, list every tool, call network summary (needs the API)", { skip: !(await apiUp()) && `API ${API} unreachable` }, async () => {
  const s = await listen();
  const client = new Client({ name: "antseedstats-mcp-test", version: "0.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
    const { tools } = await client.listTools();
    assert.equal(tools.length, TOOL_COUNT);
    const summary = tools.find((t) => t.name === "antseedstats_network_summary");
    assert.ok(summary && summary.annotations?.readOnlyHint === true);

    const res = await client.callTool({ name: "antseedstats_network_summary", arguments: {} });
    const text = (res.content as { type: string; text: string }[])[0].text;
    assert.ok(!res.isError, text);
    const [header, json] = text.split("\n");
    assert.ok(header.startsWith("AntSeedStats · https://antseedstats.com/ · as of Base block "));
    const data = JSON.parse(json) as { lifetime: { settled_micro: number }; epoch: { number: number } };
    assert.ok(data.lifetime.settled_micro > 0);
    assert.ok(data.epoch.number >= 25);

    const bad = await client.callTool({ name: "antseedstats_sellers_detail", arguments: { address: "0x0000000000000000000000000000000000000001" } });
    assert.equal(bad.isError, true, "unknown seller comes back as a tool error, not an exception");

    const sellers = await client.callTool({ name: "antseedstats_sellers", arguments: { limit: 3, view: "organic" } });
    const rows = JSON.parse((sellers.content as { text: string }[])[0].text.split("\n")[1]) as { sellers: unknown[] };
    assert.equal(rows.sellers.length, 3);
  } finally {
    await client.close().catch(() => undefined);
    s.close();
  }
});
