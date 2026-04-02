import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startSessionSpan, startCompactionSpan } from "../signals/spans"
import { flushProviders } from "../telemetry/shutdown"
import type { Providers } from "../telemetry/provider"
import { truncate } from "../utils/truncate"

interface EventHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
  providers: Providers
}

export function createEventHook(deps: EventHookDeps) {
  const { tracer, instruments, state, providers } = deps

  return async ({ event }: { event: any }) => {
    switch (event.type) {
      case "session.created": {
        const sessionID = event.properties.info?.id
        if (!sessionID) break
        await state.gitReady
        const { span, context } = startSessionSpan(tracer, sessionID)
        if (state.opencodeVersion) {
          span.setAttribute("service.version", truncate(state.opencodeVersion))
        }
        if (state.currentBranch) {
          span.setAttribute("vcs.repository.ref.name", truncate(state.currentBranch))
        }
        if (state.gitAuthor) {
          span.setAttribute("enduser.id", truncate(state.gitAuthor))
          span.setAttribute("host.user.email", truncate(state.gitAuthor))
        }
        if (state.repoUrl) {
          span.setAttribute("vcs.repository.url.full", truncate(state.repoUrl))
        }
        state.sessionSpans.set(sessionID, { span, context, sessionID, requestCount: 0, lastActivityAt: Date.now() })
        break
      }

      case "session.idle": {
        const sessionID = event.properties.sessionID as string
        const session = state.sessionSpans.get(sessionID)
        if (session) {
          session.span.setAttribute("opencode.session.request_count", session.requestCount)
          session.span.end()
          state.sessionSpans.delete(sessionID)
        }
        for (const [key, entry] of state.toolSpans) {
          if (entry.sessionID === sessionID) {
            entry.span.end()
            state.toolSpans.delete(key)
          }
        }
        state.pendingChatRequests.delete(sessionID)
        const now = Date.now()
        if (!state.lastFlushTime || now - state.lastFlushTime >= 30_000) {
          state.lastFlushTime = now
          await flushProviders(providers)
        }
        break
      }

      case "session.compacted": {
        const sessionID = event.properties.sessionID as string
        await state.gitReady
        const session = state.sessionSpans.get(sessionID)
        if (session) session.lastActivityAt = Date.now()
        startCompactionSpan(tracer, sessionID, session?.context, state.currentBranch, state.gitAuthor, state.repoUrl)
        instruments.compactionCount.add(1, {})
        break
      }

      case "vcs.branch.updated": {
        state.currentBranch = event.properties.branch ?? state.currentBranch
        if (state.currentBranch) {
          for (const session of state.sessionSpans.values()) {
            session.span.setAttribute("vcs.repository.ref.name", truncate(state.currentBranch))
          }
          for (const entry of state.toolSpans.values()) {
            entry.span.setAttribute("vcs.repository.ref.name", truncate(state.currentBranch))
          }
        }
        break
      }
    }
  }
}
