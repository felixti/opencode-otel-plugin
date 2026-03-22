# VCS Operations Metric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `opencode.vcs.operations` counter metric that tracks git commits and PR mutations detected from tool execution hooks.

**Architecture:** A pure detection module (`src/utils/vcs-detect.ts`) classifies tool calls as VCS operations by inspecting tool names and bash command strings. The `tool.execute.after` hook calls this function and records the new counter metric when a VCS operation is detected.

**Tech Stack:** TypeScript, `@opentelemetry/api` (Counter), `bun:test`

**Spec:** `docs/superpowers/specs/2026-03-22-vcs-operations-metric-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/vcs-detect.ts` | **New.** Pure function: `classifyVcsOperation(tool, args)` → `VcsDetectionResult \| null`. Types: `VcsOperation`, `VcsDetectionResult`. |
| `src/utils/index.ts` | Add re-export for `classifyVcsOperation`, `VcsOperation`, `VcsDetectionResult`. |
| `src/signals/metrics.ts` | Add `vcsOperations: Counter` to `MetricInstruments` interface and `createMetricInstruments` factory. |
| `src/hooks/tool-execute.ts` | Import `classifyVcsOperation`, call in `after` handler, record metric if non-null. |
| `tests/utils/vcs-detect.test.ts` | **New.** Unit tests for all detection patterns. |
| `tests/hooks/tool-execute.test.ts` | Add integration tests for VCS metric recording via tool hooks. |

---

### Task 1: VCS Detection Module — Types and Git Commit Detection

**Files:**
- Create: `src/utils/vcs-detect.ts`
- Test: `tests/utils/vcs-detect.test.ts`

- [ ] **Step 1: Write failing tests for git commit detection**

Create `tests/utils/vcs-detect.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { classifyVcsOperation } from "../../src/utils/vcs-detect"

describe("classifyVcsOperation", () => {
  describe("git commit detection", () => {
    test("detects simple git commit", () => {
      expect(classifyVcsOperation("bash", { command: "git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit --amend", () => {
      expect(classifyVcsOperation("bash", { command: "git commit --amend" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit in chained command", () => {
      expect(classifyVcsOperation("bash", { command: "git add . && git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit with env prefix", () => {
      expect(classifyVcsOperation("bash", { command: "GIT_AUTHOR_NAME=x git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit after semicolon", () => {
      expect(classifyVcsOperation("bash", { command: "echo done; git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("first VCS match wins in chain (commit before pr)", () => {
      expect(classifyVcsOperation("bash", { command: "git commit -m \"msg\" && gh pr create" }))
        .toEqual({ operation: "commit", source: "cli" })
    })
  })

  describe("non-VCS operations return null", () => {
    test("returns null for non-bash tool", () => {
      expect(classifyVcsOperation("edit", { path: "/src/app.ts" })).toBeNull()
    })

    test("returns null for bash with git push", () => {
      expect(classifyVcsOperation("bash", { command: "git push origin main" })).toBeNull()
    })

    test("returns null for bash with git status", () => {
      expect(classifyVcsOperation("bash", { command: "git status" })).toBeNull()
    })

    test("returns null for bash with no args", () => {
      expect(classifyVcsOperation("bash", undefined)).toBeNull()
    })

    test("returns null for bash with non-object args", () => {
      expect(classifyVcsOperation("bash", "string args")).toBeNull()
    })

    test("returns null for bash with empty command", () => {
      expect(classifyVcsOperation("bash", { command: "" })).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/utils/vcs-detect.test.ts`
Expected: FAIL — module `../../src/utils/vcs-detect` does not exist.

- [ ] **Step 3: Implement types and git commit detection**

Create `src/utils/vcs-detect.ts`:

