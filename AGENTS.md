# AGENTS.md — opencode-otel-plugin

OpenTelemetry instrumentation plugin for [OpenCode](https://opencode.ai). Emits traces and metrics via OTLP/HTTP for every AI coding session.

## Quick Reference

```bash
bun install          # Install dependencies
bun test             # Run all tests (bun:test, 119 tests / 183 assertions)
bun run typecheck    # Type-check with tsc --noEmit
bun run build        # Bundle to dist/ (bun build + tsc --emitDeclarationOnly)
```

## Architecture

This is an `@opencode-ai/plugin` that hooks into OpenCode's event system to produce OpenTelemetry signals. The plugin exports a single named `OpenCodeOtelPlugin: Plugin` from `src/index.ts`.

### Module Layout

```
src/
├── index.ts          # Plugin entry: init providers, wire hooks, error boundary, TTL sweeper
├── types.ts          # Shared state types (SessionSpanState, PluginState, etc.)
├── hooks/            # Event/hook handlers — one per OpenCode hook type
├── signals/          # OTel instrument definitions — spans and metrics
├── telemetry/        # OTel SDK setup — resource, provider init, shutdown/flush
└── utils/            # Pure helpers — language detection, git info, truncation
```

### Data Flow

1. Plugin init (`src/index.ts`): gather git metadata → create OTel Resource → init TracerProvider + MeterProvider → create metric instruments → wire hooks
2. `event` hook: dispatches to `hooks/event.ts` (session lifecycle, diffs, compactions, branch updates) or `hooks/message-handler.ts` (assistant message token recording, errors, shutdown)
3. `chat.params` hook: starts a chat span and records LLM request count
4. `tool.execute.before/after` hooks: bracket tool execution with spans, count invocations, and detect VCS operations
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

### Event Routing (Important)

Some event types are handled **directly in `src/index.ts`** rather than routed through `hooks/event.ts`:

| Event | Handler | Location |
|---|---|---|
| `session.created`, `session.idle`, `session.compacted`, `vcs.branch.updated` | `createEventHook` | `hooks/event.ts` |
| `message.updated` | `handleMessageUpdated` | `hooks/message-handler.ts` (called from `index.ts`) |
| `session.error` | `handleSessionError` | `hooks/message-handler.ts` (called from `index.ts`) |
| `server.instance.disposed` | `handleServerDisposed` | `hooks/message-handler.ts` (called from `index.ts`) |
| `installation.updated` | inline | `src/index.ts` (sets `state.opencodeVersion`) |

## Where To Look

| Task | Location | Notes |
|---|---|---|
| Add a new hook type | `src/hooks/` + wire in `src/index.ts` | Follow DI pattern: factory takes `{ tracer, instruments, state }` |
| Add a new metric | `src/signals/metrics.ts` + record in relevant hook | Update `MetricInstruments` interface and `createMetricInstruments` |
| Add a new span type | `src/signals/spans.ts` + call from hook | Accept optional `parentContext` for hierarchy |
| Change resource attributes | `src/telemetry/resources.ts` | Resource is immutable after init — dynamic values go on spans |
| Modify shutdown/flush | `src/telemetry/shutdown.ts` | Both functions intentionally swallow errors |
| Add git metadata | `src/utils/git.ts` | Uses BunShell `$`; returns fallback on error |
| Understand state shape | `src/types.ts` | `PluginState` is the central mutable state |
| Add/modify tests | `tests/` (mirrors `src/` structure) | Use `bun:test`, real OTel SDK + in-memory exporters |

## Conventions

- **No `console.log`** — all output goes through OTel signals
- **Files < 200 lines** — split if approaching 150
- **Barrel exports** — every directory has `index.ts` re-exporting its public API
- **Error resilience** — OTel failures never crash the plugin; `src/index.ts` returns no-op hooks on init failure; every hook body is wrapped in try/catch
- **Graceful shutdown** — flush on `session.idle`, full shutdown on `server.instance.disposed`
- **Low cardinality** — no per-request unique values (message IDs, call IDs) in metric attributes; only in span attributes
- **Resource immutability** — OTel Resource is set once at init; dynamic values (`service.version`, `vcs.repository.ref.name`) are set as span attributes on active spans
- **Service name** — always `"opencode"`, hardcoded, not configurable
- **Dependency injection** — hook factories accept `{ tracer, instruments, state }`, no globals except OTel global providers
- **Conventional commits** — enforced by husky + commitlint (`@commitlint/config-conventional`)

## Anti-Patterns (This Project)

- **Never `console.log`** — use OTel signals exclusively
- **Never suppress types** — no `as any`, `@ts-ignore`, `@ts-expect-error`
- **Never add high-cardinality metric attributes** — message IDs, call IDs, timestamps belong in span attributes only
- **Never mutate Resource after init** — set dynamic values as span attributes
- **Never let telemetry crash the host** — all hook bodies must be wrapped in try/catch; init failure returns no-op hooks
- **Never mock `Tracer`/`Meter` in tests** — use real SDK instances with `InMemorySpanExporter`
- **Empty catches are intentional policy** — `src/index.ts` and `src/telemetry/shutdown.ts` deliberately swallow OTel errors; do not add logging to these without considering host impact

## Key Types

- `PluginState` (`types.ts`): mutable state shared across all hooks — maps of active session spans, tool spans, pending chat requests, current branch, opencode version
- `SessionSpanState`: tracks a session's root span + context + request count
- `MetricInstruments` (`signals/metrics.ts`): the 7 metric instruments created at init
- `ChatRequestInfo`: pending chat request info (model, provider, start time)
- `Providers` (`telemetry/provider.ts`): `{ tracerProvider, meterProvider }` for shutdown/flush

## Dependencies

| Package | Role |
|---|---|
| `@opencode-ai/plugin` | Plugin SDK types (peer dep, `>=0.1.0`) |
| `@opentelemetry/api` | OTel API (tracer, meter, context, span) — `1.9.0` |
| `@opentelemetry/sdk-trace-base` | BasicTracerProvider, BatchSpanProcessor — `2.6.0` |
| `@opentelemetry/sdk-metrics` | MeterProvider, PeriodicExportingMetricReader — `2.6.0` |
| `@opentelemetry/exporter-trace-otlp-proto` | OTLP/HTTP (protobuf) trace exporter — `0.213.0` |
| `@opentelemetry/exporter-metrics-otlp-proto` | OTLP/HTTP (protobuf) metric exporter — `0.213.0` |
| `@opentelemetry/resources` | `resourceFromAttributes()` (SDK v2 API) — `2.6.0` |
| `@opentelemetry/semantic-conventions` | Standard attribute constants |

## SDK Gotchas

- **OTel SDK v2**: Uses `resourceFromAttributes()` not `new Resource()`. `spanProcessors` is a constructor option on `BasicTracerProvider`, not registered after.
- **`@opencode-ai/plugin` types**: `Project` has `id` but no `name` field. `server.instance.disposed` is the shutdown event (not `global.disposed`).
- **`message.updated` fires multiple times** per assistant message — guard on `tokens.input != null` before ending the chat span.
- **`AssistantMessage.tokens`**: `{ input: number; output: number; reasoning: number; cache: { read: number; write: number } }`
- **`BunShell`**: accessed as `PluginInput["$"]` type alias.
- **Git metadata is async** — `state.gitReady` is a Promise; initial spans may lack git attributes until it resolves. Errors are swallowed (empty `.catch()`).
- **TTL sweeper** in `src/index.ts` uses `setInterval` with `.unref()` — won't keep the process alive but is platform-dependent.
- **Metadata flattening** in `hooks/tool-execute.ts`: max depth 3, max 32 keys, strings truncated. Deep metadata is silently dropped.

## Build & CI

- **Runtime**: Bun (install, test, build). CI also installs Node 22 for semantic-release.
- **Build**: `bun build ./src/index.ts --outdir dist --target bun --minify` + `tsc --emitDeclarationOnly`
- **CI**: `.github/workflows/release.yml` — push to `main` triggers: typecheck → test → build → `semantic-release`
- **Release**: semantic-release with conventional commits → npm publish + GitHub release + CHANGELOG.md commit
- **Git hooks**: husky — `pre-commit` (typecheck), `pre-push` (test + build), `commit-msg` (commitlint)
- **No linter config** — no ESLint/Prettier/Biome configured at project level
