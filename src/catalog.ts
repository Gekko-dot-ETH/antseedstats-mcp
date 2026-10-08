// Types of the generated catalogue (src/generated/catalog.ts). They mirror the exported shapes of
// antseed-stats/src/lib/api/catalog.ts, trimmed to what the MCP needs. Regenerate with `npm run sync-catalog`;
// never edit the generated file by hand.
export type ParamType = "address" | "int" | "number" | "date" | "enum" | "bool" | "string";

export type ApiParam = {
  name: string;
  in: "path" | "query";
  type: ParamType;
  desc: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: readonly string[];
  min?: number;
  max?: number;
};

export type SourceKind = "chain" | "announce" | "antseedstats";
export type CacheTierName = "none" | "live" | "catalog" | "history";

export type JsonSchema =
  | { type: "object"; properties: Record<string, JsonSchema>; desc?: string }
  | { type: "array"; items: JsonSchema; desc?: string }
  | { type: "number" | "integer" | "string" | "boolean"; desc?: string; nullable?: boolean; enum?: readonly string[] };

export type CatalogEndpoint = {
  id: string;
  /** MCP tool name, computed by the catalogue (`antseedstats_` + id with dots as underscores). */
  tool: string;
  group: string;
  method: "GET";
  path: string;
  summary: string;
  desc: string;
  params: ApiParam[];
  example: string;
  page: string;
  prompt: string;
  cache: CacheTierName;
  sources: Record<string, SourceKind>;
  schema: JsonSchema;
};

/** Fill `{name}` placeholders of a path or page template. */
export function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? ""));
}

/** Top-level field names of a response schema, `name[]` for arrays, for a one-line "Returns" hint. */
export function topLevelFields(schema: JsonSchema): string[] {
  if (schema.type !== "object") return [];
  return Object.entries(schema.properties).map(([k, v]) => (v.type === "array" ? `${k}[]` : k));
}
