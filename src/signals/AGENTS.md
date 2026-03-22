# signals/

OTel instrument definitions — span creation helpers and metric instrument factories.

## Files

### `metrics.ts` — Metric Instruments (39 lines)

Defines `MetricInstruments` interface and `createMetricInstruments(meter)` factory. Creates 6 instruments:

| Instrument | Type | Name | Unit |
|---|---|---|---|
| `tokenUsage` | Histogram | `gen_ai.client.token.usage` | `{token}` |
| `operationDuration` | Histogram | `gen_ai.client.operation.duration` | `s` |
| `requestCount` | Counter | `opencode.session.request.count` | `{request}` |
| `compactionCount` | Counter | `opencode.session.compaction.count` | `{compaction}` |
| `fileChanges` | Counter | `opencode.file.changes` | `{line}` |
| `toolInvocations` | Counter | `opencode.tool.invocations` | `{invocation}` |

The first two follow GenAI semantic conventions; the last four are custom OpenCode metrics.

### `spans.ts` — Span Helpers (70 lines)

Four span creation functions, each returns a `Span`:

| Function | Span Name | SpanKind | Key Attributes |
|---|---|---|---|
| `startSessionSpan` | `invoke_agent opencode` | INTERNAL | `gen_ai.operation.name`, `gen_ai.agent.name`, `gen_ai.conversation.id` |
| `startChatSpan` | `chat {model}` | CLIENT | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.request.model` |
| `startToolSpan` | `execute_tool {toolName}` | INTERNAL | `gen_ai.tool.name`, `gen_ai.tool.call.id` |
| `startCompactionSpan` | `session_compaction` | INTERNAL | `gen_ai.conversation.id` |

**Context propagation**: `startSessionSpan` creates a new context with the span set as active. All other functions accept an optional `parentContext?: Context` parameter — pass the session's context to create parent-child relationships.

**Instant spans**: `startCompactionSpan` calls `span.end()` immediately (point-in-time event). `startSessionSpan`, `startChatSpan`, and `startToolSpan` leave the span open for the caller to end.

### `index.ts` — Barrel Export (9 lines)

Re-exports all functions and the `MetricInstruments` type.
