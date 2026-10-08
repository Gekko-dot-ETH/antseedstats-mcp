// The stdio transport, as Claude Desktop, Cursor and VS Code spawn it. Runs the TypeScript entry through tsx so
// no build is needed; needs a reachable API (MCP_TEST_API, default prod) or it is skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TOOL_COUNT } from "../src/server.js";

const API = process.env.MCP_TEST_API ?? "https://antseedstats.com";

async function apiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API}/api/v1/status`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

test("stdio: list tools, call a model lookup and a daily series", { skip: !(await apiUp()) && `API ${API} unreachable` }, async () => {
  const client = new Client({ name: "antseedstats-mcp-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    env: { ...process.env, ANTSEEDSTATS_API_URL: API } as Record<string, string>,
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, TOOL_COUNT);

    const model = await client.callTool({ name: "antseedstats_models_detail", arguments: { id: "kimi-k3" } });
    const text = (model.content as { text: string }[])[0].text;
    assert.ok(!model.isError, text);
    const [header, json] = text.split("\n");
    assert.equal(header.split(" · ")[1], "https://antseedstats.com/models/kimi-k3");
    const data = JSON.parse(json) as { model: string; sellers: unknown[] };
    assert.equal(data.model, "kimi-k3");
    assert.ok(data.sellers.length > 0);

    const daily = await client.callTool({ name: "antseedstats_sellers_daily", arguments: { address: "0xd19ffae0e85b5230422019926b2f37ec0f1f41f3", from: "2026-10-01", to: "2026-10-07" } });
    const days = (JSON.parse((daily.content as { text: string }[])[0].text.split("\n")[1]) as { days: { day: string }[] }).days;
    assert.equal(days.length, 7);
    assert.equal(days[0].day, "2026-10-01");
  } finally {
    await client.close().catch(() => undefined);
  }
});
