# VCS Operations Metric

Track git commits and pull request mutations performed by OpenCode sessions.

## Problem

The plugin tracks tool invocations, token usage, and file changes, but has no visibility into version control operations. When the AI creates commits or opens/merges PRs, those actions are invisible to observability backends. Teams need to answer: "How many commits and PRs did the AI produce this week?"

## Decisions

- **One counter with attributes** over separate counters — extensible, single metric to query.
- **Mutations only** for PRs — create, merge, close, reopen, review, edit. Read operations (list, view, search) excluded to reduce noise.
- **Strict git commit only** — `git commit` and `git commit --amend`. No cherry-pick, revert, or merge.
- **Detection in `tool.execute.after`** — counts completed operations only, not attempted ones.
- **Approach B** — separate `src/utils/vcs-detect.ts` utility keeps `tool-execute.ts` under 200 lines and makes detection logic independently testable.

## Metric Definition

| Field | Value |
|---|---|
| Name | `opencode.vcs.operations` |
| Type | Counter |
| Unit | `{operation}` |
| Description | VCS operations (commits, PR mutations) performed during sessions |

### Attribute: `opencode.vcs.operation`

Low-cardinality enum identifying the operation type:

| Value | Trigger |
|---|---|
| `commit` | `git commit` or `git commit --amend` via bash tool |
| `pr_create` | `gh pr create` via bash, or MCP tool matching `*create_pull_request*` (excluding `*copilot*`) |
| `pr_merge` | `gh pr merge` via bash, or MCP tool matching `*merge_pull_request*` |
| `pr_close` | `gh pr close` via bash (no known MCP equivalent) |
| `pr_reopen` | `gh pr reopen` via bash (no known MCP equivalent) |
| `pr_review` | `gh pr review` via bash, or MCP tool matching `*pull_request_review*` |
| `pr_edit` | `gh pr edit` via bash, or MCP tool matching `*update_pull_request` (not `*update_pull_request_branch*`) |

### Attribute: `opencode.vcs.source`

Identifies how the operation was performed:

| Value | Meaning |
|---|---|
| `cli` | Detected from bash tool command string (`git`, `gh`) |
| `mcp` | Detected from MCP tool name |

## Detection Module

### New file: `src/utils/vcs-detect.ts`

Pure function, no side effects, no state:

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

