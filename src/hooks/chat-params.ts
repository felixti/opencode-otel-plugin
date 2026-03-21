import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startChatSpan } from "../signals/spans"

interface ChatParamsHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
}

export function createChatParamsHook(deps: ChatParamsHookDeps) {
  const { tracer, instruments, state } = deps

  return async (
    input: { sessionID: string; agent: string; model: any; provider: any; message: any },
    output: { temperature: number; topP: number; topK: number; options: Record<string, any> },
  ) => {
    const modelID = input.model?.id ?? input.model?.modelID ?? "unknown"
    const providerID = input.provider?.id ?? input.provider?.providerID ?? "unknown"
    const sessionID = input.sessionID

    const session = state.sessionSpans.get(sessionID)
    const span = startChatSpan(tracer, {
      model: modelID,
      provider: providerID,
      sessionID,
    }, session?.context)

    state.pendingChatRequests.set(sessionID, {
      model: modelID,
      provider: providerID,
      startTime: Date.now(),
    })

    instruments.requestCount.add(1, {
      "gen_ai.request.model": modelID,
      "gen_ai.provider.name": providerID,
      "gen_ai.conversation.id": sessionID,
    })

    if (session) {
      session.requestCount++
    }

    state.toolSpans.set(`chat:${sessionID}`, span)
  }
}
