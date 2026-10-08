import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG } from "../src/generated/catalog.js";
import { FOOTER, headerLine, renderError, renderResult } from "../src/lib/render.js";
import type { Envelope } from "../src/lib/api-client.js";

const e = CATALOG.find((x) => x.id === "sellers")!;
const env: Envelope = {
  data: { total: 1, sellers: [{ address: "0xabc" }] },
  meta: { version: "v1", endpoint: "sellers", as_of_block: 52301234, as_of_ts: 1791400000, indexer_lag_blocks: 3, generated_at: 1791400010, max_age_s: 300, sources: { figures: "chain", organic: "antseedstats" } },
};

test("header carries the page, the block, the lag and the sources", () => {
  const h = headerLine(e, env, "https://antseedstats.com/sellers");
  assert.ok(h.startsWith("AntSeedStats · https://antseedstats.com/sellers · as of Base block 52301234 (3 behind head), 2026-10-07T"));
  assert.ok(h.endsWith("sources: figures=chain, organic=antseedstats"));
});

test("result is header, compact JSON data, footer; block unknown when the API has none", () => {
  const r = renderResult(e, env, "https://antseedstats.com/sellers");
  const lines = r.content[0].text.split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(JSON.parse(lines[1]), env.data);
  assert.equal(lines[2], FOOTER);
  const noBlock = renderResult(e, { ...env, meta: { ...env.meta, as_of_block: null, as_of_ts: null, indexer_lag_blocks: null } }, "x");
  assert.ok(noBlock.content[0].text.includes("block unknown"));
});

test("errors are flagged and prefixed", () => {
  const r = renderError("sellers/0x12: address must be a 0x address (bad_request).");
  assert.equal(r.isError, true);
  assert.ok(r.content[0].text.startsWith("AntSeedStats error: "));
});
