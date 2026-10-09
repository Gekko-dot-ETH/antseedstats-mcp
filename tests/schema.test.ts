import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CATALOG } from "../src/generated/catalog.js";
import { outputShape, zodOutput } from "../src/lib/schema.js";
import { renderResult } from "../src/lib/render.js";

const byId = (id: string) => CATALOG.find((e) => e.id === id)!;
const META = { version: "v1", endpoint: "x", as_of_block: 1, as_of_ts: 2, indexer_lag_blocks: 0, generated_at: 3, max_age_s: 45, sources: { a: "chain" }, docs: { endpoint: "e", page: "p", glossary: "g" } };

test("the dialect converts: nullable scalars, enums, nested arrays, extra keys allowed", () => {
  const s = zodOutput({ type: "object", properties: { a: { type: "integer", nullable: true }, b: { type: "string", enum: ["x", "y"] }, c: { type: "array", items: { type: "object", properties: { d: { type: "boolean" } } } } } });
  assert.ok(s.safeParse({ a: null, b: "x", c: [{ d: true, extra: 1 }] }).success);
  assert.ok(!s.safeParse({ a: 1.5, b: "x", c: [] }).success, "integer rejects a fraction");
  assert.ok(!s.safeParse({ a: 1, b: "z", c: [] }).success, "enum enforced");
  assert.ok(s.safeParse(null).success, "an object may be null (the API returns null for an absent sub-object)");
});

test("every tool's outputSchema accepts a real-shaped envelope and the structuredContent renderResult emits", () => {
  const e = byId("network.summary");
  const data = { lifetime: { settled_micro: 1, settled_usd: "0.00", fees_micro: 0, fees_usd: "0.00", settles: 1, buyers: 1, sellers: 1, tokens_in: 1, tokens_out: 1, requests: 1 }, windows: { "24h": { settled_micro: 0, settled_usd: "0.00", settles: 0, buyers: 0, sellers: 0 }, "7d": { settled_micro: 0, settled_usd: "0.00", settles: 0, buyers: 0, sellers: 0 }, "30d": { settled_micro: 0, settled_usd: "0.00", settles: 0, buyers: 0, sellers: 0 } }, paid_usage_24h: { requests: 0, tokens: 0, images: 0, video_seconds: 0, videos: 0, free_requests: 0, free_tokens: 0, models: 0, coverage: 0 }, generative_7d: { images: 274, videos: 57, video_seconds: 245, spend_micro: 34566313, spend_usd: "34.57" }, epoch: { number: 26, starts_ts: 1, ends_ts: 2, seconds_left: 1, next_epoch_ts: 2 } };
  const out = z.object(outputShape(e.schema));
  const result = renderResult(e, { data, meta: META }, "https://antseedstats.com/");
  assert.ok(out.safeParse(result.structuredContent).success);
  assert.equal(result.content[0].type, "text");
  for (const ep of CATALOG) assert.ok(z.object(outputShape(ep.schema)).safeParse({ data: null, meta: META }).success, `${ep.id}: schema must build and accept a null data`);
});
