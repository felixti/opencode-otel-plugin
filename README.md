# opencode-otel-plugin

OpenTelemetry instrumentation plugin for [OpenCode](https://opencode.ai). Emits traces and metrics via OTLP/HTTP for every AI coding session — LLM calls, tool executions, file edits, and compactions.

## Installation

Add the plugin to your `opencode.json`:

```json
{
  "plugin": ["opencode-otel-plugin"]
}
```

Set the OTLP endpoint:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

## Configuration

All configuration is via standard OpenTelemetry environment variables:

| Variable | Description | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP endpoint URL | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers (comma-separated `key=value`) | — |

### Example Endpoints

**Local Collector:**

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

**Grafana Cloud:**

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp-gateway-prod-us-central-0.grafana.net/otlp"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic $(echo -n '<instance-id>:<api-key>' | base64)"
```

**Honeycomb:**

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://api.honeycomb.io"
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=<your-api-key>"
```

## Collected Signals

### Resource Attributes

Attached to all telemetry, set once at plugin init:

| Attribute | Source |
|---|---|
| `service.name` = `"opencode"` | Hardcoded |
| `service.version` | `installation.updated` event (set on spans after received) |
| `enduser.id` | `git config user.email` |
| `host.name` | `os.hostname()` |
| `opencode.project.name` | Project ID from plugin context |
| `vcs.repository.url.full` | `git remote get-url origin` |
| `vcs.repository.ref.name` | `git branch --show-current` |
| `opencode.worktree` | Plugin context |
| `opencode.directory` | Plugin context |

### Traces

Each session produces a trace tree:

```
invoke_agent opencode                    (root span per session)
├── chat {model}                         (one per LLM request)
├── execute_tool {tool_name}             (one per tool call)
├── file_edit {filepath}                 (one per file change)
└── session_compaction                   (one per compaction)
```

### Metrics

**GenAI Semantic Convention Metrics:**

| Metric | Type | Unit |
|---|---|---|
| `gen_ai.client.token.usage` | Histogram | `{token}` |
| `gen_ai.client.operation.duration` | Histogram | `s` |

**Custom OpenCode Metrics:**

| Metric | Type | Unit |
|---|---|---|
| `opencode.session.request.count` | Counter | `{request}` |
| `opencode.session.compaction.count` | Counter | `{compaction}` |
| `opencode.file.changes` | Counter | `{line}` |
| `opencode.tool.invocations` | Counter | `{invocation}` |

## Development

```bash
git clone <repo-url>
cd opencode-otel-plugin
bun install
bun test
bun run typecheck
bun run build
```

## Known SDK Deviations

The design document has been updated to reflect the actual `@opencode-ai/sdk` types. Key implementation notes:

| Area | Implementation Detail | Reason |
|---|---|---|
| `opencode.project.name` | Uses `project.id` | SDK `Project` type has no `name` field; `id` is the only identifier |
| Shutdown event | `server.instance.disposed` | SDK `Event` union does not include `global.disposed` |
| `service.version` | Set on session spans via `installation.updated` event | Version unavailable at plugin init; OTel Resource is immutable after creation |
| `vcs.repository.ref.name` | Initial value on resource; updates on active session root spans | OTel Resource is immutable; branch changes via `vcs.branch.updated` propagate to active spans only |
| `enduser.id` | `git config user.email` with `"unknown"` fallback | Email only; no `user.name` fallback |
| `gen_ai.response.model` | Set from request model | SDK does not expose a separate response model field |
| `error.type` on metrics | Included only on error paths | Per GenAI semconv, `error.type` is set "if operation errored" |
| `file_edit` spans | Created from `session.diff` event | `file.edited` event has no `sessionID` for span parenting; `session.diff` provides line counts |
| Compaction span | No `gen_ai.operation.name` | `session_compaction` is not a standard semconv operation value |
| Error resilience | Plugin init wrapped in try/catch | Returns no-op hooks if OTel initialization fails |

## License

MIT
