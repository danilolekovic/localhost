# localhost

`localhost` is a dependency-free terminal cockpit for the development servers
running on your computer. It is designed for both humans and AI coding agents.

```text
NAME          URL                    STACK    PID    BRANCH
storefront    http://localhost:3000  Next.js  48102  checkout-redesign
api           http://localhost:8000  FastAPI  48177  main
```

## Try it

Requires Node.js 20+ and `lsof` (included with macOS and commonly available on
Linux).

```bash
npm link
localhost
localhost inspect 3000
localhost watch
```

No global installation is needed while developing:

```bash
node ./bin/localhost.js list
```

## Commands

```bash
localhost list [--json] [--all]
localhost inspect <pid|port> [--json]
localhost open <pid|port>
localhost stop <pid|port> [--force]
localhost watch [seconds]
localhost mcp
```

The JSON response is versionable, deterministic output for scripts and agents:

```bash
localhost list --json | jq '.servers[] | {name, port, framework}'
```

By default, obvious operating-system listeners are hidden and cannot be targeted
by the inspect or stop commands. Use `localhost list --all` only when diagnosing
discovery itself.

## MCP integration

Add the server to an MCP-capable coding agent using a stdio configuration:

```json
{
  "mcpServers": {
    "localhost": {
      "command": "node",
      "args": ["/absolute/path/to/localhost/bin/localhost.js", "mcp"]
    }
  }
}
```

Tools exposed:

- `list_servers` — discover listening servers and their project context
- `inspect_server` — inspect a server by port or PID
- `stop_server` — terminate a verified listener; requires `confirm: true`

`stop_server` re-runs discovery immediately before signaling the process. This
prevents an agent from acting on stale process information.

The server supports both the modern MCP `2026-07-28` `server/discover` lifecycle
and the legacy `initialize` lifecycle. Tool results include both human-readable
text and schema-declared `structuredContent`.

## Current scope

This first release supports macOS and Linux systems with `lsof`. Stable local
domains, aggregated logs, Docker metadata, and a full-screen interactive TUI are
planned next.

## Development

```bash
npm test
npm run check
```

## License

MIT
