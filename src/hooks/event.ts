import type { Tracer } from "@opentelemetry/api"
import type { PluginState, FileChangeStats } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startSessionSpan, startFileEditSpan, startCompactionSpan } from "../signals/spans"
import { extractFileChanges } from "../utils/diff"
import { detectLanguage } from "../utils/language"
import { flushProviders } from "../telemetry/shutdown"
import type { Providers } from "../telemetry/provider"

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
        const { span, context } = startSessionSpan(tracer, sessionID)
        if (state.opencodeVersion) {
          span.setAttribute("service.version", state.opencodeVersion)
        }
        if (state.currentBranch) {
          span.setAttribute("vcs.repository.ref.name", state.currentBranch)
        }
        state.sessionSpans.set(sessionID, { span, context, sessionID, requestCount: 0 })
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
        await flushProviders(providers)
        break
      }

      case "session.diff": {
        const sessionID = event.properties.sessionID as string
        const diffs = event.properties.diff as Array<{ path: string; additions?: number; deletions?: number }> | undefined
        if (!diffs?.length) break

        const session = state.sessionSpans.get(sessionID)
        const changes: FileChangeStats[] = extractFileChanges(diffs)
        for (const change of changes) {
          startFileEditSpan(tracer, { ...change, sessionID, branch: state.currentBranch }, session?.context)

          if (change.linesAdded > 0) {
            instruments.fileChanges.add(change.linesAdded, {
              "opencode.change.type": "added",
              "code.language": change.language,
              "code.filepath": change.filepath,
            })
          }
          if (change.linesRemoved > 0) {
            instruments.fileChanges.add(change.linesRemoved, {
              "opencode.change.type": "removed",
              "code.language": change.language,
              "code.filepath": change.filepath,
            })
          }
        }
        break
      }

      case "session.compacted": {
        const sessionID = event.properties.sessionID as string
        const session = state.sessionSpans.get(sessionID)
        startCompactionSpan(tracer, sessionID, session?.context, state.currentBranch)
        instruments.compactionCount.add(1, {
          "gen_ai.conversation.id": sessionID,
        })
        break
      }

      case "vcs.branch.updated": {
        state.currentBranch = event.properties.branch ?? state.currentBranch
        if (state.currentBranch) {
          for (const session of state.sessionSpans.values()) {
            session.span.setAttribute("vcs.repository.ref.name", state.currentBranch)
          }
          for (const span of state.toolSpans.values()) {
            span.setAttribute("vcs.repository.ref.name", state.currentBranch)
          }
        }
        break
      }

      case "file.edited": {
        const filePath = event.properties.file as string | undefined
        if (filePath) {
          detectLanguage(filePath)
        }
        break
      }
    }
  }
}