```typescript
export type VcsOperation =
  | "commit"
  | "pr_create"
  | "pr_merge"
  | "pr_close"
  | "pr_reopen"
  | "pr_review"
  | "pr_edit"

export interface VcsDetectionResult {
  operation: VcsOperation
  source: "cli" | "mcp"
}

// Bash command patterns — match at start of command or after && / ; chain separators
const GIT_COMMIT_RE = /(?:^|&&\s*|;\s*)(?:\S+=\S+\s+)*git\s+commit\b/
const GH_PR_CREATE_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+create\b/
const GH_PR_MERGE_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+merge\b/
const GH_PR_CLOSE_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+close\b/
const GH_PR_REOPEN_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+reopen\b/
const GH_PR_REVIEW_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+review\b/
const GH_PR_EDIT_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+edit\b/

// Ordered list: first match wins
const CLI_PATTERNS: ReadonlyArray<[RegExp, VcsOperation]> = [
  [GIT_COMMIT_RE, "commit"],
  [GH_PR_CREATE_RE, "pr_create"],
  [GH_PR_MERGE_RE, "pr_merge"],
  [GH_PR_CLOSE_RE, "pr_close"],
  [GH_PR_REOPEN_RE, "pr_reopen"],
  [GH_PR_REVIEW_RE, "pr_review"],
  [GH_PR_EDIT_RE, "pr_edit"],
]

function classifyBash(args: unknown): VcsDetectionResult | null {
  if (!args || typeof args !== "object") return null
  const command = (args as Record<string, unknown>).command
  if (typeof command !== "string" || command.length === 0) return null

  for (const [pattern, operation] of CLI_PATTERNS) {
    if (pattern.test(command)) {
      return { operation, source: "cli" }
    }
  }
  return null
}

function classifyMcp(tool: string): VcsDetectionResult | null {
  const lower = tool.toLowerCase()
  // Guard: exclude copilot and branch-update variants
  if (lower.includes("copilot")) return null
  if (lower.includes("merge_pull_request")) return { operation: "pr_merge", source: "mcp" }
  if (lower.includes("pull_request_review")) return { operation: "pr_review", source: "mcp" }
  if (lower.includes("update_pull_request")) {
    if (lower.includes("branch")) return null
    return { operation: "pr_edit", source: "mcp" }
  }
  if (lower.includes("create_pull_request")) return { operation: "pr_create", source: "mcp" }
  return null
}

/** Classify a tool execution as a VCS operation, or null if not VCS-related. */
export function classifyVcsOperation(
  tool: string,
  args?: unknown,
): VcsDetectionResult | null {
  // Fast path: vast majority of tools are not VCS-related
  if (tool === "bash") return classifyBash(args)
  if (tool.includes("pull_request")) return classifyMcp(tool)
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/utils/vcs-detect.test.ts`
Expected: All 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/vcs-detect.ts tests/utils/vcs-detect.test.ts
git commit -m "feat(utils): add VCS operation detection for git commit"
```

---

### Task 2: PR Detection — CLI and MCP

**Files:**
- Modify: `tests/utils/vcs-detect.test.ts`
- (Implementation already covers PR patterns from Task 1 — this task adds comprehensive tests)

- [ ] **Step 1: Add PR CLI detection tests**

Append to `tests/utils/vcs-detect.test.ts` inside `describe("classifyVcsOperation")`:

```typescript
  describe("gh pr CLI detection", () => {
    test("detects gh pr create", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr create --title \"fix\"" }))
        .toEqual({ operation: "pr_create", source: "cli" })
    })

    test("detects gh pr merge", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr merge 123" }))
        .toEqual({ operation: "pr_merge", source: "cli" })
    })

    test("detects gh pr close", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr close 456" }))
        .toEqual({ operation: "pr_close", source: "cli" })
    })

    test("detects gh pr reopen", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr reopen 789" }))
        .toEqual({ operation: "pr_reopen", source: "cli" })
    })

    test("detects gh pr review", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr review --approve" }))
        .toEqual({ operation: "pr_review", source: "cli" })
    })

    test("detects gh pr edit", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr edit 123 --title \"new\"" }))
        .toEqual({ operation: "pr_edit", source: "cli" })
    })

    test("does not detect gh pr list (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr list" })).toBeNull()
    })

    test("does not detect gh pr view (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr view 123" })).toBeNull()
    })

    test("does not detect gh pr status (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr status" })).toBeNull()
    })

    test("does not detect gh pr checks (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr checks 123" })).toBeNull()
    })
  })
