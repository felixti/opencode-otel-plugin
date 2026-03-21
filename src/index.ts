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
import type { PluginState } from "./types"

const TRACER_NAME = "opencode-otel-plugin"
const METER_NAME = "opencode-otel-plugin"

export const OpenCodeOtelPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  let tracer: ReturnType<typeof trace.getTracer>
  let meter: ReturnType<typeof metrics.getMeter>
  let instruments: ReturnType<typeof createMetricInstruments>
  let providers: ReturnType<typeof initProviders>
  let state: PluginState

  try {
    const [author, repoUrl, branch] = await Promise.all([
      getGitAuthor($),
      getRepoUrl($),
      getCurrentBranch($),
    ])

    const resource = createResource({
      author,
      hostname: getHostname(),
      projectName: project.id ?? "",
      repoUrl,
      branch,
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
      currentBranch: branch,
      opencodeVersion: undefined,
    }
  } catch {
    return {
      event: async () => {},
      "chat.params": async () => {},
      "tool.execute.before": async () => {},
      "tool.execute.after": async () => {},
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
            session.span.setAttribute("service.version", event.properties.version)
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
