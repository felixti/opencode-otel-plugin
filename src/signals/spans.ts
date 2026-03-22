import { type Context, type Span, SpanKind, type Tracer, context as otelContext, trace } from "@opentelemetry/api"
import { truncate } from "../utils/truncate"

export function startSessionSpan(tracer: Tracer, sessionID: string): { span: Span; context: Context } {
  const span = tracer.startSpan("invoke_agent opencode", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": truncate("invoke_agent"),
      "gen_ai.agent.name": truncate("opencode"),
      "gen_ai.conversation.id": truncate(sessionID),
    },
  })
  const ctx = trace.setSpan(otelContext.active(), span)
  return { span, context: ctx }
}

export function startChatSpan(
  tracer: Tracer,
  opts: { model: string; provider: string; sessionID: string; branch?: string },
  parentContext?: Context,
): Span {
  return tracer.startSpan(`chat ${truncate(opts.model)}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      "gen_ai.operation.name": truncate("chat"),
      "gen_ai.provider.name": truncate(opts.provider),
      "gen_ai.request.model": truncate(opts.model),
      "gen_ai.conversation.id": truncate(opts.sessionID),
      ...(opts.branch ? { "vcs.repository.ref.name": truncate(opts.branch) } : {}),
    },
  }, parentContext)
}

export function startToolSpan(
  tracer: Tracer,
  opts: { toolName: string; callID: string; sessionID: string; branch?: string },
  parentContext?: Context,
): Span {
  return tracer.startSpan(`execute_tool ${truncate(opts.toolName)}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": truncate("execute_tool"),
      "gen_ai.tool.name": truncate(opts.toolName),
      "gen_ai.tool.call.id": truncate(opts.callID),
      "gen_ai.conversation.id": truncate(opts.sessionID),
      ...(opts.branch ? { "vcs.repository.ref.name": truncate(opts.branch) } : {}),
    },
  }, parentContext)
}

export function startCompactionSpan(
  tracer: Tracer,
  sessionID: string,
  parentContext?: Context,
  branch?: string,
  gitAuthor?: string,
  repoUrl?: string,
): Span {
  const span = tracer.startSpan("session_compaction", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.conversation.id": truncate(sessionID),
      ...(branch ? { "vcs.repository.ref.name": truncate(branch) } : {}),
      ...(gitAuthor ? { "enduser.id": truncate(gitAuthor) } : {}),
      ...(repoUrl ? { "vcs.repository.url.full": truncate(repoUrl) } : {}),
    },
  }, parentContext)
  span.end()
  return span
}
