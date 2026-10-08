// One MCP tool per catalogue endpoint. Nothing here is written per endpoint: the input schema comes from the
// catalogue's params, the description from its summary, desc and sources, and the request path from its path
// template. Two deliberate differences from the REST API: `limit` defaults to 20 and caps at 100 (an LLM
// context is not a spreadsheet), and `format` is not offered (always JSON).
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { fillPlaceholders, topLevelFields, type ApiParam, type CatalogEndpoint } from "./catalog.js";
import { SITE_URL } from "./config.js";

export const MCP_DEFAULT_LIMIT = 20;
export const MCP_MAX_LIMIT = 100;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  shape: ZodRawShape;
  endpoint: CatalogEndpoint;
};

export type ToolArgs = Record<string, string | number | boolean | undefined>;

// Many MCP clients and models send numbers and booleans as strings ("limit": "10", "free": "true"); the REST
// API accepts those, so the tools do too. Only exact spellings are converted; anything else fails validation.
const intFromString = (v: unknown) => (typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v);
const boolFromString = (v: unknown) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" ? true : s === "false" || s === "0" ? false : v;
};

/** Zod validator for one catalogue parameter (without optionality). */
export function zodFor(p: ApiParam): ZodTypeAny {
  switch (p.type) {
    case "address": return z.string().regex(ADDRESS_RE, "a 0x address with 40 hex characters").describe(p.desc);
    case "date": return z.string().regex(DAY_RE, "a UTC day, YYYY-MM-DD").describe(p.desc);
    case "int": {
      const isLimit = p.name === "limit";
      const min = p.min ?? 0;
      const max = isLimit ? MCP_MAX_LIMIT : (p.max ?? Number.MAX_SAFE_INTEGER);
      const desc = isLimit ? `Rows to return (1 to ${MCP_MAX_LIMIT}; default ${MCP_DEFAULT_LIMIT})` : p.desc;
      return z.preprocess(intFromString, z.number().int().min(min).max(max)).describe(desc);
    }
    case "enum": return z.enum([...(p.enum ?? [])] as [string, ...string[]]).describe(p.desc);
    case "bool": return z.preprocess(boolFromString, z.boolean()).describe(p.desc);
    case "string": return z.string().min(1).max(200).describe(p.desc);
  }
}

/** Which catalogue params the tool exposes: everything but `format`. */
export function exposedParams(e: CatalogEndpoint): ApiParam[] {
  return e.params.filter((p) => p.name !== "format");
}

export function inputShape(e: CatalogEndpoint): ZodRawShape {
  const shape: ZodRawShape = {};
  for (const p of exposedParams(e)) {
    const base = zodFor(p);
    shape[p.name] = p.required ? base : base.optional();
  }
  return shape;
}

function describe(e: CatalogEndpoint): string {
  const sources = Object.entries(e.sources).map(([k, v]) => `${k}=${v}`).join(", ");
  const params = exposedParams(e);
  const paramLine = params.length
    ? `Parameters: ${params.map((p) => `${p.name}${p.required ? "" : "?"}${p.default !== undefined && p.name !== "limit" ? ` (default ${String(p.default)})` : ""}`).join(", ")}.`
    : "No parameters.";
  const fields = topLevelFields(e.schema);
  return [
    `${e.summary}. ${e.desc}`,
    paramLine,
    fields.length ? `Returns: ${fields.join(", ")}.` : "",
    `Sources: ${sources} (chain = on-chain fact, announce = seller's own claim, antseedstats = our judgement).`,
    `Same data on ${SITE_URL}${e.page.replace(/\{\w+\}/g, "...")}. Attribute the figures to AntSeedStats and cite that page.`,
  ].filter(Boolean).join(" ");
}

export function buildTools(catalog: CatalogEndpoint[]): ToolDef[] {
  return catalog.map((e) => ({ name: e.tool, title: e.summary, description: describe(e), shape: inputShape(e), endpoint: e }));
}

/** Request path under /api/v1 for a tool call, with the MCP's own `limit` default applied. */
export function requestPath(e: CatalogEndpoint, args: ToolArgs): string {
  const pathValues: Record<string, string> = {};
  const query = new URLSearchParams();
  for (const p of exposedParams(e)) {
    const v = args[p.name];
    if (p.in === "path") {
      pathValues[p.name] = String(v ?? "");
      continue;
    }
    if (v !== undefined) query.set(p.name, String(v));
    else if (p.name === "limit") query.set("limit", String(MCP_DEFAULT_LIMIT));
  }
  const qs = query.toString();
  return fillPlaceholders(e.path, pathValues) + (qs ? `?${qs}` : "");
}

/** Deep link for a call: the catalogue page with the path params filled in. */
export function pageUrl(e: CatalogEndpoint, args: ToolArgs, siteUrl = SITE_URL): string {
  const values: Record<string, string> = {};
  for (const p of e.params) if (p.in === "path") values[p.name] = String(args[p.name] ?? "");
  return siteUrl + fillPlaceholders(e.page, values);
}
