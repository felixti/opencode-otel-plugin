# Design: Configurable Tool Span Filtering

**Date:** 2026-03-29  
**Status:** Approved  
**Related:** Tool execution telemetry, trace volume optimization

---

## Problem Statement

The OpenCode OTel plugin currently creates a span for every tool execution (`execute_tool {toolName}`). In a typical coding session, this generates hundreds of spans for low-value operations:

- **`read`**: File reads (often 50+ per session)
- **`glob`**: File pattern searches (often 20+ per session)
- **`grep`**: Content searches (often 30+ per session)
- **`bash`**: Shell commands (often 40+ per session)

These spans provide minimal observability value while:
1. Flooding trace backends with noise
2. Increasing storage and ingestion costs
3. Making it harder to find high-signal traces (edits, git operations, LLM calls)
4. Slowing down trace queries and UI performance

**Goal:** Reduce trace volume by 70-80% while preserving all critical telemetry signals.

---

## Solution Overview

Introduce **configurable tool span filtering** that allows users to exclude specific tool types from span generation. Filtered tools still record metrics (counters), maintaining usage analytics visibility.

### Key Principles

1. **Metrics Always Recorded**: Even filtered tools increment `opencode.tool.invocations`, preserving aggregate usage data
2. **User-Configurable**: Denylist is customizable via environment variable
3. **Sensible Defaults**: Sensible built-in defaults reduce configuration burden
4. **Backward Compatible**: No filtering when env var is unset (current behavior preserved)
5. **Low Overhead**: Filtering decision made once at init, checked in O(1) at runtime

---

## Architecture

### Configuration Interface

**Environment Variable:** `OTEL_OPENCODE_FILTERED_TOOLS`

```bash
# Comma-separated list of tool names to exclude from span generation
export OTEL_OPENCODE_FILTERED_TOOLS="read,glob,grep"

# Disable filtering entirely (default behavior)
export OTEL_OPENCODE_FILTERED_TOOLS=""

# Override defaults with custom list
export OTEL_OPENCODE_FILTERED_TOOLS="read,glob,grep,ls,cat"
```

**Default Value:** `"read,glob,grep"`

### Data Flow Changes

```
Current Flow:
  tool.execute.before ──► startToolSpan() ──► state.toolSpans.set()
                                         
New Flow (Filtered Tool):
  tool.execute.before ──► isFiltered(toolName)? ──► Yes ──► Skip span, record metric only
                                             └────► No ───► startToolSpan() as normal
```

### State Changes

**`PluginState` Interface Addition:**

```typescript
export interface PluginState {
  // ... existing fields ...
  filteredTools: Set<string>  // NEW: Parsed from env var
}
```

### Hook Behavior Changes

**`createToolExecuteHooks.before()`:**

```typescript
const before = async (input: { tool: string; ... }) => {
  // NEW: Check if tool is filtered
  if (state.filteredTools.has(input.tool)) {
    // Record metric but skip span creation
    instruments.toolInvocations.add(1, { "gen_ai.tool.name": input.tool })
    return
  }
  
  // Existing: Create span for non-filtered tools
  const span = startToolSpan(...)
  // ... rest of implementation
}
```

**`createToolExecuteHooks.after()`:**

No changes needed. If span wasn't created (filtered tool), `state.toolSpans.get(input.callID)` returns undefined, and the hook naturally becomes a no-op for that call.

---

## Implementation Details

### File: `src/types.ts`

Add `filteredTools` to `PluginState`:

```typescript
export interface PluginState {
  sessionSpans: Map<string, SessionSpanState>
  toolSpans: ToolSpanMap
  pendingChatRequests: Map<string, ChatRequestInfo>
  currentBranch: string | undefined
  opencodeVersion: string | undefined
  gitAuthor: string | undefined
  repoUrl: string | undefined
  sweepInterval?: ReturnType<typeof setInterval>
  lastFlushTime?: number
  gitReady: Promise<void>
  filteredTools: Set<string>  // NEW
}
```

### File: `src/index.ts`

Parse environment variable at plugin initialization:

```typescript
function parseFilteredTools(): Set<string> {
  const env = process.env.OTEL_OPENCODE_FILTERED_TOOLS
  if (!env) return new Set() // Empty = no filtering
  return new Set(env.split(',').map(t => t.trim()).filter(Boolean))
}

// In plugin initialization:
state = {
  // ... existing fields ...
  filteredTools: parseFilteredTools(),
}
```

### File: `src/hooks/tool-execute.ts`

Add filtering check in `before` hook:

