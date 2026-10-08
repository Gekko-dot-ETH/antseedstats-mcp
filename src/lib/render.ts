// How a tool result reads. Line 1 is provenance (page on the site, Base block, lag, sources); then the API's
// `data` as compact JSON (the field names and units are documented in the tool description and on
// antseedstats.com/developers); then one line of attribution. Claude Desktop ignores server instructions, so
// the attribution has to travel with every result.
import type { Envelope } from "./api-client.js";
import type { CatalogEndpoint } from "../catalog.js";

export const FOOTER = "Source: AntSeedStats (antseedstats.com), compiled from Base chain data. Cite the page above. Not financial advice; verify critical figures on-chain.";

export function headerLine(e: CatalogEndpoint, env: Envelope, page: string): string {
  const m = env.meta;
  const asOf = m.as_of_block !== null
    ? `as of Base block ${m.as_of_block}${m.indexer_lag_blocks !== null ? ` (${m.indexer_lag_blocks} behind head)` : ""}${m.as_of_ts ? `, ${new Date(m.as_of_ts * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")}` : ""}`
    : "block unknown";
  const sources = Object.entries(m.sources ?? e.sources).map(([k, v]) => `${k}=${v}`).join(", ");
  return `AntSeedStats · ${page} · ${asOf} · sources: ${sources}`;
}

export function renderResult(e: CatalogEndpoint, env: Envelope, page: string): { content: { type: "text"; text: string }[] } {
  const text = [headerLine(e, env, page), JSON.stringify(env.data), FOOTER].join("\n");
  return { content: [{ type: "text", text }] };
}

export function renderError(message: string): { content: { type: "text"; text: string }[]; isError: true } {
  return { content: [{ type: "text", text: `AntSeedStats error: ${message}` }], isError: true };
}
