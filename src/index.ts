import type { Plugin } from "@opencode-ai/plugin"
import type { AssistantMessage } from "@opencode-ai/sdk"
import { trace, metrics } from "@opentelemetry/api"
import { createResource } from "./telemetry/resources"
import { initProviders } from "./telemetry/provider"
import { createMetricInstruments } from "./signals/metrics"
import { createEventHook } from "./hooks/event"
import { handleMessageUpdated, handleSessionError, handleServerDisposed } from "./hooks/message-handler"
import { createChatParamsHook } from "./hooks/chat-params"
import { createToolExecuteHooks } from "./hooks/tool-execute"
import { getGitAuthor, getRepoUrl, getCurrentBranch, getHostname } from "./utils/git"
import { truncate } from "./utils/truncate"
import type { PluginState } from "./types"

const TRACER_NAME = "opencode-otel-plugin"
const METER_NAME = "opencode-otel-plugin"

// M5: single pre-allocated Promise avoids per-event allocation in no-op path
const RESOLVED = Promise.resolve()
const noopAsync = () => RESOLVED

const SWEEP_INTERVAL_MS = 60_000
const SWEEP_TTL_MS = 5 * 60_000

export const OpenCodeOtelPlugin: Plugin = async ({ project, $, directory, worktree }) => {
  let tracer: ReturnType<typeof trace.getTracer>
  let meter: ReturnType<typeof metrics.getMeter>
  let instruments: ReturnType<typeof createMetricInstruments>
  let providers: ReturnType<typeof initProviders>
  let state: PluginState

  try {
    // M6: non-blocking init — git metadata arrives async, set on spans later
    const hostname = getHostname()

    const resource = createResource({
      author: "",
      hostname,
      projectName: project.id ?? "",
      repoUrl: "",
      branch: "",
      worktree,
      directory,
    })

    providers = initProviders(resource)
    tracer = trace.getTracer(TRACER_NAME)
    meter = metrics.getMeter(METER_NAME)
    instruments = createMetricInstruments(meter)

    state = {
      sessionSpans: new Map(),
      toolSpans: new Map(),
      pendingChatRequests: new Map(),
      currentBranch: undefined,
      opencodeVersion: undefined,
      gitAuthor: undefined,
      repoUrl: undefined,
      gitReady: RESOLVED,
    }

    state.gitReady = Promise.all([
      getGitAuthor($),
      getRepoUrl($),
      getCurrentBranch($),
    ]).then(([author, repoUrl, branch]) => {
      state.currentBranch = branch || undefined
      state.gitAuthor = author || undefined
      state.repoUrl = repoUrl || undefined
      for (const session of state.sessionSpans.values()) {
        if (author) session.span.setAttribute("enduser.id", truncate(author))
        if (repoUrl) session.span.setAttribute("vcs.repository.url.full", truncate(repoUrl))
        if (branch) session.span.setAttribute("vcs.repository.ref.name", truncate(branch))
      }
      for (const entry of state.toolSpans.values()) {
        if (author) entry.span.setAttribute("enduser.id", truncate(author))
        if (repoUrl) entry.span.setAttribute("vcs.repository.url.full", truncate(repoUrl))
        if (branch) entry.span.setAttribute("vcs.repository.ref.name", truncate(branch))
      }
    }).catch(() => {})

    // C1: TTL sweeper — evicts abandoned sessions and truly orphaned children
    const sweepTimer = setInterval(() => {
      const threshold = Date.now() - SWEEP_TTL_MS
      for (const [sid, session] of state.sessionSpans) {
        if (session.lastActivityAt >= threshold) continue
        // Skip eviction if the session still has in-flight children
        let hasActiveChild = false
        for (const entry of state.toolSpans.values()) {
          if (entry.sessionID === sid) { hasActiveChild = true; break }
        }
        if (!hasActiveChild) hasActiveChild = state.pendingChatRequests.has(sid)
        if (hasActiveChild) continue
        session.span.end()
        state.sessionSpans.delete(sid)
      }
      // Sweep only truly orphaned tool spans (parent session gone)
      for (const [key, entry] of state.toolSpans) {
        if (!state.sessionSpans.has(entry.sessionID) && entry.createdAt < threshold) {
          entry.span.end()
          state.toolSpans.delete(key)
        }
      }
      for (const [key, req] of state.pendingChatRequests) {
        if (!state.sessionSpans.has(key) && req.startTime < threshold) {
          state.pendingChatRequests.delete(key)
        }
      }
    }, SWEEP_INTERVAL_MS)
    if (typeof sweepTimer === "object" && "unref" in sweepTimer) {
      sweepTimer.unref()
    }
    state.sweepInterval = sweepTimer
  } catch {
    return {
      event: noopAsync,
      "chat.params": noopAsync,
      "tool.execute.before": noopAsync,
      "tool.execute.after": noopAsync,
    }
  }

  const eventHook = createEventHook({ tracer, instruments, state, providers })
  const chatParamsHook = createChatParamsHook({ tracer, instruments, state })
  const toolHooks = createToolExecuteHooks({ tracer, instruments, state })

  return {
    event: async ({ event }) => {
      try {
        if (event.type === "installation.updated") {
          state.opencodeVersion = event.properties.version
          for (const session of state.sessionSpans.values()) {
            session.span.setAttribute("service.version", truncate(event.properties.version))
          }
          return
        }

        if (event.type === "message.updated") {
          const msg = event.properties.info
          if (msg.role === "assistant") {
            handleMessageUpdated(msg as AssistantMessage, state, instruments)
          }
          return
        }

        if (event.type === "server.instance.disposed") {
          await handleServerDisposed(state, providers)
          return
        }

        if (event.type === "session.error") {
          handleSessionError(event, state, instruments)
          return
        }

        await eventHook({ event })
      } catch {
        // Never let telemetry errors crash the plugin
      }
    },

    "chat.params": async (input, output) => {
      try {
        await chatParamsHook(input, output)
      } catch {
        // Swallow errors
      }
    },

    "tool.execute.before": async (input, output) => {
      try {
        await toolHooks.before(input, output)
      } catch {
        // Swallow errors
      }
    },

    "tool.execute.after": async (input, output) => {
      try {
        await toolHooks.after(input, output)
      } catch {
        // Swallow errors
      }
    },
  }
}
