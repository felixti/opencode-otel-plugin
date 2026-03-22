import { beforeEach, describe, expect, test } from "bun:test"
import { SpanKind, trace } from "@opentelemetry/api"
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base"
import {
  startSessionSpan,
  startChatSpan,
  startToolSpan,
  startCompactionSpan,
} from "../../src/signals/spans"

let exporter: InMemorySpanExporter

exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})
trace.setGlobalTracerProvider(provider)

beforeEach(() => {
  exporter.reset()
})

describe("startSessionSpan", () => {
  test("creates an INTERNAL span named invoke_agent opencode", () => {
    const tracer = trace.getTracer("test")
    const { span, context } = startSessionSpan(tracer, "sess_123")
    expect(context).toBeDefined()
    span.end()

    const spans = exporter.getFinishedSpans()
    expect(spans.length).toBe(1)
    expect(spans[0].name).toBe("invoke_agent opencode")
    expect(spans[0].kind).toBe(SpanKind.INTERNAL)
    expect(spans[0].attributes["gen_ai.operation.name"]).toBe("invoke_agent")
    expect(spans[0].attributes["gen_ai.agent.name"]).toBe("opencode")
    expect(spans[0].attributes["gen_ai.conversation.id"]).toBe("sess_123")
  })
})

describe("startChatSpan", () => {
  test("creates a CLIENT span with model name", () => {
    const tracer = trace.getTracer("test")
    const span = startChatSpan(tracer, {
      model: "gpt-4",
      provider: "openai",
      sessionID: "sess_123",
    })
    span.end()

    const spans = exporter.getFinishedSpans()
    const chatSpan = spans.find((s) => s.name === "chat gpt-4")
    expect(chatSpan).toBeDefined()
    expect(chatSpan!.kind).toBe(SpanKind.CLIENT)
    expect(chatSpan!.attributes["gen_ai.operation.name"]).toBe("chat")
    expect(chatSpan!.attributes["gen_ai.provider.name"]).toBe("openai")
    expect(chatSpan!.attributes["gen_ai.request.model"]).toBe("gpt-4")
    expect(chatSpan!.attributes["gen_ai.conversation.id"]).toBe("sess_123")
  })
})

describe("startToolSpan", () => {
  test("creates an INTERNAL span with tool name", () => {
    const tracer = trace.getTracer("test")
    const span = startToolSpan(tracer, {
      toolName: "read",
      callID: "call_1",
      sessionID: "sess_123",
    })
    span.end()

    const spans = exporter.getFinishedSpans()
    const toolSpan = spans.find((s) => s.name === "execute_tool read")
    expect(toolSpan).toBeDefined()
    expect(toolSpan!.kind).toBe(SpanKind.INTERNAL)
    expect(toolSpan!.attributes["gen_ai.operation.name"]).toBe("execute_tool")
    expect(toolSpan!.attributes["gen_ai.tool.name"]).toBe("read")
    expect(toolSpan!.attributes["gen_ai.tool.call.id"]).toBe("call_1")
    expect(toolSpan!.attributes["gen_ai.conversation.id"]).toBe("sess_123")
  })
})

describe("startCompactionSpan", () => {
  test("creates an INTERNAL span for compaction", () => {
    const tracer = trace.getTracer("test")
    const span = startCompactionSpan(tracer, "sess_123")
    span.end()

    const spans = exporter.getFinishedSpans()
    const compSpan = spans.find((s) => s.name === "session_compaction")
    expect(compSpan).toBeDefined()
    expect(compSpan!.attributes["gen_ai.conversation.id"]).toBe("sess_123")
    expect(compSpan!.attributes["gen_ai.operation.name"]).toBeUndefined()
  })
})

describe("context propagation", () => {
  test("chat span is child of session span", () => {
    const tracer = trace.getTracer("test")
    const session = startSessionSpan(tracer, "sess_ctx")
    const chatSpan = startChatSpan(tracer, {
      model: "gpt-4",
      provider: "openai",
      sessionID: "sess_ctx",
    }, session.context)
    chatSpan.end()
    session.span.end()

    const spans = exporter.getFinishedSpans()
    const parent = spans.find((s) => s.name === "invoke_agent opencode")!
    const child = spans.find((s) => s.name === "chat gpt-4")!
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId)
  })

  test("tool span is child of session span", () => {
    const tracer = trace.getTracer("test")
    const session = startSessionSpan(tracer, "sess_ctx")
    const toolSpan = startToolSpan(tracer, {
      toolName: "bash",
      callID: "call_ctx",
      sessionID: "sess_ctx",
    }, session.context)
    toolSpan.end()
    session.span.end()

    const spans = exporter.getFinishedSpans()
    const parent = spans.find((s) => s.name === "invoke_agent opencode")!
    const child = spans.find((s) => s.name === "execute_tool bash")!
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId)
  })

  test("compaction span is child of session span", () => {
    const tracer = trace.getTracer("test")
    const session = startSessionSpan(tracer, "sess_ctx")
    startCompactionSpan(tracer, "sess_ctx", session.context)
    session.span.end()

    const spans = exporter.getFinishedSpans()
    const parent = spans.find((s) => s.name === "invoke_agent opencode")!
    const child = spans.find((s) => s.name === "session_compaction")!
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId)
  })

  test("span without parentContext has no parent", () => {
    const tracer = trace.getTracer("test")
    const chatSpan = startChatSpan(tracer, {
      model: "gpt-4",
      provider: "openai",
      sessionID: "sess_orphan",
    })
    chatSpan.end()

    const spans = exporter.getFinishedSpans()
    const orphan = spans.find((s) => s.name === "chat gpt-4")!
    expect(orphan.parentSpanContext).toBeUndefined()
  })
})
