import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startToolSpan } from "../signals/spans"
import { truncate } from "../utils/truncate"
import { detectLanguage } from "../utils/language"

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

export function createToolExecuteHooks(deps: ToolExecuteHookDeps) {
  const { tracer, instruments, state } = deps

  const before = async (
    input: { tool: string; sessionID: string; callID: string },
    _output: { args: any },
  ) => {
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
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown },
  ) => {
    const entry = state.toolSpans.get(input.callID)
    if (entry) {
      entry.span.setAttribute("gen_ai.tool.output.title", truncate(output.title))
      if (output.metadata && typeof output.metadata === "object") {
        const keyCount = { count: 0 }
        const meta = output.metadata as Record<string, unknown>
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
      }
      if (input.tool === "edit" && output.metadata && typeof output.metadata === "object") {
        const filepath = (output.metadata as Record<string, unknown>).path
          ?? (output.metadata as Record<string, unknown>).file
        if (typeof filepath === "string") {
          entry.span.setAttribute("code.language", truncate(detectLanguage(filepath)))
        }
      }
      entry.span.end()
      state.toolSpans.delete(input.callID)
    }
  }

  return { before, after }
}
