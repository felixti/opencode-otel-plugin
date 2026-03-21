import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startToolSpan } from "../signals/spans"

interface ToolExecuteHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
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
    }, session?.context)
    state.toolSpans.set(input.callID, span)

    instruments.toolInvocations.add(1, {
      "gen_ai.tool.name": input.tool,
    })
  }

  const after = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: any },
  ) => {
    const span = state.toolSpans.get(input.callID)
    if (span) {
      span.setAttribute("gen_ai.tool.output.title", output.title)
      span.end()
      state.toolSpans.delete(input.callID)
    }
  }

  return { before, after }
}
