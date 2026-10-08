// Builds an McpServer with every generated tool registered. Stateless by design: HTTP mode creates one per
// request (carrying that request's client IP for the API's rate limit), stdio mode creates one for the process.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CATALOG } from "./generated/catalog.js";
import { INSTRUCTIONS, type Config } from "./config.js";
import { ApiClient, ApiError, type ForwardHeaders } from "./lib/api-client.js";
import { renderError, renderResult } from "./lib/render.js";
import { buildTools, pageUrl, requestPath, type ToolArgs } from "./tools.js";

export const TOOLS = buildTools(CATALOG);
export const TOOL_COUNT = TOOLS.length;

export function createServer(cfg: Config, forward: ForwardHeaders = {}): McpServer {
  const server = new McpServer({ name: cfg.name, version: cfg.version }, { instructions: INSTRUCTIONS });
  const api = new ApiClient(cfg, forward);

  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.shape,
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
  return server;
}
