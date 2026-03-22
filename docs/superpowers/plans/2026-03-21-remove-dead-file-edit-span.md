# Remove dead `file_edit` span, move `code.language` to `execute_tool edit` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead `session.diff`/`file_edit` span code and add `code.language` attribute to `execute_tool edit` spans.

**Architecture:** Delete the `session.diff` event handler, `startFileEditSpan()`, `extractFileChanges()`, and `FileChangeStats` type. Add language detection in the `tool.execute.after` hook for `edit` tools. Update tests and documentation.

**Tech Stack:** TypeScript, bun:test, OpenTelemetry API

---

### Task 1: Remove `startFileEditSpan` and update tests

**Files:**
- Modify: `src/signals/spans.ts:51-80` (delete `startFileEditSpan` function)
- Modify: `src/signals/index.ts:7` (remove `startFileEditSpan` from export)
- Modify: `tests/signals/spans.test.ts:12,87-107` (remove import and test block)

- [ ] **Step 1: Remove `startFileEditSpan` from `src/signals/spans.ts`**

Delete lines 51-80 (the entire `startFileEditSpan` function). The file should go from `startToolSpan` ending at line 49 directly to `startCompactionSpan`.

- [ ] **Step 2: Remove `startFileEditSpan` from barrel export in `src/signals/index.ts`**

Change:
```typescript
export {
  startSessionSpan,
  startChatSpan,
  startToolSpan,
  startFileEditSpan,
  startCompactionSpan,
} from "./spans"
```
To:
```typescript
export {
  startSessionSpan,
  startChatSpan,
  startToolSpan,
  startCompactionSpan,
} from "./spans"
```

- [ ] **Step 3: Remove `startFileEditSpan` import and test block from `tests/signals/spans.test.ts`**

Remove `startFileEditSpan` from the import on line 12. Delete the entire `describe("startFileEditSpan", ...)` block (lines 87-107).

- [ ] **Step 4: Run tests to verify nothing breaks**

Run: `bun test tests/signals/spans.test.ts`
Expected: All remaining span tests pass (session, chat, tool, compaction).

- [ ] **Step 5: Commit**

```bash
git add src/signals/spans.ts src/signals/index.ts tests/signals/spans.test.ts
git commit -m "refactor: remove dead startFileEditSpan function and tests"
```

---

### Task 2: Remove `session.diff` handler and `extractFileChanges`

**Files:**
- Modify: `src/hooks/event.ts:4-5,66-97` (remove imports and `session.diff` case)
- Delete: `src/utils/diff.ts` (entire file)
- Modify: `src/utils/index.ts:2` (remove `extractFileChanges` export)
- Delete: `tests/utils/diff.test.ts` (entire file)
- Modify: `src/types.ts:22-28` (remove `FileChangeStats` type)

- [ ] **Step 1: Remove `session.diff` case from `src/hooks/event.ts`**

Delete lines 66-97 (the entire `case "session.diff"` block). Also remove these imports that are no longer needed:
- Line 4: remove `startFileEditSpan` from the import (keep `startSessionSpan` and `startCompactionSpan`)
- Line 5: delete entirely (`import { extractFileChanges } from "../utils/diff"`)
- Line 2: remove `FileChangeStats` from the type import (keep `PluginState`)

- [ ] **Step 2: Remove `FileChangeStats` type from `src/types.ts`**

Delete lines 22-28:
```typescript
/** Accumulated file change stats from session.diff events. */
export interface FileChangeStats {
  linesAdded: number
  linesRemoved: number
  filepath: string
  language: string
}
```

- [ ] **Step 3: Delete `src/utils/diff.ts` entirely**

```bash
rm src/utils/diff.ts
```

- [ ] **Step 4: Remove `extractFileChanges` from `src/utils/index.ts`**

Change:
```typescript
export { detectLanguage } from "./language"
export { extractFileChanges } from "./diff"
export { getGitAuthor, getRepoUrl, getCurrentBranch, getHostname } from "./git"
export { truncate } from "./truncate"
```
To:
```typescript
export { detectLanguage } from "./language"
export { getGitAuthor, getRepoUrl, getCurrentBranch, getHostname } from "./git"
export { truncate } from "./truncate"
```

- [ ] **Step 5: Delete `tests/utils/diff.test.ts` entirely**

```bash
rm tests/utils/diff.test.ts
```

- [ ] **Step 6: Run full test suite**

Run: `bun test`
Expected: All tests pass. Test count drops (removed diff tests + file edit span test).

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: Clean — no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove dead session.diff handler, extractFileChanges, and FileChangeStats"
```

---

### Task 3: Add `code.language` to `execute_tool edit` spans

**Files:**
- Modify: `src/hooks/tool-execute.ts:1,100-126` (add detectLanguage import, add attribute in `after`)

- [ ] **Step 1: Add `detectLanguage` import to `src/hooks/tool-execute.ts`**

Add after the existing `truncate` import (line 5):
```typescript
import { detectLanguage } from "../utils/language"
```

- [ ] **Step 2: Add `code.language` attribute in the `after` function**

In the `after` function, inside the `if (entry)` block, add this **before** `entry.span.end()` (line 123) and **after** the metadata handling block (line 122):

```typescript
      if (input.tool === "edit" && output.metadata && typeof output.metadata === "object") {
        const filepath = (output.metadata as Record<string, unknown>).path
          ?? (output.metadata as Record<string, unknown>).file
        if (typeof filepath === "string") {
          entry.span.setAttribute("code.language", truncate(detectLanguage(filepath)))
        }
      }
```

- [ ] **Step 3: Run tests and typecheck**

Run: `bun test && bun run typecheck`
Expected: All tests pass, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/tool-execute.ts
git commit -m "feat: add code.language attribute to execute_tool edit spans"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `README.md:56-62,124-128` (remove file_edit from trace tree and traces table)
- Modify: `AGENTS.md` (update span hierarchy, module layout notes)

- [ ] **Step 1: Update `README.md` trace tree example**

Change the trace tree (around lines 56-62) from:
```
invoke_agent opencode                    ← root span (session)
├── chat claude-sonnet-4-20250514            ← LLM request
├── execute_tool file_edit               ← tool call
├── execute_tool bash                    ← tool call
├── file_edit src/index.ts               ← file change
└── session_compaction                   ← context compaction
```
To:
```
invoke_agent opencode                    ← root span (session)
├── chat claude-sonnet-4-20250514            ← LLM request
├── execute_tool edit                    ← tool call (includes code.language)
├── execute_tool bash                    ← tool call
└── session_compaction                   ← context compaction
```

- [ ] **Step 2: Update `README.md` Traces table**

Remove the `file_edit {path}` row from the table (around line 127):
```
| `file_edit {path}` | File change | `code.filepath`, `code.language`, `opencode.file.lines_added`, `opencode.file.lines_removed` |
```

Update the `execute_tool {name}` row to mention `code.language`:
```
| `execute_tool {name}` | Tool call | `gen_ai.tool.name`, `gen_ai.tool.call.id`, `code.language` (edit tool) |
```

- [ ] **Step 3: Update `AGENTS.md` span hierarchy**

Change the span hierarchy to remove `file_edit`:
```
invoke_agent opencode           (root, per session)
├── chat {model}                (child, per LLM request)
├── execute_tool {tool_name}    (child, per tool call; edit tool includes code.language)
└── session_compaction          (child, per compaction)
```

- [ ] **Step 4: Build to verify bundle**

Run: `bun run build`
Expected: Build succeeds. Bundle size should be slightly smaller (removed dead code).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update README and AGENTS.md to reflect file_edit span removal"
```
