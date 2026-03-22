import type { AssistantMessage } from "@opencode-ai/sdk"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { shutdownProviders } from "../telemetry/shutdown"
import type { Providers } from "../telemetry/provider"
import { truncate } from "../utils/truncate"

export function handleMessageUpdated(
  msg: AssistantMessage,
  state: PluginState,
  instruments: MetricInstruments,
): void {
  const sessionID = msg.sessionID
  const session = state.sessionSpans.get(sessionID)
  if (session) session.lastActivityAt = Date.now()
  const chatEntry = state.toolSpans.get(`chat:${sessionID}`)
  const chatReq = state.pendingChatRequests.get(sessionID)
  if (!chatEntry || !chatReq) return

  // Only end the chat span when token usage is actually available.
  // message.updated fires multiple times; wait for the one with tokens.
  const tokens = msg.tokens
  if (!tokens || (tokens.input == null && tokens.output == null)) return

  const inputTokens = tokens.input
  const outputTokens = tokens.output
  const errorType = msg.error?.name

  if (inputTokens != null) {
    chatEntry.span.setAttribute("gen_ai.usage.input_tokens", inputTokens)
  }
  if (outputTokens != null) {
    chatEntry.span.setAttribute("gen_ai.usage.output_tokens", outputTokens)
  }
  chatEntry.span.setAttribute("gen_ai.response.model", truncate(chatReq.model))
  if (msg.finish) {
    chatEntry.span.setAttribute("gen_ai.response.finish_reasons", [truncate(msg.finish)])
  }
  if (errorType) {
    chatEntry.span.setAttribute("error.type", truncate(errorType))
    chatEntry.span.setStatus({ code: 2, message: truncate(errorType) })
  }
  chatEntry.span.end()
  state.toolSpans.delete(`chat:${sessionID}`)

  const durationS = (Date.now() - chatReq.startTime) / 1000
  if (inputTokens != null) {
    instruments.tokenUsage.record(inputTokens, {
      "gen_ai.operation.name": truncate("chat"),
      "gen_ai.provider.name": truncate(chatReq.provider),
      "gen_ai.request.model": truncate(chatReq.model),
      "gen_ai.token.type": truncate("input"),
    })
  }
  if (outputTokens != null) {
    instruments.tokenUsage.record(outputTokens, {
      "gen_ai.operation.name": truncate("chat"),
      "gen_ai.provider.name": truncate(chatReq.provider),
      "gen_ai.request.model": truncate(chatReq.model),
      "gen_ai.token.type": truncate("output"),
    })
  }
  if (errorType) {
    instruments.operationDuration.record(durationS, {
      "gen_ai.operation.name": truncate("chat"),
      "gen_ai.provider.name": truncate(chatReq.provider),
      "gen_ai.request.model": truncate(chatReq.model),
      "error.type": truncate(errorType),
    })
  } else {
    instruments.operationDuration.record(durationS, {
      "gen_ai.operation.name": truncate("chat"),
      "gen_ai.provider.name": truncate(chatReq.provider),
      "gen_ai.request.model": truncate(chatReq.model),
    })
  }

  state.pendingChatRequests.delete(sessionID)
}

export function handleSessionError(
  event: { properties: { sessionID?: string; error?: { name?: string } } },
  state: PluginState,
  instruments: MetricInstruments,
): void {
  const sessionID = event.properties.sessionID
  if (!sessionID) return

  const chatEntry = state.toolSpans.get(`chat:${sessionID}`)
  const chatReq = state.pendingChatRequests.get(sessionID)
  if (!chatEntry || !chatReq) return

  const errorType = event.properties.error?.name ?? "UnknownError"
  chatEntry.span.setAttribute("error.type", truncate(errorType))
  chatEntry.span.setStatus({ code: 2, message: truncate(errorType) })
  chatEntry.span.end()
  state.toolSpans.delete(`chat:${sessionID}`)

  const durationS = (Date.now() - chatReq.startTime) / 1000
  instruments.operationDuration.record(durationS, {
    "gen_ai.operation.name": truncate("chat"),
    "gen_ai.provider.name": truncate(chatReq.provider),
    "gen_ai.request.model": truncate(chatReq.model),
    "error.type": truncate(errorType),
  })

  state.pendingChatRequests.delete(sessionID)
}

export async function handleServerDisposed(
  state: PluginState,
  providers: Providers,
): Promise<void> {
  if (state.sweepInterval) clearInterval(state.sweepInterval)
  for (const session of state.sessionSpans.values()) {
    session.span.end()
  }
  state.sessionSpans.clear()
  for (const entry of state.toolSpans.values()) {
    entry.span.end()
  }
  state.toolSpans.clear()
  state.pendingChatRequests.clear()
  await shutdownProviders(providers)
}
