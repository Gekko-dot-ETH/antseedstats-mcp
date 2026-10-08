import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "../src/generated/catalog.js";
import { PROMPTS, toolsNamedIn } from "../src/lib/prompts.js";
import { RESOURCES, readResource, resetResourceCache } from "../src/lib/resources.js";

test("every tool a prompt names exists in the catalogue, and every prompt names at least two", () => {
  const tools = new Set(CATALOG.map((e) => e.tool));
  for (const p of PROMPTS) {
    const named = toolsNamedIn(p);
    assert.ok(named.length >= 2, p.name);
    for (const t of named) assert.ok(tools.has(t), `${p.name} names unknown tool ${t}`);
    assert.ok(!/—/.test(p.build({})), `${p.name}: no em dashes`);
  }
  assert.equal(new Set(PROMPTS.map((p) => p.name)).size, PROMPTS.length);
});

test("resources: unique antseedstats:// URIs, one GET each, cached for the process, FAQ JSON-LD extracted from the page", async () => {
  assert.equal(new Set(RESOURCES.map((r) => r.uri)).size, RESOURCES.length);
  for (const r of RESOURCES) assert.match(r.uri, /^antseedstats:\/\//);
  resetResourceCache();
  let calls = 0;
  const fake: typeof fetch = async (url) => {
    calls++;
    const u = String(url);
    const body = u.endsWith("/faq") ? '<html><script type="application/ld+json">{"@type":"WebApplication"}</script><script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script></html>' : "# AntSeedStats";
    return new Response(body, { status: 200 });
  };
  const llms = RESOURCES.find((r) => r.name === "llms")!, faq = RESOURCES.find((r) => r.name === "faq")!;
  assert.equal(await readResource(llms, "https://x", "ua", fake), "# AntSeedStats");
  assert.equal(await readResource(llms, "https://x", "ua", fake), "# AntSeedStats");
  assert.equal(calls, 1, "second read served from cache");
  assert.equal(JSON.parse(await readResource(faq, "https://x", "ua", fake))["@type"], "FAQPage");
  await assert.rejects(readResource(RESOURCES[4], "https://x", "ua", async () => new Response("", { status: 503 })));
});
