import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CATALOG } from "../src/generated/catalog.js";
import { buildTools, inputShape, MCP_DEFAULT_LIMIT, MCP_MAX_LIMIT, pageUrl, requestPath } from "../src/tools.js";

const byId = (id: string) => CATALOG.find((e) => e.id === id)!;

test("one tool per catalogue endpoint, names unique and prefixed", () => {
  const tools = buildTools(CATALOG);
  assert.equal(tools.length, CATALOG.length);
  assert.ok(tools.length >= 14);
  const names = tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of tools) {
    assert.match(t.name, /^antseedstats_[a-z0-9_]+$/);
    assert.ok(t.description.includes("antseedstats.com"), `${t.name}: description must carry the attribution`);
    assert.ok(t.description.includes("Sources:"), `${t.name}: description must label the sources`);
  }
});

test("input schema: address and day validated, limit capped at the MCP ceiling, format not offered", () => {
  const sellers = z.object(inputShape(byId("sellers")));
  assert.ok(sellers.safeParse({}).success, "every param optional on the list endpoint");
  assert.ok(sellers.safeParse({ limit: MCP_MAX_LIMIT }).success);
  assert.ok(!sellers.safeParse({ limit: MCP_MAX_LIMIT + 1 }).success, "limit above the MCP ceiling rejected");
  assert.ok(!sellers.safeParse({ sort: "nope" }).success, "unknown enum rejected");
  assert.ok(!("format" in inputShape(byId("network.daily"))), "format is not a tool parameter");

  const detail = z.object(inputShape(byId("sellers.detail")));
  assert.ok(!detail.safeParse({}).success, "path param required");
  assert.ok(!detail.safeParse({ address: "0x12" }).success);
  assert.ok(detail.safeParse({ address: "0xD19FFAE0E85B5230422019926B2F37EC0F1F41F3" }).success, "any case accepted");

  const daily = z.object(inputShape(byId("network.daily")));
  assert.ok(!daily.safeParse({ from: "2026/09/30" }).success);
  assert.ok(daily.safeParse({ from: "2026-09-30", to: "2026-10-06" }).success);
});

test("request path: placeholders filled, MCP default limit applied, undefined args dropped", () => {
  assert.equal(requestPath(byId("sellers.detail"), { address: "0xabc" }), "/sellers/0xabc");
  assert.equal(requestPath(byId("sellers"), {}), `/sellers?limit=${MCP_DEFAULT_LIMIT}`);
  assert.equal(requestPath(byId("sellers"), { sort: "revenue", view: "organic", limit: 5 }), "/sellers?sort=revenue&view=organic&limit=5");
  assert.equal(requestPath(byId("network.daily"), { from: "2026-09-30" }), "/network/daily?from=2026-09-30");
  assert.equal(requestPath(byId("models.detail"), { id: "openai/gpt" }), "/models/openai%2Fgpt");
  assert.equal(requestPath(byId("network.summary"), {}), "/network/summary");
});

test("page url: the site page with path params filled", () => {
  assert.equal(pageUrl(byId("sellers.detail"), { address: "0xabc" }), "https://antseedstats.com/sellers/0xabc");
  assert.equal(pageUrl(byId("network.summary"), {}), "https://antseedstats.com/");
  assert.equal(pageUrl(byId("epochs.detail"), { n: 25 }), "https://antseedstats.com/rewards");
});
