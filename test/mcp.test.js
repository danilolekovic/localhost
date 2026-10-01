import test from "node:test";
import assert from "node:assert/strict";
import { handleMcpMessage } from "../src/mcp.js";

test("initializes as an MCP server", async () => {
  const reply = await handleMcpMessage({
    jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" },
  });
  assert.equal(reply.result.serverInfo.name, "localhost");
  assert.deepEqual(reply.result.capabilities, { tools: {} });
});

test("supports modern stateless MCP discovery", async () => {
  const reply = await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "server/discover", params: {} });
  assert.equal(reply.result.supportedVersions[0], "2026-07-28");
  assert.equal(reply.result._meta["io.modelcontextprotocol/serverInfo"].name, "localhost");
});

test("counter-offers the latest handshake version to a modern initialize request", async () => {
  const reply = await handleMcpMessage({
    jsonrpc: "2.0", id: 4, method: "initialize", params: { protocolVersion: "2026-07-28" },
  });
  assert.equal(reply.result.protocolVersion, "2025-11-25");
});

test("advertises agent tools", async () => {
  const reply = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(reply.result.tools.map((tool) => tool.name), [
    "list_servers", "inspect_server", "stop_server",
  ]);
  assert.equal(reply.result.tools[2].inputSchema.required.includes("confirm"), true);
});