```typescript
const before = async (
  input: { tool: string; sessionID: string; callID: string },
  _output: { args: any },
) => {
  // NEW: Filtered tools skip span creation but record metrics
  if (state.filteredTools.has(input.tool)) {
    instruments.toolInvocations.add(1, {
      "gen_ai.tool.name": truncate(input.tool),
    })
    return
  }

  // Existing: Create span for non-filtered tools
  await state.gitReady
  const session = state.sessionSpans.get(input.sessionID)
  if (session) session.lastActivityAt = Date.now()
  
  const span = startToolSpan(tracer, {
    toolName: input.tool,
    callID: input.callID,
    sessionID: input.sessionID,
    branch: state.currentBranch,
  }, session?.context)

  if (state.gitAuthor) span.setAttribute("enduser.id", truncate(state.gitAuthor))
  if (state.repoUrl) span.setAttribute("vcs.repository.url.full", truncate(state.repoUrl))

  state.toolSpans.set(input.callID, {
    span,
    sessionID: input.sessionID,
    createdAt: Date.now(),
  })

  instruments.toolInvocations.add(1, {
    "gen_ai.tool.name": truncate(input.tool),
  })
}
```

---

## Span Hierarchy Impact

### Before Filtering (Typical Session)

```
invoke_agent opencode
├── chat claude-sonnet-4-20250514
├── execute_tool read          ← 50+ of these
├── execute_tool glob          ← 20+ of these
├── execute_tool grep          ← 30+ of these
├── execute_tool bash          ← 40+ of these
├── execute_tool edit          ← Signal preserved
├── execute_tool git-commit    ← Signal preserved
└── session_compaction
```

**Total tool spans:** ~140+

### After Filtering (Same Session)

```
invoke_agent opencode
├── chat claude-sonnet-4-20250514
├── execute_tool edit          ← Signal preserved
├── execute_tool git-commit    ← Signal preserved
└── session_compaction
```

**Total tool spans:** ~3 (98% reduction)

### Preserved Telemetry

Even with filtering enabled, the following signals are **always** preserved:

| Span Type | Reason |
|-----------|--------|
| `invoke_agent opencode` | Session root - always critical |
| `chat {model}` | LLM interactions - primary signal |
| `execute_tool edit` | Code changes - high value |
| `execute_tool write` | Code changes - high value |
| `execute_tool apply_patch` | Code changes - high value |
| `execute_tool git-commit` | VCS operations - compliance/audit |
| `execute_tool gh` | GitHub operations - workflow tracking |
| `session_compaction` | Context management - debugging |

---

## Testing Strategy

### Unit Tests

1. **Filtering Logic:**
   - Empty env var → no filtering
   - Single tool → only that tool filtered
   - Multiple tools → all specified tools filtered
   - Whitespace handling → trimmed correctly
   - Case sensitivity → exact match required

2. **Hook Behavior:**
   - Filtered tool → no span created, metric recorded
   - Non-filtered tool → span created, metric recorded
   - After hook with filtered tool → no-op gracefully

3. **Metrics Integrity:**
   - Filtered and non-filtered tools both increment counter
   - Counter attributes correct in both cases

### Integration Test

Simulate a session with mixed tool calls, verify:
- Only expected spans exported
- All tools appear in metrics
- Span hierarchy intact for non-filtered tools

---

## Rollout & Migration

### Phase 1: Implementation (This PR)
- Add filtering infrastructure
- Default denylist: `"read,glob,grep"`
- Comprehensive tests

### Phase 2: Documentation Update (Follow-up)
- Update README with new env var
- Add troubleshooting section for filtering
- Provide tuning guidance

### Phase 3: Validation (Monitoring)
- Monitor trace volume reduction
- Verify signal preservation in production traces
- Adjust defaults based on feedback

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidentally filtering critical tools | Conservative defaults; user must explicitly add tools |
| Debugging difficulty without tool spans | Metrics still recorded; can temporarily disable filtering |
| Breaking change for existing users | Empty default = no filtering; opt-in behavior |
| Over-filtering in specific workflows | Configurable per-environment; easy to adjust |

---

## Future Extensions

1. **Regex Filtering:** Support patterns like `read:*.md` or `bash:git*`
2. **Sampling Integration:** Combine filtering with sampling for remaining tools
3. **Dynamic Configuration:** Allow runtime toggle via OpenCode UI
4. **Per-Session Override:** Allow sessions to request unfiltered traces

---

## Success Criteria

- [ ] Trace volume reduced by 70-80% with default configuration
- [ ] All critical spans (edit, write, git, chat) still exported
- [ ] Metrics for filtered tools still recorded
- [ ] Zero breaking changes for existing users
- [ ] Configuration is intuitive and well-documented
- [ ] Tests cover all filtering scenarios

---

## References

- Existing design: `docs/superpowers/specs/2026-03-22-vcs-operations-metric-design.md`
- Implementation pattern: `src/hooks/tool-execute.ts`
- Configuration precedent: Standard OTel env vars in README.md
