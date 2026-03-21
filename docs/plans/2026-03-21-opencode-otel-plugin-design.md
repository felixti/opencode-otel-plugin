# OpenCode OTel Plugin — Design Document

> **Date**: 2026-03-21
> **Status**: Approved
> **Package**: `opencode-otel-plugin` (publishable npm)

## Overview

An OpenCode plugin that instruments coding sessions with OpenTelemetry, emitting traces, metrics, and resource attributes via OTLP/HTTP. Gives teams visibility into AI-assisted development: token usage, model selection, tool calls, file changes, session lifecycle, and compaction behavior.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | OTel SDK Modular | Standard API, no heavy sdk-node, Bun-compatible HTTP exporters |
| Export protocol | OTLP/HTTP | No native module deps, works in Bun, simpler than gRPC |
| Configuration | Environment variables | Standard OTel env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, etc.) |
| Distribution | npm package | `opencode.json` → `"plugin": ["opencode-otel-plugin"]` |
| Service name | Always `"opencode"` | Hardcoded, not configurable |

## Dependencies (Pinned Latest)

```json
{
  "@opentelemetry/api": "1.9.0",
  "@opentelemetry/sdk-trace-base": "2.6.0",
  "@opentelemetry/sdk-metrics": "2.6.0",
  "@opentelemetry/exporter-trace-otlp-http": "0.213.0",
  "@opentelemetry/exporter-metrics-otlp-http": "0.213.0",
  "@opentelemetry/resources": "2.6.0",
  "@opentelemetry/semantic-conventions": "1.40.0"
}
```

---

## 1. Resource Attributes

Set once at plugin init, attached to ALL telemetry via the OTel `Resource`. Some values are captured dynamically after init due to SDK constraints (see notes below).

| Requirement | OTel Attribute | Source | Notes |
|---|---|---|---|
| Service name | `service.name` = `"opencode"` | Hardcoded | On resource |
| OpenCode version | `service.version` | `installation.updated` event | Set on session spans after received; not on resource (version unavailable at init) |
| Author | `enduser.id` | `git config user.email` via `$` shell | Falls back to `"unknown"` if email not configured |
| Machine hostname | `host.name` | `os.hostname()` | On resource |
| Project name | `opencode.project.name` | `project.id` from plugin context | SDK `Project` type has no `name` field; `id` is the only identifier |
| Repository URL | `vcs.repository.url.full` | `git remote get-url origin` via `$` shell | On resource |
| Branch name | `vcs.repository.ref.name` | `git branch --show-current` via `$` shell | Initial value on resource; updated on active session root spans via `vcs.branch.updated` event (Resource is immutable after creation) |
| Worktree | `opencode.worktree` | `worktree` from plugin context | On resource |
| Working directory | `opencode.directory` | `directory` from plugin context | On resource |

---

## 2. Traces — Span Hierarchy

Each OpenCode session produces a trace tree:

```
invoke_agent opencode                          (INTERNAL, root span per session)
├── chat {model}                               (CLIENT, one per LLM request)
│   attributes: gen_ai.request.model, gen_ai.provider.name,
│               gen_ai.usage.input_tokens, gen_ai.usage.output_tokens,
│               gen_ai.response.model (set from request model — SDK does not expose response model),
│               gen_ai.response.finish_reasons (when finish reason available),
│               error.type (on error only, per semconv)
│
├── execute_tool {tool_name}                   (INTERNAL, one per tool call)
│   attributes: gen_ai.tool.name, gen_ai.tool.call.id,
│               gen_ai.tool.output.title, gen_ai.tool.output.metadata.*
│
├── file_edit {filepath}                       (INTERNAL, one per file change from session.diff)
│   attributes: code.filepath, code.language,
│               opencode.file.lines_added, opencode.file.lines_removed
│
├── session_compaction                         (INTERNAL, one per compaction)
│   attributes: gen_ai.conversation.id
│
└── ... (more chat/tool/file spans)
```

### Span Details

**Session root span** (`invoke_agent opencode`):
- Starts on `session.created` event
- Ends on `session.idle` event
- Carries `gen_ai.operation.name` = `invoke_agent`, `gen_ai.conversation.id` = sessionID

**Chat spans** (`chat {model}`):
- Created from `chat.params` hook (captures model/provider at request start)
- Ended when `message.updated` event fires with token usage
- Follows `gen_ai.*` semantic conventions for all attributes

**Tool spans** (`execute_tool {tool_name}`):
- Started in `tool.execute.before` hook
- Ended in `tool.execute.after` hook with output title and metadata attributes

**File edit spans** (`file_edit {filepath}`):
- Created from `session.diff` event (provides line counts and file paths)
- Language detected from file extension
- `file.edited` event triggers language detection but has no sessionID for span parenting

**Compaction spans** (`session_compaction`):
- Created from `session.compacted` event

---

## 3. Metrics

### GenAI Semantic Convention Metrics

