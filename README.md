# opencode-otel-plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

OpenTelemetry instrumentation plugin for [OpenCode](https://opencode.ai). Automatically traces every AI coding session — LLM calls, tool executions, file edits, and context compactions — and exports them via OTLP/HTTP to any OpenTelemetry-compatible backend.

## Quick Start

### 1. Install the plugin

```bash
npm install opencode-otel-plugin
```

### 2. Add to your OpenCode config

In your `opencode.json`:

```json
{
  "plugin": ["opencode-otel-plugin"]
}
```

### 3. Set the OTLP endpoint

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

### 4. Start coding

Open an OpenCode session as usual. Traces and metrics are exported automatically — no code changes needed.

## Try It Locally with Jaeger

The fastest way to see your traces is with [Jaeger](https://www.jaegertracing.io/) running in Docker:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegerdata/all-in-one:latest
```

Set the endpoint and start OpenCode:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
opencode
```

Open [http://localhost:16686](http://localhost:16686), select **opencode** from the service dropdown, and click **Find Traces**. You'll see a trace tree for each coding session:

```
invoke_agent opencode                    ← root span (session)
├── chat claude-sonnet-4-20250514            ← LLM request
├── execute_tool edit                    ← tool call (includes code.language)
├── execute_tool bash                    ← tool call
└── session_compaction                   ← context compaction
```

## Configuration

All configuration uses standard [OpenTelemetry environment variables](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/). No plugin-specific config needed.

| Variable | Description | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP base URL | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers (`key=value`, comma-separated) | — |

### Backend Examples

<details>
<summary><strong>Grafana Cloud</strong></summary>

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp-gateway-prod-us-central-0.grafana.net/otlp"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic $(echo -n '<instance-id>:<api-key>' | base64)"
```

</details>

<details>
<summary><strong>Honeycomb</strong></summary>

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://api.honeycomb.io"
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=<your-api-key>"
```

</details>

<details>
<summary><strong>Dynatrace</strong></summary>

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://{your-environment-id}.live.dynatrace.com/api/v2/otlp"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Api-Token {your-api-token}"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
```

Create an API token in Dynatrace with `openTelemetryTrace.ingest` and `metrics.ingest` scopes.

</details>

<details>
<summary><strong>Datadog</strong></summary>

```bash
# Requires the Datadog Agent with OTLP ingestion enabled
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

</details>

<details>
<summary><strong>OTel Collector</strong></summary>

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
```

Use an [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) to fan out to multiple backends.

</details>

## What Gets Collected

### Span Hierarchy

Each OpenCode session produces a trace tree with explicit parent-child relationships:

```
invoke_agent opencode                    ← root span (one per session)
├── chat {model}                         ← child span (one per LLM request)
├── execute_tool {tool_name}             ← child span (one per tool call)
└── session_compaction                   ← child span (one per compaction)
```

### Trace Attributes

#### `invoke_agent opencode` — Session Root Span

Created when a session starts, ended on `session.idle`. One per coding session.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.operation.name` | string | Always `"invoke_agent"` |
| `gen_ai.agent.name` | string | Always `"opencode"` |
| `gen_ai.conversation.id` | string | OpenCode session ID |
| `service.version` | string | OpenCode version (set when `installation.updated` fires) |
| `vcs.repository.ref.name` | string | Current git branch |
| `enduser.id` | string | Git author email (`git config user.email`) |
| `vcs.repository.url.full` | string | Git remote URL |
| `opencode.session.request_count` | number | Total LLM requests in session (set when span ends) |

#### `chat {model}` — LLM Request Span

Created on `chat.params` hook, ended when the assistant message arrives with token counts.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.operation.name` | string | Always `"chat"` |
| `gen_ai.request.model` | string | Model ID sent in the request (e.g., `claude-sonnet-4-20250514`) |
| `gen_ai.provider.name` | string | Provider identifier (e.g., `anthropic`, `openai`) |
| `gen_ai.conversation.id` | string | OpenCode session ID |
| `vcs.repository.ref.name` | string | Current git branch |
| `enduser.id` | string | Git author email |
| `vcs.repository.url.full` | string | Git remote URL |
| `gen_ai.usage.input_tokens` | number | Input tokens consumed (set on completion) |
| `gen_ai.usage.output_tokens` | number | Output tokens generated (set on completion) |
| `gen_ai.response.model` | string | Model ID from the response |
| `gen_ai.response.finish_reasons` | string[] | Finish reasons array (e.g., `["end_turn"]`) |
| `error.type` | string | Error class name (set only on failure) |

#### `execute_tool {name}` — Tool Execution Span

Created on `tool.execute.before`, ended on `tool.execute.after`. Includes flattened tool output metadata.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.operation.name` | string | Always `"execute_tool"` |
| `gen_ai.tool.name` | string | Tool name (e.g., `edit`, `write`, `bash`, `glob`) |
| `gen_ai.tool.call.id` | string | Unique tool call identifier |
| `gen_ai.conversation.id` | string | OpenCode session ID |
| `vcs.repository.ref.name` | string | Current git branch |
| `enduser.id` | string | Git author email |
| `vcs.repository.url.full` | string | Git remote URL |
| `gen_ai.tool.output.title` | string | Tool output title (set on completion) |
| `gen_ai.tool.output.metadata.*` | string | Flattened tool output metadata (max 32 keys, depth 3, strings truncated to 256 chars) |
| `code.language` | string | Detected programming language (edit, write, and apply_patch tools only; derived from file extension) |

#### `session_compaction` — Context Compaction Span

Created as an instant span when OpenCode compacts the conversation context.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.conversation.id` | string | OpenCode session ID |
| `vcs.repository.ref.name` | string | Current git branch |
| `enduser.id` | string | Git author email |
| `vcs.repository.url.full` | string | Git remote URL |

### Metrics

#### `gen_ai.client.token.usage` — Token Usage

Histogram measuring token consumption per LLM call. Unit: `{token}`.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.operation.name` | string | Always `"chat"` |
| `gen_ai.provider.name` | string | Provider identifier |
| `gen_ai.request.model` | string | Model ID |
| `gen_ai.token.type` | string | `"input"` or `"output"` — recorded as two separate data points per call |

#### `gen_ai.client.operation.duration` — LLM Call Duration

Histogram measuring LLM request latency. Unit: `s` (seconds).

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.operation.name` | string | Always `"chat"` |
| `gen_ai.provider.name` | string | Provider identifier |
| `gen_ai.request.model` | string | Model ID |
| `error.type` | string | Error class name (present only on failed requests) |

#### `opencode.session.request.count` — LLM Request Count

Counter tracking total LLM requests. Unit: `{request}`.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.request.model` | string | Model ID |
| `gen_ai.provider.name` | string | Provider identifier |

#### `opencode.session.compaction.count` — Compaction Count

Counter tracking context compaction events. Unit: `{compaction}`. No attributes.

#### `opencode.file.changes` — File Change Lines

Counter tracking lines of code added or removed by edit, write, and apply_patch tools. Unit: `{line}`.

| Attribute | Type | Description |
|---|---|---|
| `code.language` | string | Detected programming language (omitted for unknown file extensions) |
| `opencode.change.type` | string | `"added"` or `"removed"` |

#### `opencode.tool.invocations` — Tool Invocation Count

Counter tracking tool executions. Unit: `{invocation}`.

| Attribute | Type | Description |
|---|---|---|
| `gen_ai.tool.name` | string | Tool name (e.g., `edit`, `bash`, `glob`, `read`) |

### Resource Attributes

Attached to all exported signals (traces and metrics), identifying the session environment. Set once at plugin initialization.

| Attribute | Type | Description |
|---|---|---|
| `service.name` | string | Always `"opencode"` |
| `host.name` | string | Machine hostname |
| `enduser.id` | string | Git author email (`git config user.email`) |
| `opencode.project.name` | string | Project identifier from OpenCode |
| `vcs.repository.url.full` | string | Git remote URL |
| `vcs.repository.ref.name` | string | Current git branch |
| `opencode.worktree` | string | Git worktree path |
| `opencode.directory` | string | Current working directory |

## Troubleshooting

### No traces appearing

1. **Check the endpoint is reachable:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:4318/v1/traces
   ```
   Expect `200` or `405`. Connection refused = endpoint is down.

2. **Verify the env var is set in the OpenCode process:**
   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   ```
   Must be set _before_ starting OpenCode. The plugin reads it at init time.

3. **Check for auth errors** (cloud backends):
   Look for `401` or `403` in your collector logs. Ensure `OTEL_EXPORTER_OTLP_HEADERS` is set correctly.

### Traces appear but metrics don't

Metrics export on a 30-second interval. Wait at least 30s after activity, or end the session (triggers a flush).

### Plugin silently disabled

If the plugin can't initialize (e.g., missing OTel packages), it returns no-op hooks and OpenCode continues normally. Check that `opencode-otel-plugin` appears in your installed packages:

```bash
npm ls opencode-otel-plugin
```

## Semantic Conventions

This plugin follows [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) where applicable:

- Span names: `{operation} {target}` (e.g., `chat claude-sonnet-4-20250514`, `execute_tool bash`)
- `gen_ai.*` attributes for LLM operations
- `gen_ai.client.*` metric names for token usage and operation duration
- Custom `opencode.*` attributes for plugin-specific signals

## Development

```bash
git clone https://github.com/felixti/opencode-otel-plugin.git
cd opencode-otel-plugin
bun install
bun test             # 62 tests, 103 assertions
bun run typecheck    # tsc --noEmit
bun run build        # dist/index.js + dist/index.d.ts
```

## License

MIT
