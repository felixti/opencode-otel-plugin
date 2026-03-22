import { beforeEach, describe, expect, test } from "bun:test"
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base"
import { createToolExecuteHooks } from "../../src/hooks/tool-execute"
import type { MetricInstruments } from "../../src/signals/metrics"
import type { PluginState } from "../../src/types"

type MetricCall = { value: number; attributes: Record<string, unknown> }

function createSpyCounter() {
  const calls: MetricCall[] = []
  return {
    add(value: number, attributes?: Record<string, unknown>) {
      calls.push({ value, attributes: attributes ?? {} })
    },
    calls,
  }
}

function createMockInstruments() {
  const fileChangesSpy = createSpyCounter()
  const toolInvocationsSpy = createSpyCounter()
  const instruments = {
    tokenUsage: { record() {} },
    operationDuration: { record() {} },
    requestCount: { add() {} },
    compactionCount: { add() {} },
    fileChanges: fileChangesSpy,
    toolInvocations: toolInvocationsSpy,
  } as unknown as MetricInstruments
  return { instruments, fileChangesSpy, toolInvocationsSpy }
}

function createMockState(): PluginState {
  return {
    sessionSpans: new Map(),
    toolSpans: new Map(),
    pendingChatRequests: new Map(),
    currentBranch: undefined,
    opencodeVersion: undefined,
    gitAuthor: undefined,
    repoUrl: undefined,
    gitReady: Promise.resolve(),
  }
}

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})
const tracer = provider.getTracer("test")

let state: PluginState
let instruments: MetricInstruments
let fileChangesSpy: ReturnType<typeof createSpyCounter>

beforeEach(() => {
  exporter.reset()
  const mocks = createMockInstruments()
  instruments = mocks.instruments
  fileChangesSpy = mocks.fileChangesSpy
  state = createMockState()
})

async function runToolHook(
  tool: string,
  metadata: unknown,
  callID = "call_1",
  sessionID = "sess_1",
) {
  const hooks = createToolExecuteHooks({ tracer, instruments, state })
  await hooks.before({ tool, sessionID, callID }, { args: {} })
  await hooks.after(
    { tool, sessionID, callID },
    { title: `Edited file`, output: "ok", metadata },
  )
  return exporter.getFinishedSpans()
}

describe("code.language attribute", () => {
  test("sets from metadata.path for edit tool", async () => {
    const spans = await runToolHook("edit", { path: "/src/app.ts" })
    expect(spans[0].attributes["code.language"]).toBe("typescript")
  })

  test("sets from metadata.file for edit tool", async () => {
    const spans = await runToolHook("edit", { file: "/src/main.py" })
    expect(spans[0].attributes["code.language"]).toBe("python")
  })

  test("sets from metadata.filediff.file for edit tool", async () => {
    const spans = await runToolHook("edit", {
      filediff: { file: "/lib/utils.rs", additions: 5, deletions: 2 },
    })
    expect(spans[0].attributes["code.language"]).toBe("rust")
  })

  test("sets for write tool", async () => {
    const spans = await runToolHook("write", { path: "/docs/readme.md" })
    expect(spans[0].attributes["code.language"]).toBe("markdown")
  })

  test("not set for non-edit/write tools", async () => {
    const spans = await runToolHook("bash", { path: "/src/app.ts" })
    expect(spans[0].attributes["code.language"]).toBeUndefined()
  })

  test("not set when metadata has no file path", async () => {
    const spans = await runToolHook("edit", { diff: "some diff" })
    expect(spans[0].attributes["code.language"]).toBeUndefined()
  })

  test("not set when metadata is null", async () => {
    const spans = await runToolHook("edit", null)
    expect(spans[0].attributes["code.language"]).toBeUndefined()
  })
})

describe("file changes metric", () => {
  test("records from edit tool filediff (TS backend shape)", async () => {
    await runToolHook("edit", {
      filediff: { file: "/src/index.ts", additions: 10, deletions: 3 },
    })
    expect(fileChangesSpy.calls).toEqual([
      { value: 10, attributes: { "code.language": "typescript", "opencode.change.type": "added" } },
      { value: 3, attributes: { "code.language": "typescript", "opencode.change.type": "removed" } },
    ])
  })

  test("records from edit tool top-level metadata (Go backend shape)", async () => {
    await runToolHook("edit", { path: "/main.go", additions: 7, removals: 2 })
    expect(fileChangesSpy.calls).toEqual([
      { value: 7, attributes: { "code.language": "go", "opencode.change.type": "added" } },
      { value: 2, attributes: { "code.language": "go", "opencode.change.type": "removed" } },
    ])
  })

  test("prefers filediff over top-level for edit tool", async () => {
    await runToolHook("edit", {
      filediff: { file: "/a.ts", additions: 5, deletions: 1 },
      additions: 99,
      removals: 99,
    })
    expect(fileChangesSpy.calls).toEqual([
      { value: 5, attributes: { "code.language": "typescript", "opencode.change.type": "added" } },
      { value: 1, attributes: { "code.language": "typescript", "opencode.change.type": "removed" } },
    ])
  })

  test("records from write tool metadata", async () => {
    await runToolHook("write", { path: "/config.json", additions: 15, removals: 0 })
    expect(fileChangesSpy.calls).toEqual([
      { value: 15, attributes: { "code.language": "json", "opencode.change.type": "added" } },
    ])
  })

  test("not recorded for non-edit/write tools", async () => {
    await runToolHook("bash", { additions: 10, removals: 5 })
    expect(fileChangesSpy.calls).toHaveLength(0)
  })

  test("not recorded when counts are zero", async () => {
    await runToolHook("edit", { filediff: { file: "/a.ts", additions: 0, deletions: 0 } })
    expect(fileChangesSpy.calls).toHaveLength(0)
  })

  test("omits code.language when file path unavailable", async () => {
    await runToolHook("edit", { additions: 4, removals: 1 })
    expect(fileChangesSpy.calls).toEqual([
      { value: 4, attributes: { "opencode.change.type": "added" } },
      { value: 1, attributes: { "opencode.change.type": "removed" } },
    ])
  })

  test("omits code.language for unknown extensions", async () => {
    await runToolHook("edit", { path: "/data.xyz", additions: 2, removals: 0 })
    expect(fileChangesSpy.calls).toEqual([
      { value: 2, attributes: { "opencode.change.type": "added" } },
    ])
  })

  test("records only deletions when no additions", async () => {
    await runToolHook("write", { path: "/clean.ts", additions: 0, removals: 8 })
    expect(fileChangesSpy.calls).toEqual([
      { value: 8, attributes: { "code.language": "typescript", "opencode.change.type": "removed" } },
    ])
  })
})