```

- [ ] **Step 2: Add MCP tool detection tests**

Append to `tests/utils/vcs-detect.test.ts` inside `describe("classifyVcsOperation")`:

```typescript
  describe("MCP tool detection", () => {
    test("detects create_pull_request MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__create_pull_request", {}))
        .toEqual({ operation: "pr_create", source: "mcp" })
    })

    test("detects merge_pull_request MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__merge_pull_request", {}))
        .toEqual({ operation: "pr_merge", source: "mcp" })
    })

    test("detects pull_request_review_write MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__pull_request_review_write", {}))
        .toEqual({ operation: "pr_review", source: "mcp" })
    })

    test("detects update_pull_request MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__update_pull_request", {}))
        .toEqual({ operation: "pr_edit", source: "mcp" })
    })

    test("excludes update_pull_request_branch (not a PR edit)", () => {
      expect(classifyVcsOperation("mcp__github__update_pull_request_branch", {}))
        .toBeNull()
    })

    test("excludes create_pull_request_with_copilot", () => {
      expect(classifyVcsOperation("mcp__github__create_pull_request_with_copilot", {}))
        .toBeNull()
    })

    test("excludes list_pull_requests (read operation)", () => {
      expect(classifyVcsOperation("mcp__github__list_pull_requests", {}))
        .toBeNull()
    })

    test("excludes search_pull_requests (read operation)", () => {
      expect(classifyVcsOperation("mcp__github__search_pull_requests", {}))
        .toBeNull()
    })

    test("excludes pull_request_read (read operation)", () => {
      expect(classifyVcsOperation("mcp__github__pull_request_read", {}))
        .toBeNull()
    })

    test("works without prefix (bare tool name)", () => {
      expect(classifyVcsOperation("create_pull_request", {}))
        .toEqual({ operation: "pr_create", source: "mcp" })
    })

    test("works with single-underscore prefix", () => {
      expect(classifyVcsOperation("github_merge_pull_request", {}))
        .toEqual({ operation: "pr_merge", source: "mcp" })
    })
  })
```

- [ ] **Step 3: Run all vcs-detect tests**

Run: `bun test tests/utils/vcs-detect.test.ts`
Expected: All tests PASS (12 existing + 21 new = 33 total).

- [ ] **Step 4: Commit**

```bash
git add tests/utils/vcs-detect.test.ts
git commit -m "test(utils): add PR detection tests for CLI and MCP tools"
```

---

### Task 3: Wire Metric Instrument

**Files:**
- Modify: `src/signals/metrics.ts`
- Modify: `src/utils/index.ts`

- [ ] **Step 1: Add `vcsOperations` to MetricInstruments interface**

In `src/signals/metrics.ts`, add to the `MetricInstruments` interface after `toolInvocations: Counter`:

```typescript
  vcsOperations: Counter
```

And add to the `createMetricInstruments` return object after `toolInvocations`:

```typescript
    vcsOperations: meter.createCounter("opencode.vcs.operations", {
      description: "VCS operations (commits, PR mutations) performed during sessions",
      unit: "{operation}",
    }),
```

- [ ] **Step 2: Add re-export to utils/index.ts**

In `src/utils/index.ts`, add:

```typescript
export { classifyVcsOperation, type VcsOperation, type VcsDetectionResult } from "./vcs-detect"
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors. The new counter field is defined but not yet recorded.

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `bun test`
Expected: All existing tests pass. The `createMockInstruments()` in `tests/hooks/tool-execute.test.ts` will need updating in Task 4, but the cast `as unknown as MetricInstruments` makes it pass for now.

- [ ] **Step 5: Commit**

```bash
git add src/signals/metrics.ts src/utils/index.ts
git commit -m "feat(signals): add vcsOperations counter to MetricInstruments"
```

---

### Task 4: Hook Integration and Integration Tests

**Files:**
- Modify: `src/hooks/tool-execute.ts`
- Modify: `tests/hooks/tool-execute.test.ts`

- [ ] **Step 1: Write failing integration tests**

Add to `tests/hooks/tool-execute.test.ts`:

1. Add `vcsOperationsSpy` to `createMockInstruments()`:

