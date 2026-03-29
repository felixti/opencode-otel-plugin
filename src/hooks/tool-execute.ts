import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startToolSpan } from "../signals/spans"
import { truncate } from "../utils/truncate"
import { detectLanguage } from "../utils/language"
import { classifyVcsOperation } from "../utils/vcs-detect"

interface ToolExecuteHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
}

function setMetadataAttributes(
  span: import("@opentelemetry/api").Span,
  prefix: string,
  value: unknown,
  depth = 0,
  keyCount = { count: 0 },
): void {
  if (depth > 3) return
  if (keyCount.count >= 32) return
  if (value === undefined || value === null) return
  if (typeof value === "string") {
    span.setAttribute(prefix, truncate(value))
    keyCount.count++
    return
  }
  if (typeof value === "number" || typeof value === "boolean") {
    span.setAttribute(prefix, value)
    keyCount.count++
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return
    let result = ""
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") return
      const remaining = 256 - result.length
      if (remaining <= 0) break
      const raw = String(item)
      const prefix_str = i === 0 ? "" : ","
      const budget = remaining - prefix_str.length
      if (budget <= 0) break
      if (raw.length > budget) {
        const truncated = raw.slice(0, Math.max(0, budget - 1))
        result += prefix_str + truncated
        span.setAttribute(prefix, truncate(`${result}…`))
        keyCount.count++
        return
      }
      result += prefix_str + raw
    }
    span.setAttribute(prefix, truncate(result))
    keyCount.count++
    return
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    for (const key in obj) {
      if (keyCount.count >= 32) break
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        setMetadataAttributes(span, `${prefix}.${key}`, obj[key], depth + 1, keyCount)
      }
    }
  }
}

/** Extract file path from tool metadata, checking common locations. */
function resolveFilepath(meta: Record<string, unknown>): string | undefined {
  if (typeof meta.path === "string") return meta.path
  if (typeof meta.file === "string") return meta.file
  if (typeof meta.filepath === "string") return meta.filepath
  const filediff = meta.filediff
  if (filediff && typeof filediff === "object") {
    const fd = filediff as Record<string, unknown>
    if (typeof fd.file === "string") return fd.file
  }
  const files = meta.files
  if (Array.isArray(files) && files.length > 0) {
    const first = files[0]
    if (first && typeof first === "object") {
      const f = first as Record<string, unknown>
      if (typeof f.filePath === "string") return f.filePath
    }
  }
  return undefined
}

/** Count lines in a string by counting newline characters. */
function countLines(content: string): number {
  if (content.length === 0) return 0
  let count = 0
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) count++
  }
  // If content doesn't end with a newline, the last line still counts
  if (content.charCodeAt(content.length - 1) !== 10) count++
  return count
}

interface FileChangeTotals {
  additions: number
  deletions: number
}

