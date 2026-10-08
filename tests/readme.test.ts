// The README's tool table and the stated count must match the generated catalogue (the drift VeniceStats paid
// for in eight places).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOG } from "../src/generated/catalog.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("README lists every tool and the right count", () => {
  for (const e of CATALOG) assert.ok(readme.includes(`\`${e.tool}\``), `README is missing ${e.tool}`);
  assert.ok(readme.includes(`## Tools (${CATALOG.length})`), `README heading must say Tools (${CATALOG.length})`);
  const listed = [...readme.matchAll(/`(antseedstats_[a-z0-9_]+)`/g)].map((m) => m[1]);
  const unknown = listed.filter((n) => !CATALOG.some((e) => e.tool === n));
  assert.deepEqual(unknown, [], "README names tools the catalogue does not have");
});
