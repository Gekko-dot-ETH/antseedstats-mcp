// MCP resources: the site's backstage, navigable from inside the client (docs/AGENT-FRIENDLY-PLAN.md §3.4).
// Each is one GET on the site, cached for five minutes per process. Stateless HTTP mode creates a server per
// request, so the cache lives at module level, not on the server.
export type ResourceDef = {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
  /** Path on the site (same origin as the API). */
  path: string;
};

export const RESOURCES: ResourceDef[] = [
  { name: "llms", uri: "antseedstats://llms.txt", title: "llms.txt", description: "The front door: what AntSeedStats is, the key concepts (settled vs served, organic, epochs, why $ANTS has no price) and every machine-readable link.", mimeType: "text/markdown", path: "/llms.txt" },
  { name: "llms-full", uri: "antseedstats://llms-full.txt", title: "llms-full.txt", description: "The whole backstage in one file: the API reference, the tools, every definition behind the site's tips, the glossary, the FAQ and the changelog (about 270 KB).", mimeType: "text/markdown", path: "/llms-full.txt" },
  { name: "glossary", uri: "antseedstats://glossary", title: "Glossary", description: "Every definition behind the site's info dots as JSON: id, term, page, definition, version.", mimeType: "application/json", path: "/api/v1/glossary" },
  { name: "faq", uri: "antseedstats://faq", title: "FAQ", description: "The site's FAQ as JSON-LD (schema.org FAQPage): what AntSeed, $ANTS, DIEM, points and the views mean.", mimeType: "application/ld+json", path: "/faq" },
  { name: "openapi", uri: "antseedstats://openapi.json", title: "OpenAPI 3.1", description: "Every endpoint, parameter and response field of the public API, with the data licence and the MCP link.", mimeType: "application/json", path: "/api/v1/openapi.json" },
  { name: "changelog", uri: "antseedstats://changelog", title: "Changelog", description: "What changed on the site and the API, newest first, as JSON.", mimeType: "application/json", path: "/api/v1/changelog?limit=20" },
];

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; text: string }>();

/** The FAQ page's JSON-LD block, extracted from its HTML (the FAQ has no bare-JSON twin yet). */
function extractFaqJsonLd(html: string): string {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return blocks.find((b) => b.includes('"FAQPage"')) ?? "{}";
}

export async function readResource(def: ResourceDef, origin: string, userAgent: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = `${origin}${def.path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;
  const res = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: def.mimeType === "text/markdown" ? "text/markdown, text/plain" : "application/json, text/html" } });
  if (!res.ok) throw new Error(`${def.path} answered ${res.status}`);
  let text = await res.text();
  if (def.name === "faq") text = extractFaqJsonLd(text);
  cache.set(url, { at: Date.now(), text });
  return text;
}

export function resetResourceCache(): void {
  cache.clear();
}