```typescript
function createMockInstruments() {
  const fileChangesSpy = createSpyCounter()
  const toolInvocationsSpy = createSpyCounter()
  const vcsOperationsSpy = createSpyCounter()
  const instruments = {
    tokenUsage: { record() {} },
    operationDuration: { record() {} },
    requestCount: { add() {} },
    compactionCount: { add() {} },
    fileChanges: fileChangesSpy,
    toolInvocations: toolInvocationsSpy,
    vcsOperations: vcsOperationsSpy,
  } as unknown as MetricInstruments
  return { instruments, fileChangesSpy, toolInvocationsSpy, vcsOperationsSpy }
}
```

2. Update `beforeEach` to capture the new spy:

```typescript
let vcsOperationsSpy: ReturnType<typeof createSpyCounter>

beforeEach(() => {
  exporter.reset()
  const mocks = createMockInstruments()
  instruments = mocks.instruments
  fileChangesSpy = mocks.fileChangesSpy
  vcsOperationsSpy = mocks.vcsOperationsSpy
  state = createMockState()
})
```

3. Add test describe block:

```typescript
describe("VCS operations metric", () => {
  test("records git commit from bash tool", async () => {
    await runToolHook("bash", null, "call_1", "sess_1", { command: "git commit -m \"feat: add feature\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      { value: 1, attributes: { "opencode.vcs.operation": "commit", "opencode.vcs.source": "cli" } },
    ])
  })

  test("records gh pr create from bash tool", async () => {
    await runToolHook("bash", null, "call_1", "sess_1", { command: "gh pr create --title \"fix\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      { value: 1, attributes: { "opencode.vcs.operation": "pr_create", "opencode.vcs.source": "cli" } },
    ])
  })

  test("records MCP create_pull_request tool", async () => {
    await runToolHook("mcp__github__create_pull_request", null, "call_1", "sess_1", {
      owner: "org", repo: "repo", title: "PR", head: "feat", base: "main",
    })
    expect(vcsOperationsSpy.calls).toEqual([
      { value: 1, attributes: { "opencode.vcs.operation": "pr_create", "opencode.vcs.source": "mcp" } },
    ])
  })

  test("does not record for non-VCS bash tool", async () => {
    await runToolHook("bash", null, "call_1", "sess_1", { command: "ls -la" })
    expect(vcsOperationsSpy.calls).toHaveLength(0)
  })

  test("does not record for edit tool", async () => {
    await runToolHook("edit", { path: "/src/app.ts" })
    expect(vcsOperationsSpy.calls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/hooks/tool-execute.test.ts`
Expected: VCS tests FAIL — `vcsOperationsSpy.calls` is empty because `tool-execute.ts` doesn't call `classifyVcsOperation` yet. Existing tests should still pass.

- [ ] **Step 3: Wire detection in tool-execute.ts after hook**

In `src/hooks/tool-execute.ts`:

1. Add import at top:

```typescript
import { classifyVcsOperation } from "../utils/vcs-detect"
```

2. In the `after` function, add after `entry.span.end()` (line 247) and before `state.toolSpans.delete(input.callID)` (line 248):

```typescript
      const vcsResult = classifyVcsOperation(input.tool, input.args)
      if (vcsResult) {
        instruments.vcsOperations.add(1, {
          "opencode.vcs.operation": vcsResult.operation,
          "opencode.vcs.source": vcsResult.source,
        })
      }
```

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All tests pass, including existing and new VCS tests.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/tool-execute.ts tests/hooks/tool-execute.test.ts
git commit -m "feat(hooks): wire VCS operation detection and metric recording"
```

---

### Task 5: Full Verification and Cleanup

**Files:**
- None modified — verification only.

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass. Note total test count increase.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Build succeeds, `dist/` updated.

- [ ] **Step 4: Verify file sizes**

Check that `src/utils/vcs-detect.ts` is under 200 lines and `src/hooks/tool-execute.ts` didn't grow significantly:

```bash
wc -l src/utils/vcs-detect.ts src/hooks/tool-execute.ts
```

Expected: `vcs-detect.ts` ~70-80 lines, `tool-execute.ts` ~260 lines (was 253 + ~7 added).

- [ ] **Step 5: Final commit if any cleanup needed**

If all checks pass, no commit needed. If minor issues found, fix and commit.
