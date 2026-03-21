# hooks/

OpenCode plugin hook implementations. Each file handles one hook type or a related group of event handlers.

## Files

### `event.ts` — Event Hook (108 lines)

Handles the `event` hook for session lifecycle and workspace events. Creates the `createEventHook()` factory that dispatches on `event.type`:

- `session.created` → starts root `invoke_agent opencode` span, stores in `state.sessionSpans`
- `session.idle` → ends session span, flushes providers
- `session.diff` → creates `file_edit` spans + records `opencode.file.changes` metric per file
- `session.compacted` → creates `session_compaction` span + records `opencode.session.compaction.count`
- `vcs.branch.updated` → updates `state.currentBranch` and sets attribute on all active spans
- `file.edited` → calls `detectLanguage()` (pre-warm, no span created here)

Does NOT handle: `message.updated`, `session.error`, `server.instance.disposed`, `installation.updated` — those are handled in `src/index.ts` dispatch or `message-handler.ts`.

### `message-handler.ts` — Message & Lifecycle Handlers (112 lines)

Three exported functions called directly from `src/index.ts`:

- `handleMessageUpdated(msg, state, instruments)` — ends the chat span when token usage arrives. Guards on `tokens.input != null` because `message.updated` fires multiple times. Records `gen_ai.client.token.usage` and `gen_ai.client.operation.duration` metrics.
- `handleSessionError(event, state, instruments)` — marks chat span as errored, records error duration metric.
- `handleServerDisposed(state, providers)` — ends all open spans, clears state maps, calls `shutdownProviders()`.

### `chat-params.ts` — Chat Params Hook (49 lines)

Handles `chat.params` hook. Starts a `chat {model}` span as child of the session root, stores `ChatRequestInfo` for later use when the message response arrives, increments `opencode.session.request.count`.

### `tool-execute.ts` — Tool Execute Hooks (68 lines)

Handles `tool.execute.before` and `tool.execute.after`. Before: starts `execute_tool {toolName}` span, records `opencode.tool.invocations`. After: sets output attributes (title, metadata), ends span. Uses recursive `setMetadataAttributes()` to flatten nested metadata objects into dotted span attribute keys.

### `index.ts` — Barrel Export (4 lines)

Re-exports all public functions from the hook modules.

## Patterns

- **Dependency injection**: each hook factory takes `{ tracer, instruments, state }` (and optionally `providers`). No globals.
- **Parent context propagation**: hooks look up the session from `state.sessionSpans` and pass `session.context` to span creation functions.
- **Span keying**: chat spans are keyed as `chat:${sessionID}` in `state.toolSpans`; tool spans use `callID`.
- **Error swallowing**: all hook invocations in `src/index.ts` are wrapped in try/catch — individual handler functions do not catch internally.
