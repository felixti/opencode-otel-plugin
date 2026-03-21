import type { AssistantMessage } from "@opencode-ai/sdk"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { shutdownProviders } from "../telemetry/shutdown"
import type { Providers } from "../telemetry/provider"

export function handleMessageUpdated(
  msg: AssistantMessage,
  state: PluginState,
  instruments: MetricInstruments,
): void {
  const sessionID = msg.sessionID
  const chatSpan = state.toolSpans.get(`chat:${sessionID}`)
  const chatReq = state.pendingChatRequests.get(sessionID)
  if (!chatSpan || !chatReq) return

  // Only end the chat span when token usage is actually available.
  // message.updated fires multiple times; wait for the one with tokens.
  const tokens = msg.tokens
  if (!tokens || (tokens.input == null && tokens.output == null)) return

  const inputTokens = tokens.input
  const outputTokens = tokens.output
  const errorType = msg.error?.name

  if (inputTokens != null) {
    chatSpan.setAttribute("gen_ai.usage.input_tokens", inputTokens)
  }
  if (outputTokens != null) {
    chatSpan.setAttribute("gen_ai.usage.output_tokens", outputTokens)
  }
  chatSpan.setAttribute("gen_ai.response.model", chatReq.model)
  if (msg.finish) {
    chatSpan.setAttribute("gen_ai.response.finish_reasons", [msg.finish])
  }
  if (errorType) {
    chatSpan.setAttribute("error.type", errorType)
    chatSpan.setStatus({ code: 2, message: errorType })
  }
  chatSpan.end()
  state.toolSpans.delete(`chat:${sessionID}`)

  const durationS = (Date.now() - chatReq.startTime) / 1000
  const metricAttrs = {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": chatReq.provider,
    "gen_ai.request.model": chatReq.model,
  }
  if (inputTokens != null) {
    instruments.tokenUsage.record(inputTokens, {
      ...metricAttrs,
      "gen_ai.token.type": "input",
    })
  }
  if (outputTokens != null) {
    instruments.tokenUsage.record(outputTokens, {
      ...metricAttrs,
      "gen_ai.token.type": "output",
    })
  }
  instruments.operationDuration.record(durationS, {
    ...metricAttrs,
    ...(errorType ? { "error.type": errorType } : {}),
  })

  state.pendingChatRequests.delete(sessionID)
}

export function handleSessionError(
  event: { properties: { sessionID?: string; error?: { name?: string } } },
  state: PluginState,
  instruments: MetricInstruments,
): void {
  const sessionID = event.properties.sessionID
  if (!sessionID) return

  const chatSpan = state.toolSpans.get(`chat:${sessionID}`)
  const chatReq = state.pendingChatRequests.get(sessionID)
  if (!chatSpan || !chatReq) return

  const errorType = event.properties.error?.name ?? "UnknownError"
  chatSpan.setAttribute("error.type", errorType)
  chatSpan.setStatus({ code: 2, message: errorType })
  chatSpan.end()
  state.toolSpans.delete(`chat:${sessionID}`)

  const durationS = (Date.now() - chatReq.startTime) / 1000
  instruments.operationDuration.record(durationS, {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": chatReq.provider,
    "gen_ai.request.model": chatReq.model,
    "error.type": errorType,
  })

  state.pendingChatRequests.delete(sessionID)
}

export async function handleServerDisposed(
  state: PluginState,
  providers: Providers,
): Promise<void> {
  for (const session of state.sessionSpans.values()) {
    session.span.end()
  }
  state.sessionSpans.clear()
  for (const span of state.toolSpans.values()) {
    span.end()
  }
  state.toolSpans.clear()
  state.pendingChatRequests.clear()
  await shutdownProviders(providers)
}
