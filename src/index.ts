#!/usr/bin/env node
// Entry point. `antseedstats-mcp` speaks MCP over stdio (what Claude Desktop, Cursor and VS Code spawn);
// `antseedstats-mcp --http [--port N] [--api URL]` serves stateless Streamable HTTP on /mcp plus /health.
// Logs go to stderr: stdout is the stdio transport.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./http.js";
import { createServer, TOOL_COUNT } from "./server.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cfg = loadConfig(process.env, argv);

  if (argv.includes("--help") || argv.includes("-h")) {
    process.stderr.write(`antseedstats-mcp ${cfg.version}
  (no flags)        MCP over stdio
  --http            Streamable HTTP on /mcp and /health (PORT or --port, default ${cfg.port})
  --api <url>       REST API origin (default ${cfg.apiUrl}); also ANTSEEDSTATS_API_URL
  TRUST_PROXY=1     HTTP mode behind a reverse proxy: trust X-Real-IP / X-Forwarded-For
`);
    return;
  }

  if (argv.includes("--http")) {
    const app = createHttpApp(cfg);
    await new Promise<void>((resolve) => {
      app.listen(cfg.port, "127.0.0.1", () => {
        console.error(`[antseedstats-mcp] ${cfg.version}: ${TOOL_COUNT} tools, HTTP on 127.0.0.1:${cfg.port}/mcp, API ${cfg.apiUrl}`);
        resolve();
      });
    });
    return;
  }

  const server = createServer(cfg);
  await server.connect(new StdioServerTransport());
  console.error(`[antseedstats-mcp] ${cfg.version}: ${TOOL_COUNT} tools on stdio, API ${cfg.apiUrl}`);
}

main().catch((err) => {
  console.error("[antseedstats-mcp] fatal:", err);
  process.exit(1);
});