export function classifyVcsOperation(
  tool: string,
  args?: unknown,
): VcsDetectionResult | null
```

### Detection logic

**Fast path:** If `tool` is not `"bash"` and does not contain `"pull_request"`, return `null` immediately. This covers the vast majority of tool calls with zero overhead.

**Bash tool detection:** Extract `args.command` as string. Match against patterns:

| Pattern | Result |
|---|---|
| `/(?:^&#124;&&\s*&#124;;\s*)git\s+commit\b/` | `commit` |
| `/(?:^&#124;&&\s*&#124;;\s*)gh\s+pr\s+create\b/` | `pr_create` |
| `/(?:^&#124;&&\s*&#124;;\s*)gh\s+pr\s+merge\b/` | `pr_merge` |
| `/(?:^&#124;&&\s*&#124;;\s*)gh\s+pr\s+close\b/` | `pr_close` |
| `/(?:^&#124;&&\s*&#124;;\s*)gh\s+pr\s+reopen\b/` | `pr_reopen` |
| `/(?:^&#124;&&\s*&#124;;\s*)gh\s+pr\s+review\b/` | `pr_review` |
| `/(?:^&#124;&&\s*&#124;;\s*)gh\s+pr\s+edit\b/` | `pr_edit` |

Returns the **first match** — a command like `git commit && gh pr create` returns `commit`. This is acceptable: each command in a chain triggers its own tool call in practice.

**MCP tool detection:** Match `tool` string (case-insensitive substring):

| Contains | Result | Guard |
|---|---|---|
| `create_pull_request` | `pr_create` | Must not contain `copilot` |
| `merge_pull_request` | `pr_merge` | — |
| `pull_request_review` | `pr_review` | — |
| `update_pull_request` | `pr_edit` | Must not contain `branch` |

Order matters — check `merge_pull_request` and `pull_request_review` before generic `pull_request` patterns.

## Integration Point

### `src/hooks/tool-execute.ts` — `after` function

Add ~5 lines after existing metadata/file-change handling:

```typescript
import { classifyVcsOperation } from "../utils/vcs-detect"

// ... in after(), after existing metadata handling:
const vcsResult = classifyVcsOperation(input.tool, input.args)
if (vcsResult) {
  instruments.vcsOperations.add(1, {
    "opencode.vcs.operation": vcsResult.operation,
    "opencode.vcs.source": vcsResult.source,
  })
}
```

### `src/signals/metrics.ts`

Add to `MetricInstruments` interface:

```typescript
vcsOperations: Counter
```

Add to `createMetricInstruments` factory:

```typescript
vcsOperations: meter.createCounter("opencode.vcs.operations", {
  description: "VCS operations (commits, PR mutations) performed during sessions",
  unit: "{operation}",
})
```

### `src/utils/index.ts`

Re-export:

```typescript
export { classifyVcsOperation, type VcsOperation, type VcsDetectionResult } from "./vcs-detect"
```

## Files Changed

| File | Change | Lines |
|---|---|---|
| `src/utils/vcs-detect.ts` | **New** — detection function + types | ~80 |
| `src/utils/index.ts` | Add re-export | ~1 |
| `src/signals/metrics.ts` | Add `vcsOperations` to interface + factory | ~5 |
| `src/hooks/tool-execute.ts` | Import + call classify + record metric | ~5 |
| `tests/utils/vcs-detect.test.ts` | **New** — unit tests for detection | ~120 |
| `tests/hooks/tool-execute.test.ts` | Add VCS metric integration tests | ~30 |

No changes to `PluginState`, `types.ts`, or shutdown logic — this is purely additive.

## Test Plan

### Unit tests (`tests/utils/vcs-detect.test.ts`)

**Git commit detection:**
- `git commit -m "msg"` returns `{ operation: "commit", source: "cli" }`
- `git commit --amend` returns `{ operation: "commit", source: "cli" }`
- `git add . && git commit -m "msg"` returns `{ operation: "commit", source: "cli" }`
- `GIT_AUTHOR_NAME=x git commit -m "msg"` returns `{ operation: "commit", source: "cli" }`

**PR CLI detection:**
- `gh pr create --title "t"` returns `{ operation: "pr_create", source: "cli" }`
- `gh pr merge 123` returns `{ operation: "pr_merge", source: "cli" }`
- `gh pr close 123` returns `{ operation: "pr_close", source: "cli" }`
- `gh pr reopen 123` returns `{ operation: "pr_reopen", source: "cli" }`
- `gh pr review --approve` returns `{ operation: "pr_review", source: "cli" }`
- `gh pr edit 123 --title "new"` returns `{ operation: "pr_edit", source: "cli" }`

**MCP tool detection:**
- `mcp__github__create_pull_request` returns `{ operation: "pr_create", source: "mcp" }`
- `mcp__github__merge_pull_request` returns `{ operation: "pr_merge", source: "mcp" }`
- `mcp__github__pull_request_review_write` returns `{ operation: "pr_review", source: "mcp" }`
- `mcp__github__update_pull_request` returns `{ operation: "pr_edit", source: "mcp" }`
- `mcp__github__update_pull_request_branch` returns `null` (branch update, not PR edit)
- `mcp__github__create_pull_request_with_copilot` returns `null` (copilot action, not direct PR create)

**Non-VCS tools return null:**
- `edit` tool returns `null`
- `bash` with `git push` returns `null`
- `bash` with `echo "git commit"` returns `null` (accepted false-negative risk)
- `bash` with no args returns `null`
- `mcp__github__list_pull_requests` returns `null` (read operation)

### Integration tests (`tests/hooks/tool-execute.test.ts`)

- Bash tool with `git commit -m "msg"` records `opencode.vcs.operations` with `commit` + `cli`
- MCP tool `*create_pull_request*` records `opencode.vcs.operations` with `pr_create` + `mcp`
- Non-VCS bash tool does not record `opencode.vcs.operations`

## Edge Cases

- **Chained commands:** `git add . && git commit -m "msg"` — regex handles `&&` separator. Each chain segment is checked.
- **Environment prefixes:** `ENV=val git commit` — regex allows arbitrary prefix before `git`.
- **Quoted strings:** `echo "git commit"` — will NOT match because regex anchors on command boundaries. Accepted false-negative.
- **Unknown MCP prefix:** Flexible substring matching handles any prefix format (double-underscore, single-underscore, no prefix).
- **Tool names change:** If MCP server renames tools, substring matching is more resilient than exact matching. Only a complete rename away from `pull_request` terminology would break detection.
