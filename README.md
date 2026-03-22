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

### Traces

Each OpenCode session produces a trace tree with parent-child relationships:

| Span | Trigger | Key Attributes |
|---|---|---|
| `invoke_agent opencode` | Session start | `gen_ai.agent.name`, `gen_ai.conversation.id` |
| `chat {model}` | LLM request | `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` |
| `execute_tool {name}` | Tool call | `gen_ai.tool.name`, `gen_ai.tool.call.id`, `code.language` (edit/write tools) |
| `session_compaction` | Context compaction | `gen_ai.conversation.id` |

### Metrics

| Metric | Type | Unit | Description |
|---|---|---|---|
| `gen_ai.client.token.usage` | Histogram | `{token}` | Input/output tokens per LLM call |
| `gen_ai.client.operation.duration` | Histogram | `s` | LLM call duration |
| `opencode.session.request.count` | Counter | `{request}` | LLM requests per session |
| `opencode.session.compaction.count` | Counter | `{compaction}` | Context compactions |
| `opencode.file.changes` | Counter | `{line}` | Lines added/removed |
| `opencode.tool.invocations` | Counter | `{invocation}` | Tool calls |

### Resource Attributes

Attached to all signals, identifying the session:

| Attribute | Source |
|---|---|
| `service.name` | Always `"opencode"` |
| `service.version` | OpenCode version (set when available) |
| `enduser.id` | `git config user.email` |
| `host.name` | Machine hostname |
| `opencode.project.name` | Project identifier |
| `vcs.repository.url.full` | Git remote URL |
| `vcs.repository.ref.name` | Current branch |

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
bun test             # 48 tests, 84 assertions
bun run typecheck    # tsc --noEmit
bun run build        # dist/index.js + dist/index.d.ts
```

## License

MIT
