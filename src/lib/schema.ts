// The catalogue's small JSON-schema dialect (lib/api/catalog.ts in antseed-stats) as zod, so every tool can declare
// an `outputSchema` and the SDK validates `structuredContent` against it. `nullable: true` becomes `.nullable()`:
// real responses carry nulls (no settle yet, no list price) and a schema that forgot them would reject the data.
// Unknown keys are allowed (`passthrough`): the API adds fields, it never removes them (its versioning rule).
import { z, type ZodTypeAny } from "zod";
import type { JsonSchema } from "../catalog.js";

export function zodOutput(s: JsonSchema): ZodTypeAny {
  let t: ZodTypeAny;
  switch (s.type) {
    case "object": t = z.object(Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, zodOutput(v)]))).passthrough(); break;
    case "array": t = z.array(zodOutput(s.items)); break;
    case "integer": t = z.number().int(); break;
    case "number": t = z.number(); break;
    case "boolean": t = z.boolean(); break;
    case "string": t = s.enum ? z.enum([...s.enum] as [string, ...string[]]) : z.string(); break;
  }
  // Objects the API can return as null (e.g. estimate.list, leaders.seller) are declared without `nullable` in the
  // dialect, so every object and the explicitly nullable scalars accept null.
  if (s.type === "object" || ("nullable" in s && s.nullable)) t = t.nullable();
  if (s.desc) t = t.describe(s.desc);
  return t;
}

/** The envelope's meta, as the API documents it (components.schemas.Meta in openapi.json). */
export const META_SCHEMA = z.object({
  version: z.string(),
  endpoint: z.string(),
  as_of_block: z.number().int().nullable(),
  as_of_ts: z.number().int().nullable(),
  indexer_lag_blocks: z.number().int().nullable(),
  generated_at: z.number().int(),
  max_age_s: z.number().int(),
  sources: z.record(z.string()),
  docs: z.object({ endpoint: z.string(), page: z.string(), glossary: z.string() }).optional(),
}).passthrough();

/** The raw shape `registerTool` takes as `outputSchema`: { data, meta }. */
export function outputShape(schema: JsonSchema) {
  return { data: zodOutput(schema), meta: META_SCHEMA };
}