| Metric | Type | Unit | Attributes |
|---|---|---|---|
| `gen_ai.client.token.usage` | Histogram | `{token}` | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.token.type` (`input`\|`output`), `gen_ai.request.model` |
| `gen_ai.client.operation.duration` | Histogram | `s` | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model`, `error.type` (on error only, per semconv) |

### Custom OpenCode Metrics

| Metric | Type | Unit | Attributes |
|---|---|---|---|
| `opencode.session.request.count` | Counter | `{request}` | `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.conversation.id` |
| `opencode.session.compaction.count` | Counter | `{compaction}` | `gen_ai.conversation.id` |
| `opencode.file.changes` | Counter | `{line}` | `opencode.change.type` (`added`\|`removed`), `code.language`, `code.filepath` |
| `opencode.tool.invocations` | Counter | `{invocation}` | `gen_ai.tool.name` |

---

## 4. Hook → Signal Wiring

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Plugin Hooks                      │
├──────────────────────┬──────────────────────────────────────┤
│ chat.params          │ → Capture model, provider per request │
│ event:message.updated│ → Extract tokens, end chat span       │
│ event:session.created│ → Start session root span             │
│ event:session.idle   │ → End session root span, flush metrics│
│ event:session.diff   │ → File changes (lines +/-), language, file_edit spans│
│ event:session.compacted│ → Increment compaction counter      │
│ event:file.edited    │ → Detect language from file extension  │
│ tool.execute.before  │ → Start tool span                     │
│ tool.execute.after   │ → End tool span with output title and metadata│
│ event:vcs.branch.updated│ → Update branch context            │
└──────────────────────┴──────────────────────────────────────┘
         │                          │                    │
         ▼                          ▼                    ▼
   ┌──────────┐            ┌──────────────┐      ┌───────────┐
   │  Traces   │            │   Metrics     │      │ Resources │
   └─────┬─────┘            └──────┬───────┘      └─────┬─────┘
         └────────────┬────────────┘                     │
                      ▼                                  │
              ┌──────────────┐                           │
              │ OTLP/HTTP    │◄──────────────────────────┘
              │ Exporter     │
              └──────┬───────┘
                     ▼
              OTLP Endpoint
```

---

## 5. Module Structure

```
opencode-otel-plugin/
├── src/
│   ├── index.ts              # Plugin entry point, exports Plugin
│   ├── types.ts              # Shared types/interfaces
│   ├── telemetry/
│   │   ├── index.ts          # Barrel export
│   │   ├── provider.ts       # TracerProvider + MeterProvider init
│   │   ├── resources.ts      # Resource attribute collection
│   │   └── shutdown.ts       # Graceful shutdown logic
│   ├── hooks/
│   │   ├── index.ts          # Barrel export
│   │   ├── event.ts          # Event hook (session, file, compaction)
│   │   ├── chat-params.ts    # chat.params hook (model/provider capture)
│   │   └── tool-execute.ts   # tool.execute.before/after hooks
│   ├── signals/
│   │   ├── index.ts          # Barrel export
│   │   ├── spans.ts          # Span creation helpers
│   │   └── metrics.ts        # Metric instrument definitions
│   └── utils/
│       ├── index.ts          # Barrel export
│       ├── git.ts            # Git info helpers (author, repo, branch)
│       ├── language.ts       # File extension → language mapping
│       └── diff.ts           # FileDiff → line count extraction
├── package.json
├── tsconfig.json
└── README.md
```

---

## 6. Package & Distribution

### package.json

```json
{
  "name": "opencode-otel-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "bun build ./src/index.ts --outdir dist --target bun",
    "dev": "bun run --watch src/index.ts"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": ">=0.1.0"
  },
  "dependencies": {
    "@opentelemetry/api": "1.9.0",
    "@opentelemetry/sdk-trace-base": "2.6.0",
    "@opentelemetry/sdk-metrics": "2.6.0",
    "@opentelemetry/exporter-trace-otlp-http": "0.213.0",
    "@opentelemetry/exporter-metrics-otlp-http": "0.213.0",
    "@opentelemetry/resources": "2.6.0",
    "@opentelemetry/semantic-conventions": "1.40.0"
  }
}
```

### User Installation

```jsonc
// opencode.json
{
  "plugin": ["opencode-otel-plugin"]
}
```

### Configuration

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer xxx  # optional auth
```

---

## 7. Key Design Constraints

- **No console.log** — all output goes through OTel signals, not stdout
- **Files < 200 lines** — split if approaching 150
- **Barrel exports** — every directory has `index.ts`
- **Graceful shutdown** — flush pending spans/metrics on `server.instance.disposed` or `session.idle` (SDK event union uses `server.instance.disposed`, not `global.disposed`)
- **Error resilience** — OTel failures must never crash the plugin or affect OpenCode; plugin init is wrapped in try/catch and returns no-op hooks on failure
- **Low cardinality** — avoid per-request unique values in metric attributes (no messageIDs)
- **Resource immutability** — OTel `Resource` is immutable after creation; dynamic values like `service.version` and branch updates are set as span attributes on active spans
