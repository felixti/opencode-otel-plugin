import type { Plugin } from "@opencode-ai/plugin"
import type { AssistantMessage } from "@opencode-ai/sdk"
import { trace, metrics } from "@opentelemetry/api"
import { createResource } from "./telemetry/resources"
import { initProviders } from "./telemetry/provider"
import { shutdownProviders } from "./telemetry/shutdown"
import { createMetricInstruments } from "./signals/metrics"
import { createEventHook } from "./hooks/event"
import { createChatParamsHook } from "./hooks/chat-params"
import { createToolExecuteHooks } from "./hooks/tool-execute"
import { getGitAuthor, getRepoUrl, getCurrentBranch, getHostname } from "./utils/git"
import type { PluginState } from "./types"

const TRACER_NAME = "opencode-otel-plugin"
const METER_NAME = "opencode-otel-plugin"

export const OpenCodeOtelPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
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

  const providers = initProviders(resource)
  const tracer = trace.getTracer(TRACER_NAME)
  const meter = metrics.getMeter(METER_NAME)
  const instruments = createMetricInstruments(meter)

  const state: PluginState = {
    sessionSpans: new Map(),
    toolSpans: new Map(),
    pendingChatRequests: new Map(),
    currentBranch: branch,
  }

  const eventHook = createEventHook({ tracer, instruments, state, providers })
  const chatParamsHook = createChatParamsHook({ tracer, instruments, state })
  const toolHooks = createToolExecuteHooks({ tracer, instruments, state })

  return {
    event: async ({ event }) => {
      try {
        if (event.type === "message.updated") {
          const msg = event.properties.info
          if (msg.role === "assistant") {
            const assistant = msg as AssistantMessage
            const sessionID = assistant.sessionID
            const chatSpan = state.toolSpans.get(`chat:${sessionID}`)
            const chatReq = state.pendingChatRequests.get(sessionID)

            if (chatSpan && chatReq) {
              const inputTokens = assistant.tokens.input ?? 0
              const outputTokens = assistant.tokens.output ?? 0

              chatSpan.setAttribute("gen_ai.usage.input_tokens", inputTokens)
              chatSpan.setAttribute("gen_ai.usage.output_tokens", outputTokens)
              chatSpan.setAttribute("gen_ai.response.model", chatReq.model)
              chatSpan.end()
              state.toolSpans.delete(`chat:${sessionID}`)

              const durationS = (Date.now() - chatReq.startTime) / 1000
              instruments.tokenUsage.record(inputTokens, {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": chatReq.provider,
                "gen_ai.token.type": "input",
                "gen_ai.request.model": chatReq.model,
              })
              instruments.tokenUsage.record(outputTokens, {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": chatReq.provider,
                "gen_ai.token.type": "output",
                "gen_ai.request.model": chatReq.model,
              })
              instruments.operationDuration.record(durationS, {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": chatReq.provider,
                "gen_ai.request.model": chatReq.model,
              })

              state.pendingChatRequests.delete(sessionID)
            }
          }
        }

        if (event.type === "server.instance.disposed") {
          await shutdownProviders(providers)
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
