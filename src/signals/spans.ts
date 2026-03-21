import { type Span, SpanKind, type Tracer } from "@opentelemetry/api"

export function startSessionSpan(tracer: Tracer, sessionID: string): Span {
  return tracer.startSpan("invoke_agent opencode", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.agent.name": "opencode",
      "gen_ai.conversation.id": sessionID,
    },
  })
}

export function startChatSpan(
  tracer: Tracer,
  opts: { model: string; provider: string; sessionID: string },
): Span {
  return tracer.startSpan(`chat ${opts.model}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": opts.provider,
      "gen_ai.request.model": opts.model,
      "gen_ai.conversation.id": opts.sessionID,
    },
  })
}

export function startToolSpan(
  tracer: Tracer,
  opts: { toolName: string; callID: string; sessionID: string },
): Span {
  return tracer.startSpan(`execute_tool ${opts.toolName}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": opts.toolName,
      "gen_ai.tool.call.id": opts.callID,
      "gen_ai.conversation.id": opts.sessionID,
    },
  })
}

export function startFileEditSpan(
  tracer: Tracer,
  opts: {
    filepath: string
    language: string
    linesAdded: number
    linesRemoved: number
    sessionID: string
  },
): Span {
  const span = tracer.startSpan(`file_edit ${opts.filepath}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.conversation.id": opts.sessionID,
      "code.filepath": opts.filepath,
      "code.language": opts.language,
      "opencode.file.lines_added": opts.linesAdded,
      "opencode.file.lines_removed": opts.linesRemoved,
    },
  })
  span.end()
  return span
}

export function startCompactionSpan(tracer: Tracer, sessionID: string): Span {
  const span = tracer.startSpan("session_compaction", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": "session_compaction",
      "gen_ai.conversation.id": sessionID,
    },
  })
  span.end()
  return span
}
