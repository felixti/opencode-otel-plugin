import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startToolSpan } from "../signals/spans"

interface ToolExecuteHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
}

function setMetadataAttributes(
  span: import("@opentelemetry/api").Span,
  prefix: string,
  value: unknown,
): void {
  if (value === undefined || value === null) return
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    span.setAttribute(prefix, value)
    return
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      setMetadataAttributes(span, `${prefix}.${key}`, nested)
    }
  }
}

export function createToolExecuteHooks(deps: ToolExecuteHookDeps) {
  const { tracer, instruments, state } = deps

  const before = async (
    input: { tool: string; sessionID: string; callID: string },
    _output: { args: any },
  ) => {
    const session = state.sessionSpans.get(input.sessionID)
    const span = startToolSpan(tracer, {
      toolName: input.tool,
      callID: input.callID,
      sessionID: input.sessionID,
      branch: state.currentBranch,
    }, session?.context)
    state.toolSpans.set(input.callID, span)

    instruments.toolInvocations.add(1, {
      "gen_ai.tool.name": input.tool,
    })
  }

  const after = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown },
  ) => {
    const span = state.toolSpans.get(input.callID)
    if (span) {
      span.setAttribute("gen_ai.tool.output.title", output.title)
      if (output.metadata && typeof output.metadata === "object") {
        for (const [key, value] of Object.entries(output.metadata as Record<string, unknown>)) {
          setMetadataAttributes(span, `gen_ai.tool.output.metadata.${key}`, value)
        }
      }
      span.end()
      state.toolSpans.delete(input.callID)
    }
  }

  return { before, after }
}
