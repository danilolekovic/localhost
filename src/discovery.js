import path from "node:path";
import { readFile } from "node:fs/promises";
import { run, tryRun } from "./system.js";

export function parseLsofFieldOutput(output) {
  const listeners = [];
  let process = null;
  let file = null;

  const flushFile = () => {
    if (!process || !file?.name) return;
    const match = file.name.match(/(?:\]|:)(\d+)(?:\s+\(LISTEN\))?$/);
    if (!match) return;
    listeners.push({
      pid: Number(process.pid),
      commandName: process.commandName,
      address: file.name.replace(/\s+\(LISTEN\)$/, ""),
      port: Number(match[1]),
    });
  };

  for (const line of output.split("\n")) {
    if (!line) continue;
    const field = line[0];
    const value = line.slice(1);
    if (field === "p") {
      flushFile();
      process = { pid: value, commandName: "unknown" };
      file = null;
    } else if (field === "c" && process) {
      process.commandName = value;
    } else if (field === "f") {
      flushFile();
      file = { fd: value, name: "" };
    } else if (field === "n" && file) {
      file.name = value;
    }
  }
  flushFile();
  return listeners;
}

function frameworkFrom(pkg, command) {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const candidates = [
    ["next", "Next.js"], ["vite", "Vite"], ["astro", "Astro"],
    ["nuxt", "Nuxt"], ["@remix-run/dev", "Remix"], ["gatsby", "Gatsby"],
    ["react-scripts", "Create React App"], ["fastify", "Fastify"],
    ["express", "Express"], ["@nestjs/core", "NestJS"],
  ];
  for (const [dependency, label] of candidates) {
    if (deps?.[dependency]) return label;
  }
  if (/rails/i.test(command)) return "Rails";
  if (/django|manage\.py/i.test(command)) return "Django";
  if (/uvicorn|fastapi/i.test(command)) return "FastAPI";
  if (/python/i.test(command)) return "Python";
  if (/node|bun|deno/i.test(command)) return "Node.js";
  return null;
}

function isLikelyDevelopmentServer({ cwd, command, framework }) {
  if (framework) return true;
  if (/\b(node|npm|npx|pnpm|yarn|bun|deno|python|ruby|rails|php|java|cargo|go run|dotnet)\b/i.test(command)) {
    return true;
  }
  if (!cwd || cwd === "/") return false;
  return !/^\/(System|Library|usr|bin|sbin|private\/var)(?:\/|$)/.test(cwd);
}

async function packageInfo(cwd) {
  if (!cwd) return { pkg: null, packageName: null };
  try {
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
    return { pkg, packageName: pkg.name ?? null };
  } catch {
    return { pkg: null, packageName: null };
  }
}

async function enrich(listener) {
  const pid = String(listener.pid);
  const cwdRaw = await tryRun("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const cwd = cwdRaw.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
  const command = await tryRun("ps", ["-p", pid, "-o", "command="], listener.commandName);
  const { pkg, packageName } = await packageInfo(cwd);
  const gitBranch = cwd
    ? await tryRun("git", ["-C", cwd, "branch", "--show-current"], "")
    : "";
  const host = /(?:127\.0\.0\.1|\[::1\]|localhost)/.test(listener.address)
    ? "localhost"
    : "localhost";
  const protocol = [443, 8443].includes(listener.port) ? "https" : "http";
  const framework = frameworkFrom(pkg, command);
  const name = packageName || (cwd && cwd !== "/" ? path.basename(cwd) : null) || listener.commandName;
  const server = {
    id: `${listener.pid}:${listener.port}`,
    pid: listener.pid,
    port: listener.port,
    address: listener.address,
    url: `${protocol}://${host}:${listener.port}`,
    name,
    process: listener.commandName,
    command,
    cwd,
    framework,
    gitBranch: gitBranch || null,
  };
  return { ...server, development: isLikelyDevelopmentServer(server) };
}

export async function discoverServers({ includeSystem = false } = {}) {
  let output;
  try {
    output = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcfn"]);
  } catch (error) {
    if (error.code === "ENOENT") {
      const wrapped = new Error("lsof is required for process discovery");
      wrapped.code = "MISSING_LSOF";
      throw wrapped;
    }
    return [];
  }

  const parsed = parseLsofFieldOutput(output);
  const unique = [...new Map(parsed.map((item) => [`${item.pid}:${item.port}`, item])).values()];
  const servers = await Promise.all(unique.map(enrich));
  return servers
    .filter((server) => includeSystem || server.development)
    .sort((a, b) => a.port - b.port || a.pid - b.pid);
}

export function findServer(servers, target) {
  const normalized = String(target).replace(/^:/, "");
  const number = Number(normalized);
  if (!Number.isInteger(number) || number <= 0) {
    const error = new Error(`Invalid target: ${target}. Use a PID, port, or :port.`);
    error.code = "INVALID_TARGET";
    throw error;
  }
  const byPort = servers.filter((server) => server.port === number);
  const byPid = servers.filter((server) => server.pid === number);
  const matches = [...new Map([...byPort, ...byPid].map((server) => [server.id ?? `${server.pid}:${server.port}`, server])).values()];
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const error = new Error(`Target ${target} is ambiguous; use the server's port instead.`);
    error.code = "AMBIGUOUS_TARGET";
    throw error;
  }
  const error = new Error(`No listening server found for ${target}`);
  error.code = "SERVER_NOT_FOUND";
  throw error;
}
