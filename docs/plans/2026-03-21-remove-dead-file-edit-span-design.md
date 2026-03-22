# Remove dead `file_edit` span, move `code.language` to `execute_tool edit`

**Date**: 2026-03-21
**Status**: Approved

## Problem

The `session.diff` event is defined in the OpenCode SDK but never fires in practice (confirmed via Jaeger traces). This means:

- `startFileEditSpan()` is never called
- `code.language` attribute is never set on any span
- `extractFileChanges()` is never called
- `FileChangeStats` type is unused
- `opencode.file.changes` metric is never recorded

This is dead code that increases maintenance surface and bundle size for zero value.

Meanwhile, the `edit` tool (invoked via `tool.execute.before`/`tool.execute.after`) is the real mechanism for file edits, and its spans lack a `code.language` attribute.

## Decision

**Approach A**: Detect language in `tool.execute.after` from `output.metadata`, set `code.language` on the `execute_tool edit` span before ending it.

Chosen over Approach B (detect in `before` from args) because the `after` hook has the full output context including the filepath that was actually edited.

## Removals

| What | Where | Reason |
|---|---|---|
| `session.diff` case handler | `src/hooks/event.ts` | Never fires |
| `startFileEditSpan()` function | `src/signals/spans.ts` | Only caller removed |
| `startFileEditSpan` export | `src/signals/index.ts` | Function removed |
| `startFileEditSpan` import | `src/hooks/event.ts` | Function removed |
| `FileChangeStats` type | `src/types.ts` | Only consumer removed |
| `extractFileChanges()` function | `src/utils/diff.ts` | Only caller removed |
| `extractFileChanges` export | `src/utils/index.ts` | Function removed |
| `diff.ts` import in event.ts | `src/hooks/event.ts` | Module removed |
| `startFileEditSpan` test block | `tests/signals/spans.test.ts` | Tests deleted function |
| `tests/utils/diff.test.ts` | entire file | Tests deleted function |

### Survivors

- `detectLanguage()` in `src/utils/language.ts` — reused in the new location
- `opencode.file.changes` metric instrument in `metrics.ts` — removing the instrument definition would be a separate breaking change; left intact
- `tests/utils/language.test.ts` — still valid

## Addition

In `src/hooks/tool-execute.ts`, in the `after` function, when `input.tool === "edit"`:

```typescript
if (input.tool === "edit" && output.metadata && typeof output.metadata === "object") {
  const filepath = (output.metadata as Record<string, unknown>).path
    ?? (output.metadata as Record<string, unknown>).file
  if (typeof filepath === "string") {
    entry.span.setAttribute("code.language", truncate(detectLanguage(filepath)))
  }
}
```

## Documentation updates

- `README.md`: Remove `file_edit {path}` row from Traces table, remove `file_edit src/index.ts` from trace tree
- `AGENTS.md`: Update span hierarchy, module descriptions
- `src/signals/AGENTS.md`: Remove `startFileEditSpan` from spans table
- `src/hooks/AGENTS.md`: Remove `session.diff` reference, add `code.language` note to tool-execute
