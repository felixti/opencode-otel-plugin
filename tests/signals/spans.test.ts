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
  startFileEditSpan,
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
    const span = startSessionSpan(tracer, "sess_123")
    span.end()

    const spans = exporter.getFinishedSpans()
    expect(spans.length).toBe(1)
    expect(spans[0].name).toBe("invoke_agent opencode")
    expect(spans[0].kind).toBe(SpanKind.INTERNAL)
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
  })
})

describe("startFileEditSpan", () => {
  test("creates an INTERNAL span with filepath", () => {
    const tracer = trace.getTracer("test")
    const span = startFileEditSpan(tracer, {
      filepath: "src/index.ts",
      language: "typescript",
      linesAdded: 10,
      linesRemoved: 3,
      sessionID: "sess_123",
    })
    span.end()

    const spans = exporter.getFinishedSpans()
    const fileSpan = spans.find((s) => s.name === "file_edit src/index.ts")
    expect(fileSpan).toBeDefined()
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
  })
})
