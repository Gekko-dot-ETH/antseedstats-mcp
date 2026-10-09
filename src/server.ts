// Builds an McpServer with every generated tool, the backstage resources and the recipe prompts registered.
// Stateless by design: HTTP mode creates one per request (carrying that request's client IP for the API's rate
// limit), stdio mode creates one for the process.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CATALOG } from "./generated/catalog.js";
import { INSTRUCTIONS, USER_AGENT, type Config } from "./config.js";
import { ApiClient, ApiError, type ForwardHeaders } from "./lib/api-client.js";
import { renderError, renderResult } from "./lib/render.js";
import { outputShape } from "./lib/schema.js";
import { RESOURCES, readResource } from "./lib/resources.js";
import { PROMPTS } from "./lib/prompts.js";
import { buildTools, pageUrl, requestPath, type ToolArgs } from "./tools.js";
import { ASK_TOOL, askPaid } from "./lib/ask.js";

export const TOOLS = buildTools(CATALOG);
// The catalogue tools plus antseedstats_ask (the paid question endpoint, outside the catalogue).
export const TOOL_COUNT = TOOLS.length + 1;
export const RESOURCE_COUNT = RESOURCES.length;
export const PROMPT_COUNT = PROMPTS.length;

export function createServer(cfg: Config, forward: ForwardHeaders = {}, hosted = false): McpServer {
  const server = new McpServer({ name: cfg.name, version: cfg.version }, { instructions: INSTRUCTIONS });
  const api = new ApiClient(cfg, forward);

  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.shape,
        outputSchema: outputShape(t.endpoint.schema),
        annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args: ToolArgs) => {
        try {
          const env = await api.get(requestPath(t.endpoint, args));
          return renderResult(t.endpoint, env, pageUrl(t.endpoint, args, cfg.siteUrl));
        } catch (err) {
          if (err instanceof ApiError) {
            const retry = err.status === 429 && err.retryAfterS ? ` Retry in ${err.retryAfterS} s.` : "";
            return renderError(`${err.message} (${err.code}).${retry}`);
          }
          return renderError(err instanceof Error ? err.message : String(err));
        }
      },
    );
  }

  server.registerTool(
    ASK_TOOL,
    {
      title: "Ask AntSeedStats (paid)",
      description: "Ask any question about AntSeed in plain language and get one answer with sources, computed from this site's data. PAID: $0.03 in USDC on Base per answer via x402, signed with X402_PRIVATE_KEY from this server's env (local stdio only; never on the hosted server). Without a key it explains how to enable it. Prefer the free tools when one of them answers the question directly.",
      inputSchema: { question: z.string().min(1).max(500).describe("The question, in plain language (up to 500 characters)") },
      annotations: { title: "Ask AntSeedStats (paid)", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ question }: { question: string }) => {
      try {
        const r = await askPaid(cfg, question, hosted);
        return { content: [{ type: "text" as const, text: r.text }], isError: !r.ok };
      } catch (err) {
        return renderError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  for (const r of RESOURCES) {
    server.registerResource(r.name, r.uri, { title: r.title, description: r.description, mimeType: r.mimeType }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: r.mimeType, text: await readResource(r, cfg.apiUrl, USER_AGENT) }],
    }));
  }

  for (const p of PROMPTS) {
    const argsSchema = Object.fromEntries(p.args.map((a) => [a.name, a.required ? z.string().describe(a.description) : z.string().optional().describe(a.description)]));
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema }, (args) => ({
      description: p.description,
      messages: [{ role: "user", content: { type: "text", text: p.build(args as Record<string, string | undefined>) } }],
    }));
  }

  return server;
}
