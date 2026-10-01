import { discoverServers, findServer } from "./discovery.js";
import { stopServer } from "./actions.js";

const tools = [
  {
    name: "list_servers",
    description: "List TCP servers currently listening on the developer's machine, including ports, projects, frameworks, and git branches.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
  },
  {
    name: "inspect_server",
    description: "Inspect a listening server by TCP port or process ID.",
    inputSchema: {
      type: "object",
      properties: { target: { type: ["string", "number"], description: "A TCP port or process ID" } },
      required: ["target"], additionalProperties: false,
    },
    outputSchema: { type: "object" },
  },
  {
    name: "stop_server",
    description: "Stop a verified listening server. Requires confirm=true because this terminates a local process.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: ["string", "number"], description: "A TCP port or process ID" },
        confirm: { type: "boolean", description: "Must be true to confirm process termination" },
        force: { type: "boolean", default: false, description: "Use SIGKILL instead of SIGTERM" },
      },
      required: ["target", "confirm"], additionalProperties: false,
    },
    outputSchema: { type: "object" },
  },
];

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSION = "2025-11-25";
const SERVER_INFO = { name: "localhost", version: "0.1.0" };

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function textResult(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isError ? {} : { structuredContent: value }),
    isError,
  };
}

function modernResponse(message, result) {
  const modern = message.method === "server/discover"
    || message.params?._meta?.["io.modelcontextprotocol/protocolVersion"] === MODERN_VERSION;
  if (!modern) return response(message.id, result);
  return response(message.id, {
    ...result,
    _meta: {
      ...result?._meta,
      "io.modelcontextprotocol/serverInfo": SERVER_INFO,
    },
  });
}

export async function handleMcpMessage(message) {
  const { id, method, params = {} } = message;
  if (method === "server/discover") {
    return modernResponse(message, {
      supportedVersions: [MODERN_VERSION, LEGACY_VERSION],
      capabilities: { tools: {} },
      instructions: "Discover and inspect local development servers. Stop a process only after explicit user confirmation.",
      ttlMs: 60_000,
      cacheScope: "private",
    });
  }
  if (method === "initialize") {
    const requested = params.protocolVersion;
    const protocolVersion = requested && requested !== MODERN_VERSION ? requested : LEGACY_VERSION;
    return response(id, {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return modernResponse(message, {});
  if (method === "tools/list") return modernResponse(message, { tools });
  if (method === "tools/call") {
    const args = params.arguments ?? {};
    try {
      if (params.name === "list_servers") {
        const servers = await discoverServers();
        return modernResponse(message, textResult({ servers, count: servers.length }));
      }
      if (params.name === "inspect_server") {
        const server = findServer(await discoverServers(), args.target);
        return modernResponse(message, textResult(server));
      }
      if (params.name === "stop_server") {
        if (args.confirm !== true) {
          return modernResponse(message, textResult({ error: "Set confirm=true to stop the process." }, true));
        }
        return modernResponse(message, textResult(await stopServer(args.target, { force: args.force === true })));
      }
      return errorResponse(id, -32601, `Unknown tool: ${params.name}`);
    } catch (error) {
      return modernResponse(message, textResult({ error: error.message, code: error.code ?? "LOCALHOST_ERROR" }, true));
    }
  }
  return errorResponse(id, -32601, `Method not found: ${method}`);
}

function writeMessage(message, framing = "newline") {
  const body = JSON.stringify(message);
  if (framing === "content-length") {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  } else {
    process.stdout.write(`${body}\n`);
  }
}

export async function runMcpServer() {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      // Modern MCP stdio uses one JSON-RPC message per line. Content-Length
      // framing is also accepted for compatibility with older clients.
      if (!buffer.toString("utf8", 0, Math.min(buffer.length, 15)).startsWith("Content-Length:")) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const body = buffer.subarray(0, newline).toString("utf8").trim();
        buffer = buffer.subarray(newline + 1);
        if (!body) continue;
        try {
          const result = await handleMcpMessage(JSON.parse(body));
          if (result) writeMessage(result, "newline");
        } catch (error) {
          writeMessage(errorResponse(null, -32700, error.message), "newline");
        }
        continue;
      }
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator === -1) break;
      const header = buffer.subarray(0, separator).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.subarray(separator + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = separator + 4;
      if (buffer.length < bodyStart + length) break;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);
      try {
        const result = await handleMcpMessage(JSON.parse(body));
        if (result) writeMessage(result, "content-length");
      } catch (error) {
        writeMessage(errorResponse(null, -32700, error.message), "content-length");
      }
    }
  });
  process.stdin.resume();
}