/** Record file change metrics and return totals for span attributes. */
function recordFileChanges(
  instruments: MetricInstruments,
  tool: string,
  meta: Record<string, unknown>,
  args?: unknown,
): FileChangeTotals {
  const totals: FileChangeTotals = { additions: 0, deletions: 0 }

  if (tool === "apply_patch") {
    const files = meta.files
    if (!Array.isArray(files)) return totals
    for (const file of files) {
      if (!file || typeof file !== "object") continue
      const f = file as Record<string, unknown>
      const filePath = typeof f.filePath === "string" ? f.filePath : undefined
      const language = filePath ? truncate(detectLanguage(filePath)) : undefined
      const attrs: Record<string, string> = {}
      if (language && language !== "unknown") attrs["code.language"] = language
      const add = typeof f.additions === "number" ? f.additions : 0
      const del = typeof f.deletions === "number" ? f.deletions : 0
      totals.additions += add
      totals.deletions += del
      if (add > 0) {
        instruments.fileChanges.add(add, { ...attrs, "opencode.change.type": "added" })
      }
      if (del > 0) {
        instruments.fileChanges.add(del, { ...attrs, "opencode.change.type": "removed" })
      }
    }
    return totals
  }

  if (tool === "edit") {
    const filediff = meta.filediff
    if (filediff && typeof filediff === "object") {
      const fd = filediff as Record<string, unknown>
      if (typeof fd.additions === "number") totals.additions = fd.additions
      if (typeof fd.deletions === "number") totals.deletions = fd.deletions
    }
    if (totals.additions === 0 && totals.deletions === 0) {
      if (typeof meta.additions === "number") totals.additions = meta.additions
      if (typeof meta.removals === "number") totals.deletions = meta.removals
    }
  } else if (tool === "write") {
    if (typeof meta.additions === "number") totals.additions = meta.additions
    if (typeof meta.removals === "number") totals.deletions = meta.removals
    // Write tool metadata may lack additions/removals — compute from args.content
    if (totals.additions === 0 && totals.deletions === 0 && args && typeof args === "object") {
      const a = args as Record<string, unknown>
      if (typeof a.content === "string" && a.content.length > 0) {
        totals.additions = countLines(a.content)
      }
    }
  }

  if (totals.additions === 0 && totals.deletions === 0) return totals

  const filepath = resolveFilepath(meta)
  const language = filepath ? truncate(detectLanguage(filepath)) : undefined
  const attrs: Record<string, string> = {}
  if (language && language !== "unknown") attrs["code.language"] = language

  if (totals.additions > 0) {
    instruments.fileChanges.add(totals.additions, { ...attrs, "opencode.change.type": "added" })
  }
  if (totals.deletions > 0) {
    instruments.fileChanges.add(totals.deletions, { ...attrs, "opencode.change.type": "removed" })
  }
  return totals
}

export function createToolExecuteHooks(deps: ToolExecuteHookDeps) {
  const { tracer, instruments, state } = deps

  const before = async (
    input: { tool: string; sessionID: string; callID: string },
    _output: { args: any },
  ) => {
    // Filtered tools skip span creation but still record metrics
    if (state.filteredTools.has(input.tool)) {
      instruments.toolInvocations.add(1, {
        "gen_ai.tool.name": truncate(input.tool),
      })
      return
    }

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

  const after = async (
    input: { tool: string; sessionID: string; callID: string; args?: unknown },
    output: { title: string; output: string; metadata: unknown },
  ) => {
    const entry = state.toolSpans.get(input.callID)
    if (entry) {
      entry.span.setAttribute("gen_ai.tool.output.title", truncate(output.title))
      if (output.metadata && typeof output.metadata === "object") {
        const meta = output.metadata as Record<string, unknown>
        const keyCount = { count: 0 }
        for (const key in meta) {
          if (keyCount.count >= 32) break
          if (Object.prototype.hasOwnProperty.call(meta, key)) {
            setMetadataAttributes(
              entry.span,
              `gen_ai.tool.output.metadata.${key}`,
              meta[key],
              0,
              keyCount,
            )
          }
        }
        if (input.tool === "edit" || input.tool === "write" || input.tool === "apply_patch") {
          const filepath = resolveFilepath(meta)
          if (filepath) {
            entry.span.setAttribute("code.language", truncate(detectLanguage(filepath)))
          }
          const totals = recordFileChanges(instruments, input.tool, meta, input.args)
          if (totals.additions > 0) {
            entry.span.setAttribute("opencode.file.additions", totals.additions)
          }
          if (totals.deletions > 0) {
            entry.span.setAttribute("opencode.file.deletions", totals.deletions)
          }
        }
      }
      entry.span.end()
      state.toolSpans.delete(input.callID)
    }

    // VCS metric is independent of span lifecycle — record even if entry was
    // already cleaned up by session.idle or the before hook never ran.
    const vcsResult = classifyVcsOperation(input.tool, input.args)
    if (vcsResult) {
      const attrs: Record<string, string> = {
        "opencode.vcs.operation": vcsResult.operation,
        "opencode.vcs.source": vcsResult.source,
      }
      if (state.repoUrl) {
        attrs["vcs.repository.url.full"] = truncate(state.repoUrl)
      }
      if (state.currentBranch) {
        attrs["vcs.repository.ref.name"] = truncate(state.currentBranch)
      }
      instruments.vcsOperations.add(1, attrs)
    }
  }

  return { before, after }
}
