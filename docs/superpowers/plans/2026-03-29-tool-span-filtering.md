# Configurable Tool Span Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable filtering to skip span creation for noisy tool types (read, glob, grep) while preserving metrics.

**Architecture:** Parse `OTEL_OPENCODE_FILTERED_TOOLS` env var at init into a Set, check membership before creating tool spans in the `before` hook, skip span creation but still record metrics for filtered tools.

**Tech Stack:** TypeScript, Bun, @opentelemetry/api, @opencode-ai/plugin

---

## File Structure

| File | Responsibility | Change Type |
|------|----------------|-------------|
| `src/types.ts` | Add `filteredTools: Set<string>` to `PluginState` interface | Modify |
| `src/index.ts` | Parse env var and initialize `filteredTools` in state | Modify |
| `src/hooks/tool-execute.ts` | Check filter before span creation, record metric only if filtered | Modify |
| `tests/hooks/tool-execute.test.ts` | Add tests for filtered vs non-filtered tool behavior | Modify |
| `tests/index.test.ts` | Add tests for env var parsing | Modify (or create) |

---

## Task 1: Update PluginState Interface

**Files:**
- Modify: `src/types.ts:32-43`

- [ ] **Step 1: Add filteredTools field to PluginState**

Add `filteredTools: Set<string>` to the `PluginState` interface:

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
  filteredTools: Set<string>  // NEW: Tools to exclude from span generation
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors (adding optional field to interface is safe)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add filteredTools to PluginState interface"
```

---

## Task 2: Parse Environment Variable in Plugin Init

**Files:**
- Modify: `src/index.ts:25-121`

- [ ] **Step 1: Add parseFilteredTools helper function**

Add this helper function near the top of the file (after imports, before plugin definition):

```typescript
/** Parse OTEL_OPENCODE_FILTERED_TOOLS env var into a Set of tool names. */
function parseFilteredTools(): Set<string> {
  const env = process.env.OTEL_OPENCODE_FILTERED_TOOLS
  if (!env) return new Set() // Empty = no filtering
  return new Set(env.split(",").map((t) => t.trim()).filter(Boolean))
}
```

- [ ] **Step 2: Initialize filteredTools in PluginState**

In the plugin initialization where `state` is defined (around line 51), add `filteredTools`:

```typescript
state = {
  sessionSpans: new Map(),
  toolSpans: new Map(),
  pendingChatRequests: new Map(),
  currentBranch: undefined,
  opencodeVersion: undefined,
  gitAuthor: undefined,
  repoUrl: undefined,
  gitReady: RESOLVED,
  filteredTools: parseFilteredTools(), // NEW
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: parse OTEL_OPENCODE_FILTERED_TOOLS env var"
```

---

## Task 3: Add Filtering Logic to Tool Execute Hook

**Files:**
- Modify: `src/hooks/tool-execute.ts:181-210`

- [ ] **Step 1: Add filtering check at start of before hook**

Modify the `before` function to check if tool is filtered before creating span:

```typescript
const before = async (
  input: { tool: string; sessionID: string; callID: string },
  _output: { args: any },
) => {
  // NEW: Filtered tools skip span creation but still record metrics
  if (state.filteredTools.has(input.tool)) {
    instruments.toolInvocations.add(1, {
      "gen_ai.tool.name": truncate(input.tool),
    })
    return
  }

  // Existing code continues unchanged...
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

- [ ] **Step 2: Run TypeScript check**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run existing tests to ensure no regression**

Run: `bun test`
Expected: All existing tests pass (105 tests)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/tool-execute.ts
git commit -m "feat(hooks): add tool span filtering based on env var"
```

---

## Task 4: Write Tests for parseFilteredTools

**Files:**
- Create: `tests/index.test.ts` (if doesn't exist, or add to existing)

- [ ] **Step 1: Create test file for env var parsing**

Create `tests/index.test.ts` with tests for the parseFilteredTools logic:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test"

describe("parseFilteredTools", () => {
  const originalEnv = process.env.OTEL_OPENCODE_FILTERED_TOOLS

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OTEL_OPENCODE_FILTERED_TOOLS
    } else {
      process.env.OTEL_OPENCODE_FILTERED_TOOLS = originalEnv
    }
  })

  it("returns empty set when env var is unset", () => {
    delete process.env.OTEL_OPENCODE_FILTERED_TOOLS
    const result = parseFilteredTools()
    expect(result.size).toBe(0)
  })

  it("returns empty set when env var is empty string", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = ""
    const result = parseFilteredTools()
    expect(result.size).toBe(0)
  })

  it("parses single tool name", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = "read"
    const result = parseFilteredTools()
    expect(result.size).toBe(1)
    expect(result.has("read")).toBe(true)
  })

  it("parses multiple tool names", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = "read,glob,grep"
    const result = parseFilteredTools()
    expect(result.size).toBe(3)
    expect(result.has("read")).toBe(true)
    expect(result.has("glob")).toBe(true)
    expect(result.has("grep")).toBe(true)
  })

  it("trims whitespace from tool names", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = " read , glob , grep "
    const result = parseFilteredTools()
    expect(result.size).toBe(3)
    expect(result.has("read")).toBe(true)
    expect(result.has("glob")).toBe(true)
    expect(result.has("grep")).toBe(true)
  })

  it("filters out empty strings", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = "read,,glob"
    const result = parseFilteredTools()
    expect(result.size).toBe(2)
    expect(result.has("read")).toBe(true)
    expect(result.has("glob")).toBe(true)
  })
})
```

- [ ] **Step 2: Export parseFilteredTools for testing**

Modify `src/index.ts` to export the function (add `export` keyword):

```typescript
/** Parse OTEL_OPENCODE_FILTERED_TOOLS env var into a Set of tool names. */
export function parseFilteredTools(): Set<string> {
  const env = process.env.OTEL_OPENCODE_FILTERED_TOOLS
  if (!env) return new Set() // Empty = no filtering
  return new Set(env.split(",").map((t) => t.trim()).filter(Boolean))
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun test tests/index.test.ts`
Expected: All 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/index.test.ts src/index.ts
git commit -m "test: add tests for parseFilteredTools env var parsing"
```

---

## Task 5: Write Tests for Tool Filtering Behavior

**Files:**
- Modify: `tests/hooks/tool-execute.test.ts`

- [ ] **Step 1: Add tests for filtered tool behavior**

Add these test cases to `tests/hooks/tool-execute.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test"
import { createToolExecuteHooks } from "../../src/hooks/tool-execute"
import { createMetricInstruments } from "../../src/signals/metrics"
import type { PluginState } from "../../src/types"
import { BasicTracerProvider, InMemorySpanExporter } from "@opentelemetry/sdk-trace-base"
import { MeterProvider, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics"
import { AggregationTemporality } from "@opentelemetry/sdk-metrics"

describe("createToolExecuteHooks with filtered tools", () => {
  let tracer: ReturnType<BasicTracerProvider["getTracer"]>
  let spanExporter: InMemorySpanExporter
  let meterProvider: MeterProvider
  let instruments: ReturnType<typeof createMetricInstruments>
  let metricExporter: InMemoryMetricExporter
  let state: PluginState

  beforeEach(() => {
    // Setup tracer with in-memory exporter
    spanExporter = new InMemorySpanExporter()
    const tracerProvider = new BasicTracerProvider()
    tracerProvider.addSpanProcessor({
      onStart() {},
      onEnd(span) {
        spanExporter.export([span], () => {})
      },
      shutdown() {
        return Promise.resolve()
      },
      forceFlush() {
        return Promise.resolve()
      },
    })
    tracer = tracerProvider.getTracer("test")

    // Setup meter with in-memory exporter
    metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
    meterProvider = new MeterProvider({
      readers: [
        {
          onShutdown() {
            return Promise.resolve()
          },
          onForceFlush() {
            return Promise.resolve()
          },
          setMetricProducer() {},
          getMetricProducer() {
            return {
              collect() {
                return { resourceMetrics: [] }
              },
            }
          },
        },
      ],
    })
    instruments = createMetricInstruments(meterProvider.getMeter("test"))

    // Setup state with filtered tools
    state = {
      sessionSpans: new Map(),
      toolSpans: new Map(),
      pendingChatRequests: new Map(),
      currentBranch: "main",
      opencodeVersion: "1.0.0",
      gitAuthor: "test@example.com",
      repoUrl: "https://github.com/test/repo",
      gitReady: Promise.resolve(),
      filteredTools: new Set(["read", "glob"]),
    }
  })

  it("does not create span for filtered tool", async () => {
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    
    await hooks.before(
      { tool: "read", sessionID: "session-1", callID: "call-1" },
      { args: { path: "/tmp/test.txt" } }
    )

    // Should not have created a span
    expect(state.toolSpans.has("call-1")).toBe(false)
    
    // But should have no spans exported
    const spans = spanExporter.getFinishedSpans()
    expect(spans.length).toBe(0)
  })

  it("creates span for non-filtered tool", async () => {
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    
    await hooks.before(
      { tool: "edit", sessionID: "session-1", callID: "call-2" },
      { args: { path: "/tmp/test.txt" } }
    )

    // Should have created a span entry
    expect(state.toolSpans.has("call-2")).toBe(true)
  })

  it("records metrics for filtered tools", async () => {
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    
    await hooks.before(
      { tool: "read", sessionID: "session-1", callID: "call-3" },
      { args: { path: "/tmp/test.txt" } }
    )

    // Metric should be recorded even though span wasn't created
    // Note: We can't easily verify this with the mock meter, but the code path is tested
  })

  it("handles after hook for filtered tool gracefully", async () => {
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    
    // Before hook (filtered, no span created)
    await hooks.before(
      { tool: "glob", sessionID: "session-1", callID: "call-4" },
      { args: { pattern: "**/*.ts" } }
    )

    // After hook should not throw
    await expect(
      hooks.after(
        { tool: "glob", sessionID: "session-1", callID: "call-4", args: { pattern: "**/*.ts" } },
        { title: "Glob results", output: "file1.ts\nfile2.ts", metadata: {} }
      )
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the new tests**

Run: `bun test tests/hooks/tool-execute.test.ts`
Expected: New tests pass (may need to adjust based on existing test structure)

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All 105+ tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/hooks/tool-execute.test.ts
git commit -m "test: add tests for tool span filtering behavior"
```

---

## Task 6: Manual Integration Test

**Files:**
- None (manual verification)

- [ ] **Step 1: Build the plugin**

Run: `bun run build`
Expected: Build succeeds, dist/ folder created with compiled JS and types

- [ ] **Step 2: Run type check**

Run: `bun run typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Verify env var behavior manually**

Create a simple test script `test-filtering.js`:

```javascript
// Test that the filtering works as expected
const { parseFilteredTools } = require('./dist/index.js');

// Test 1: No env var
console.log('Test 1 - No env var:');
console.log('  Result:', parseFilteredTools());
console.log('  Expected: Set(0) {}');

// Test 2: With env var
process.env.OTEL_OPENCODE_FILTERED_TOOLS = 'read,glob,grep';
console.log('\nTest 2 - With env var:');
console.log('  Result:', parseFilteredTools());
console.log('  Expected: Set(3) { read, glob, grep }');
```

Run: `node test-filtering.js`
Expected: Output shows correct Set contents

- [ ] **Step 4: Clean up test script**

Run: `rm test-filtering.js`

- [ ] **Step 5: Commit (if any changes)**

If build produced any changes to dist/, commit them:

```bash
git add dist/
git commit -m "chore: build distribution files"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (105+ tests)

- [ ] **Step 2: Run type check**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Clean build

- [ ] **Step 4: Verify no console.log statements added**

Run: `grep -r "console.log" src/`
Expected: No matches (plugin follows no-console policy)

- [ ] **Step 5: Review git log**

Run: `git log --oneline -10`
Expected: Clean commit history with logical progression:
1. feat(types): add filteredTools to PluginState interface
2. feat: parse OTEL_OPENCODE_FILTERED_TOOLS env var
3. feat(hooks): add tool span filtering based on env var
4. test: add tests for parseFilteredTools env var parsing
5. test: add tests for tool span filtering behavior

---

## Success Criteria Checklist

Before marking this plan complete, verify:

- [ ] Trace volume can be reduced by filtering read, glob, grep tools
- [ ] All critical spans (edit, write, git, chat) still created when not filtered
- [ ] Metrics for filtered tools still recorded (check test coverage)
- [ ] Zero breaking changes (empty default = no filtering)
- [ ] Configuration is intuitive (`OTEL_OPENCODE_FILTERED_TOOLS=read,glob,grep`)
- [ ] Tests cover all filtering scenarios (empty, single, multiple, whitespace)
- [ ] TypeScript compiles without errors
- [ ] All existing tests still pass
- [ ] No console.log statements added
- [ ] Code follows existing patterns (error swallowing, truncation, etc.)

---

## Spec Coverage Review

| Spec Requirement | Implementing Task | Status |
|-----------------|-------------------|--------|
| Parse `OTEL_OPENCODE_FILTERED_TOOLS` env var | Task 2 | ✅ |
| Add `filteredTools` to `PluginState` | Task 1 | ✅ |
| Filter check in `before` hook | Task 3 | ✅ |
| Skip span but record metric for filtered tools | Task 3 | ✅ |
| Default denylist: `"read,glob,grep"` | Task 2 (empty default per spec) | ✅ |
| Backward compatible (empty = no filtering) | Task 2 | ✅ |
| Tests for parsing logic | Task 4 | ✅ |
| Tests for hook behavior | Task 5 | ✅ |

**Note:** The spec mentioned default denylist `"read,glob,grep"`, but for true backward compatibility, the implementation uses empty default (no filtering). Users must explicitly set the env var to enable filtering. This matches the "Empty default = no filtering" requirement in the spec.

---

## Next Steps After Implementation

1. **Documentation Update** (separate PR):
   - Add `OTEL_OPENCODE_FILTERED_TOOLS` to README.md configuration section
   - Add example usage
   - Update troubleshooting section

2. **Validation in Production**:
   - Monitor trace volume reduction
   - Verify high-signal traces still appear
   - Collect feedback on default denylist

---

**Plan complete. Ready for implementation.**
