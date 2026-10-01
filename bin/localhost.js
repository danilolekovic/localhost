#!/usr/bin/env node

import { discoverServers, findServer } from "../src/discovery.js";
import { formatDetails, formatTable } from "../src/format.js";
import { runMcpServer } from "../src/mcp.js";
import { openServer, stopServer } from "../src/actions.js";

const VERSION = "0.1.0";

function parseArgs(argv) {
  const positional = [];
  const flags = new Set();
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg);
    else positional.push(arg);
  }
  return { positional, flags };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  return `localhost ${VERSION} — your local development cockpit

Usage:
  localhost                         List listening development servers
  localhost list [--json] [--all]   List servers as a table or stable JSON
  localhost inspect <pid|port>      Show one server in detail
  localhost open <pid|port>         Open a server in the default browser
  localhost stop <pid|port>         Gracefully stop a server
  localhost stop <pid|port> --force Send SIGKILL instead of SIGTERM
  localhost watch [seconds]         Refresh the terminal dashboard
  localhost mcp                     Run the MCP server over stdio

Agent usage:
  localhost list --json
  localhost inspect 3000 --json
  localhost mcp

Targets can be a PID, a port, or :port. Destructive actions only operate on
processes that are still listening when the action is performed.`;
}

async function list(json = false, includeSystem = false) {
  const servers = await discoverServers({ includeSystem });
  if (json) printJson({ servers, count: servers.length });
  else process.stdout.write(`${formatTable(servers)}\n`);
}

async function inspect(target, json = false) {
  const servers = await discoverServers();
  const server = findServer(servers, target);
  if (json) printJson(server);
  else process.stdout.write(`${formatDetails(server)}\n`);
}

async function watch(secondsArg) {
  const seconds = Number(secondsArg ?? 2);
  if (!Number.isFinite(seconds) || seconds < 0.25) {
    throw new Error("Refresh interval must be at least 0.25 seconds");
  }
  const render = async () => {
    const servers = await discoverServers();
    process.stdout.write("\u001b[2J\u001b[H");
    process.stdout.write(`localhost — ${new Date().toLocaleTimeString()} — Ctrl+C to exit\n\n`);
    process.stdout.write(`${formatTable(servers)}\n`);
  };
  await render();
  setInterval(() => void render(), seconds * 1000);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command = "list", target] = positional;
  const json = flags.has("--json");

  if (flags.has("--help") || command === "help") {
    process.stdout.write(`${help()}\n`);
    return;
  }
  if (flags.has("--version") || command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  switch (command) {
    case "list":
      await list(json, flags.has("--all"));
      break;
    case "inspect": {
      if (!target) throw new Error("inspect requires a PID or port");
      await inspect(target, json);
      break;
    }
    case "open": {
      if (!target) throw new Error("open requires a PID or port");
      const result = await openServer(target);
      if (json) printJson(result);
      else process.stdout.write(`Opened ${result.url}\n`);
      break;
    }
    case "stop": {
      if (!target) throw new Error("stop requires a PID or port");
      const result = await stopServer(target, { force: flags.has("--force") });
      if (json) printJson(result);
      else process.stdout.write(`Sent ${result.signal} to ${result.name} (PID ${result.pid})\n`);
      break;
    }
    case "watch":
      await watch(target);
      break;
    case "mcp":
      await runMcpServer();
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${help()}`);
  }
}

main().catch((error) => {
  const jsonRequested = process.argv.includes("--json");
  if (jsonRequested) printJson({ error: error.message, code: error.code ?? "LOCALHOST_ERROR" });
  else process.stderr.write(`localhost: ${error.message}\n`);
  process.exitCode = 1;
});
