# AGENTS.md — opencode-otel-plugin

OpenTelemetry instrumentation plugin for [OpenCode](https://opencode.ai). Emits traces and metrics via OTLP/HTTP for every AI coding session.

## Quick Reference

```bash
bun install          # Install dependencies
bun test             # Run all tests (bun:test)
bun run typecheck    # Type-check with tsc --noEmit
bun run build        # Bundle to dist/ (bun build + tsc --emitDeclarationOnly)
```

## Architecture

This is an `@opencode-ai/plugin` that hooks into OpenCode's event system to produce OpenTelemetry signals. The plugin exports a single `Plugin` function from `src/index.ts`.

### Module Layout

```
src/
├── index.ts          # Plugin entry: init providers, wire hooks, error boundary
├── types.ts          # Shared state types (SessionSpanState, PluginState, etc.)
├── hooks/            # Event/hook handlers — one per OpenCode hook type
├── signals/          # OTel instrument definitions — spans and metrics
├── telemetry/        # OTel SDK setup — resource, provider init, shutdown/flush
└── utils/            # Pure helpers — language detection, diff parsing, git info
```

### Data Flow

1. Plugin init (`src/index.ts`): gather git metadata → create OTel Resource → init TracerProvider + MeterProvider → create metric instruments → wire hooks
2. `event` hook: dispatches to `hooks/event.ts` (session lifecycle, diffs, compactions, branch updates) or `hooks/message-handler.ts` (assistant message token recording, errors, shutdown)
3. `chat.params` hook: starts a chat span and records LLM request count
4. `tool.execute.before/after` hooks: bracket tool execution with spans and count invocations
5. On `session.idle`: end session span, flush providers
6. On `server.instance.disposed`: end all open spans, shutdown providers

### Span Hierarchy

```
invoke_agent opencode           (root, per session)
├── chat {model}                (child, per LLM request)
├── execute_tool {tool_name}    (child, per tool call; edit tool includes code.language)
└── session_compaction          (child, per compaction)
```

Parent-child relationships use explicit OTel `Context` propagation — session root context is passed to child span creation functions.

## Conventions

- **No `console.log`** — all output goes through OTel signals
- **Files < 200 lines** — split if approaching 150
- **Barrel exports** — every directory has `index.ts` re-exporting its public API
- **Error resilience** — OTel failures never crash the plugin; `src/index.ts` returns no-op hooks on init failure; every hook body is wrapped in try/catch
- **Graceful shutdown** — flush on `session.idle`, full shutdown on `server.instance.disposed`
- **Low cardinality** — no per-request unique values (message IDs, call IDs) in metric attributes; only in span attributes
- **Resource immutability** — OTel Resource is set once at init; dynamic values (`service.version`, `vcs.repository.ref.name`) are set as span attributes on active spans
- **Service name** — always `"opencode"`, hardcoded, not configurable

## Key Types

- `PluginState` (`types.ts`): mutable state shared across all hooks — maps of active session spans, tool spans, pending chat requests, current branch, opencode version
- `SessionSpanState`: tracks a session's root span + context + request count
- `MetricInstruments` (`signals/metrics.ts`): the 6 metric instruments created at init

## Dependencies

| Package | Role |
|---|---|
| `@opencode-ai/plugin` | Plugin SDK types (peer dep) |
| `@opentelemetry/api` | OTel API (tracer, meter, context, span) |
| `@opentelemetry/sdk-trace-base` | BasicTracerProvider, BatchSpanProcessor |
| `@opentelemetry/sdk-metrics` | MeterProvider, PeriodicExportingMetricReader |
| `@opentelemetry/exporter-trace-otlp-http` | OTLP/HTTP trace exporter |
| `@opentelemetry/exporter-metrics-otlp-http` | OTLP/HTTP metric exporter |
| `@opentelemetry/resources` | `resourceFromAttributes()` (SDK v2 API) |
| `@opentelemetry/semantic-conventions` | Standard attribute constants |

## SDK Gotchas

- **OTel SDK v2**: Uses `resourceFromAttributes()` not `new Resource()`. `spanProcessors` is a constructor option on `BasicTracerProvider`, not registered after.
- **`@opencode-ai/plugin` types**: `Project` has `id` but no `name` field. `server.instance.disposed` is the shutdown event (not `global.disposed`).
- **`message.updated` fires multiple times** per assistant message — guard on `tokens.input != null` before ending the chat span.
- **`AssistantMessage.tokens`**: `{ input: number; output: number; reasoning: number; cache: { read: number; write: number } }`
- **`BunShell`**: accessed as `PluginInput["$"]` type alias
