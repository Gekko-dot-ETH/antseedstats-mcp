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
    // The dialect has no union: a string the catalogue describes as "(number or text)" (the model checks' reference
    // and answer, e.g. 24 or "Paris") also takes a number, or the SDK would reject real check results.
    case "string": t = s.enum ? z.enum([...s.enum] as [string, ...string[]]) : /\(number or text\)/.test(s.desc ?? "") ? z.union([z.string(), z.number()]) : z.string(); break;
  }
  // Objects the API can return as null (e.g. estimate.list, leaders.seller) were declared without `nullable` in the
  // dialect before it gained the flag, so every object still accepts null; arrays and scalars only when declared.
  // A field declared nullable may also be absent: some only appear on request (models.detail seller_share[].days
  // needs seller_days=true), and the SDK rejects structuredContent with a missing required key.
  if (s.nullable) t = t.nullish();
  else if (s.type === "object") t = t.nullable();
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
