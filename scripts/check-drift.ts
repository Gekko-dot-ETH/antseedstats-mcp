// Compares the generated catalogue with the live OpenAPI document of an AntSeedStats instance. Exit 1 when
// an endpoint, an operationId or a parameter differs: that means `npm run sync-catalog` and a release are due.
//
//   npm run check-drift                                   # https://antseedstats.com
//   ANTSEEDSTATS_API_URL=http://127.0.0.1:3199 npm run check-drift
import { CATALOG, SOURCE_COMMIT } from "../src/generated/catalog.js";
import type { CatalogEndpoint } from "../src/catalog.js";

const base = (process.env.ANTSEEDSTATS_API_URL ?? "https://antseedstats.com").replace(/\/+$/, "");
const res = await fetch(`${base}/api/v1/openapi.json`, { headers: { "User-Agent": "AntSeedStats-MCP/check-drift" } });
if (!res.ok) { console.error(`openapi.json: HTTP ${res.status}`); process.exit(2); }

type OaParam = { name: string; in: string; required?: boolean; schema: Record<string, unknown> };
type Op = { operationId: string; parameters: OaParam[] };
const doc = (await res.json()) as { info: { version: string }; paths: Record<string, { get: Op }> };

// The parameter schema the API's openapi.ts emits for a catalogue param (mirrored here on purpose: this script
// exists to notice when the two sides stop agreeing, types, enums and bounds included).
function expectedSchema(p: CatalogEndpoint["params"][number]): Record<string, unknown> {
  switch (p.type) {
    case "address": return { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
    case "date": return { type: "string", format: "date" };
    case "int": return { type: "integer", ...(p.min !== undefined ? { minimum: p.min } : {}), ...(p.max !== undefined ? { maximum: p.max } : {}), ...(p.default !== undefined ? { default: p.default } : {}) };
    case "number": return { type: "number", ...(p.min !== undefined ? { minimum: p.min } : {}), ...(p.max !== undefined ? { maximum: p.max } : {}), ...(p.default !== undefined ? { default: p.default } : {}) };
    case "enum": return { type: "string", enum: [...(p.enum ?? [])], ...(p.default !== undefined ? { default: p.default } : {}) };
    case "bool": return { type: "boolean" };
    case "string": return { type: "string", maxLength: 200 };
  }
}
const canon = (o: unknown): string => JSON.stringify(o, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort()) : v));

const problems: string[] = [];
const livePaths = new Set(Object.keys(doc.paths));
const ourPaths = new Set(CATALOG.map((e) => e.path));
for (const p of livePaths) if (!ourPaths.has(p)) problems.push(`live has ${p}, generated catalogue does not`);
for (const p of ourPaths) if (!livePaths.has(p)) problems.push(`generated catalogue has ${p}, live does not`);

for (const e of CATALOG) {
  const op = doc.paths[e.path]?.get;
  if (!op) continue;
  if (op.operationId !== e.id) problems.push(`${e.path}: operationId ${op.operationId} vs ${e.id}`);
  const expectedTool = "antseedstats_" + e.id.replace(/\./g, "_");
  if (e.tool !== expectedTool) problems.push(`${e.path}: tool name ${e.tool} vs ${expectedTool}`);
  const live = new Map(op.parameters.map((p) => [`${p.in}:${p.name}`, p]));
  const ours = new Map(e.params.map((p) => [`${p.in}:${p.name}`, p]));
  for (const k of live.keys()) if (!ours.has(k)) problems.push(`${e.path}: live has param ${k}, catalogue does not`);
  for (const [k, p] of ours) {
    const l = live.get(k);
    if (!l) { problems.push(`${e.path}: catalogue has param ${k}, live does not`); continue; }
    const req = !!p.required || p.in === "path";
    if (!!l.required !== req) problems.push(`${e.path}: ${k} required ${l.required} vs ${req}`);
    if (canon(l.schema) !== canon(expectedSchema(p))) problems.push(`${e.path}: ${k} schema ${canon(l.schema)} vs ${canon(expectedSchema(p))}`);
  }
}

if (problems.length) {
  console.error(`DRIFT against ${base} (site ${doc.info.version}; catalogue from antseed-stats@${SOURCE_COMMIT}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`no drift: ${CATALOG.length} endpoints match ${base} (site ${doc.info.version}; catalogue from antseed-stats@${SOURCE_COMMIT})`);
