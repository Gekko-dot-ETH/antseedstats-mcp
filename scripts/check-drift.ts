// Compares the generated catalogue with the live OpenAPI document of an AntSeedStats instance. Exit 1 when
// an endpoint, an operationId or a parameter differs: that means `npm run sync-catalog` and a release are due.
//
//   npm run check-drift                                   # https://antseedstats.com
//   ANTSEEDSTATS_API_URL=http://127.0.0.1:3199 npm run check-drift
import { CATALOG, SOURCE_COMMIT } from "../src/generated/catalog.js";

const base = (process.env.ANTSEEDSTATS_API_URL ?? "https://antseedstats.com").replace(/\/+$/, "");
const res = await fetch(`${base}/api/v1/openapi.json`, { headers: { "User-Agent": "AntSeedStats-MCP/check-drift" } });
if (!res.ok) { console.error(`openapi.json: HTTP ${res.status}`); process.exit(2); }

type Op = { operationId: string; parameters: { name: string; in: string; required?: boolean }[] };
const doc = (await res.json()) as { info: { version: string }; paths: Record<string, { get: Op }> };

const problems: string[] = [];
const livePaths = new Set(Object.keys(doc.paths));
const ourPaths = new Set(CATALOG.map((e) => e.path));
for (const p of livePaths) if (!ourPaths.has(p)) problems.push(`live has ${p}, generated catalogue does not`);
for (const p of ourPaths) if (!livePaths.has(p)) problems.push(`generated catalogue has ${p}, live does not`);

for (const e of CATALOG) {
  const op = doc.paths[e.path]?.get;
  if (!op) continue;
  if (op.operationId !== e.id) problems.push(`${e.path}: operationId ${op.operationId} vs ${e.id}`);
  const live = op.parameters.map((p) => `${p.in}:${p.name}:${p.required ? "req" : "opt"}`).sort();
  const ours = e.params.map((p) => `${p.in}:${p.name}:${p.required || p.in === "path" ? "req" : "opt"}`).sort();
  if (live.join("|") !== ours.join("|")) problems.push(`${e.path}: params ${live.join(",")} vs ${ours.join(",")}`);
}

if (problems.length) {
  console.error(`DRIFT against ${base} (site ${doc.info.version}; catalogue from antseed-stats@${SOURCE_COMMIT}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`no drift: ${CATALOG.length} endpoints match ${base} (site ${doc.info.version}; catalogue from antseed-stats@${SOURCE_COMMIT})`);
