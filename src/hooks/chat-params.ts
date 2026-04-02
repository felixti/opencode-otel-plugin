import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startChatSpan } from "../signals/spans"
import { truncate } from "../utils/truncate"

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

    await state.gitReady
    const session = state.sessionSpans.get(sessionID)
    const span = startChatSpan(tracer, {
      model: modelID,
      provider: providerID,
      sessionID,
      branch: state.currentBranch,
    }, session?.context)

    state.pendingChatRequests.set(sessionID, {
      model: modelID,
      provider: providerID,
      startTime: Date.now(),
    })

    if (state.gitAuthor) span.setAttribute("enduser.id", truncate(state.gitAuthor))
    if (state.gitAuthor) span.setAttribute("host.user.email", truncate(state.gitAuthor))
    if (state.repoUrl) span.setAttribute("vcs.repository.url.full", truncate(state.repoUrl))

    instruments.requestCount.add(1, {
      "gen_ai.request.model": truncate(modelID),
      "gen_ai.provider.name": truncate(providerID),
      ...(state.gitAuthor ? { "host.user.email": truncate(state.gitAuthor) } : {}),
    })

    if (session) {
      session.requestCount++
      session.lastActivityAt = Date.now()
    }

    state.toolSpans.set(`chat:${sessionID}`, {
      span,
      sessionID,
      createdAt: Date.now(),
    })
  }
}
