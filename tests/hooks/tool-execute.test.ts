import { beforeEach, describe, expect, test } from "bun:test"
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base"
import { createToolExecuteHooks } from "../../src/hooks/tool-execute"
import { startSessionSpan } from "../../src/signals/spans"
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
  const vcsOperationsSpy = createSpyCounter()
  const instruments = {
    tokenUsage: { record() {} },
    operationDuration: { record() {} },
    requestCount: { add() {} },
    compactionCount: { add() {} },
    fileChanges: fileChangesSpy,
    toolInvocations: toolInvocationsSpy,
    vcsOperations: vcsOperationsSpy,
  } as unknown as MetricInstruments
  return { instruments, fileChangesSpy, toolInvocationsSpy, vcsOperationsSpy }
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
    filteredTools: new Set(),
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
let vcsOperationsSpy: ReturnType<typeof createSpyCounter>

beforeEach(() => {
  exporter.reset()
  const mocks = createMockInstruments()
  instruments = mocks.instruments
  fileChangesSpy = mocks.fileChangesSpy
  vcsOperationsSpy = mocks.vcsOperationsSpy
  state = createMockState()
})

async function runToolHook(
  tool: string,
  metadata: unknown,
  callID = "call_1",
  sessionID = "sess_1",
  args: Record<string, unknown> = {},
) {
  const hooks = createToolExecuteHooks({ tracer, instruments, state })
  await hooks.before({ tool, sessionID, callID }, { args })
  await hooks.after(
    { tool, sessionID, callID, args },
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

  test("sets from metadata.filepath for write tool (real OpenCode shape)", async () => {
    const spans = await runToolHook("write", {
      filepath: "/src/utils/helper.ts",
      exists: true,
      diagnostics: {},
    })
    expect(spans[0].attributes["code.language"]).toBe("typescript")
  })

  test("sets for apply_patch tool from files[0].filePath", async () => {
    const spans = await runToolHook("apply_patch", {
      files: [
        { filePath: "/src/index.rs", additions: 3, deletions: 1, diff: "...", type: "update" },
      ],
      diagnostics: {},
    })
    expect(spans[0].attributes["code.language"]).toBe("rust")
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

  test("records from apply_patch per-file additions and deletions", async () => {
    await runToolHook("apply_patch", {
      files: [
        { filePath: "/src/a.ts", additions: 5, deletions: 2, diff: "...", type: "update" },
        { filePath: "/src/b.py", additions: 3, deletions: 0, diff: "...", type: "add" },
      ],
      diagnostics: {},
    })
    expect(fileChangesSpy.calls).toEqual([
      { value: 5, attributes: { "code.language": "typescript", "opencode.change.type": "added" } },
      { value: 2, attributes: { "code.language": "typescript", "opencode.change.type": "removed" } },
      { value: 3, attributes: { "code.language": "python", "opencode.change.type": "added" } },
    ])
  })

  test("records from apply_patch single file delete", async () => {
    await runToolHook("apply_patch", {
      files: [
        { filePath: "/src/old.go", additions: 0, deletions: 40, diff: "...", type: "delete" },
      ],
      diagnostics: {},
    })
    expect(fileChangesSpy.calls).toEqual([
      { value: 40, attributes: { "code.language": "go", "opencode.change.type": "removed" } },
    ])
  })

  test("records from write tool using args.content when metadata lacks counts", async () => {
    await runToolHook(
      "write",
      { filepath: "/src/new.ts", exists: false, diagnostics: {} },
      "call_1",
      "sess_1",
      { content: "line1\nline2\nline3\n", filePath: "/src/new.ts" },
    )
    expect(fileChangesSpy.calls).toEqual([
      { value: 3, attributes: { "code.language": "typescript", "opencode.change.type": "added" } },
    ])
  })

  test("records from write tool using args.content without trailing newline", async () => {
    await runToolHook(
      "write",
      { filepath: "/src/app.jsx", exists: true, diagnostics: {} },
      "call_1",
      "sess_1",
      { content: "line1\nline2", filePath: "/src/app.jsx" },
    )
    expect(fileChangesSpy.calls).toEqual([
      { value: 2, attributes: { "code.language": "javascript", "opencode.change.type": "added" } },
    ])
  })

  test("not recorded for apply_patch when files array is empty", async () => {
    await runToolHook("apply_patch", { files: [], diagnostics: {} })
    expect(fileChangesSpy.calls).toHaveLength(0)
  })
})

describe("file change span attributes", () => {
  test("sets additions and deletions on edit tool span", async () => {
    const spans = await runToolHook("edit", {
      filediff: { file: "/src/index.ts", additions: 10, deletions: 3 },
    })
    expect(spans[0].attributes["opencode.file.additions"]).toBe(10)
    expect(spans[0].attributes["opencode.file.deletions"]).toBe(3)
  })

  test("sets additions on write tool span from args.content", async () => {
    const spans = await runToolHook(
      "write",
      { filepath: "/src/new.ts", exists: false, diagnostics: {} },
      "call_1",
      "sess_1",
      { content: "line1\nline2\nline3\n", filePath: "/src/new.ts" },
    )
    expect(spans[0].attributes["opencode.file.additions"]).toBe(3)
    expect(spans[0].attributes["opencode.file.deletions"]).toBeUndefined()
  })

  test("sets additions and deletions on apply_patch span (summed across files)", async () => {
    const spans = await runToolHook("apply_patch", {
      files: [
        { filePath: "/src/a.ts", additions: 5, deletions: 2, diff: "...", type: "update" },
        { filePath: "/src/b.py", additions: 3, deletions: 1, diff: "...", type: "update" },
      ],
      diagnostics: {},
    })
    expect(spans[0].attributes["opencode.file.additions"]).toBe(8)
    expect(spans[0].attributes["opencode.file.deletions"]).toBe(3)
  })

  test("omits attributes when counts are zero", async () => {
    const spans = await runToolHook("edit", {
      filediff: { file: "/a.ts", additions: 0, deletions: 0 },
    })
    expect(spans[0].attributes["opencode.file.additions"]).toBeUndefined()
    expect(spans[0].attributes["opencode.file.deletions"]).toBeUndefined()
  })

  test("not set for non-file-changing tools", async () => {
    const spans = await runToolHook("bash", { path: "/src/app.ts" })
    expect(spans[0].attributes["opencode.file.additions"]).toBeUndefined()
    expect(spans[0].attributes["opencode.file.deletions"]).toBeUndefined()
  })
})

describe("VCS operations metric", () => {
  test("records git commit from bash tool with repo attributes", async () => {
    state.repoUrl = "https://github.com/test/repo"
    state.currentBranch = "main"
    await runToolHook("bash", null, "call_1", "sess_1", { command: "git commit -m \"feat: add feature\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      {
        value: 1,
        attributes: {
          "opencode.vcs.operation": "commit",
          "opencode.vcs.source": "cli",
          "vcs.repository.url.full": "https://github.com/test/repo",
          "vcs.repository.ref.name": "main",
        },
      },
    ])
  })

  test("records gh pr create from bash tool with repo attributes", async () => {
    state.repoUrl = "https://github.com/test/repo"
    state.currentBranch = "feature-branch"
    await runToolHook("bash", null, "call_1", "sess_1", { command: "gh pr create --title \"fix\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      {
        value: 1,
        attributes: {
          "opencode.vcs.operation": "pr_create",
          "opencode.vcs.source": "cli",
          "vcs.repository.url.full": "https://github.com/test/repo",
          "vcs.repository.ref.name": "feature-branch",
        },
      },
    ])
  })

  test("records MCP create_pull_request tool with repo attributes", async () => {
    state.repoUrl = "https://github.com/org/repo"
    state.currentBranch = "main"
    await runToolHook("mcp__github__create_pull_request", null, "call_1", "sess_1", {
      owner: "org", repo: "repo", title: "PR", head: "feat", base: "main",
    })
    expect(vcsOperationsSpy.calls).toEqual([
      {
        value: 1,
        attributes: {
          "opencode.vcs.operation": "pr_create",
          "opencode.vcs.source": "mcp",
          "vcs.repository.url.full": "https://github.com/org/repo",
          "vcs.repository.ref.name": "main",
        },
      },
    ])
  })

  test("omits repo attributes when state has no repoUrl or currentBranch", async () => {
    // state.repoUrl and state.currentBranch are undefined by default in createMockState()
    await runToolHook("bash", null, "call_1", "sess_1", { command: "git commit -m \"fix\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      { value: 1, attributes: { "opencode.vcs.operation": "commit", "opencode.vcs.source": "cli" } },
    ])
  })

  test("includes only repoUrl when currentBranch is undefined", async () => {
    state.repoUrl = "https://github.com/test/repo"
    // state.currentBranch is undefined
    await runToolHook("bash", null, "call_1", "sess_1", { command: "git commit -m \"fix\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      {
        value: 1,
        attributes: {
          "opencode.vcs.operation": "commit",
          "opencode.vcs.source": "cli",
          "vcs.repository.url.full": "https://github.com/test/repo",
        },
      },
    ])
  })

  test("includes only currentBranch when repoUrl is undefined", async () => {
    // state.repoUrl is undefined
    state.currentBranch = "develop"
    await runToolHook("bash", null, "call_1", "sess_1", { command: "git commit -m \"fix\"" })
    expect(vcsOperationsSpy.calls).toEqual([
      {
        value: 1,
        attributes: {
          "opencode.vcs.operation": "commit",
          "opencode.vcs.source": "cli",
          "vcs.repository.ref.name": "develop",
        },
      },
    ])
  })

  test("does not record for non-VCS bash tool", async () => {
    state.repoUrl = "https://github.com/test/repo"
    state.currentBranch = "main"
    await runToolHook("bash", null, "call_1", "sess_1", { command: "ls -la" })
    expect(vcsOperationsSpy.calls).toHaveLength(0)
  })

  test("does not record for edit tool", async () => {
    state.repoUrl = "https://github.com/test/repo"
    state.currentBranch = "main"
    await runToolHook("edit", { path: "/src/app.ts" })
    expect(vcsOperationsSpy.calls).toHaveLength(0)
  })

  test("records metric even when tool span entry is missing", async () => {
    state.repoUrl = "https://github.com/test/repo"
    state.currentBranch = "main"
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    // Call after without prior before — simulates session.idle deleting the entry
    await hooks.after(
      { tool: "bash", sessionID: "sess_1", callID: "call_gone", args: { command: "git commit -m \"fix\"" } },
      { title: "Ran command", output: "ok", metadata: null },
    )
    expect(vcsOperationsSpy.calls).toEqual([
      {
        value: 1,
        attributes: {
          "opencode.vcs.operation": "commit",
          "opencode.vcs.source": "cli",
          "vcs.repository.url.full": "https://github.com/test/repo",
          "vcs.repository.ref.name": "main",
        },
      },
    ])
  })
})

describe("span chaining", () => {
  test("tool span is child of session span when session exists", async () => {
    const sessionID = "sess_chain"
    const session = startSessionSpan(tracer, sessionID)
    state.sessionSpans.set(sessionID, {
      span: session.span,
      context: session.context,
      sessionID,
      requestCount: 0,
      lastActivityAt: Date.now(),
    })

    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    await hooks.before({ tool: "bash", sessionID, callID: "call_chain" }, { args: {} })
    await hooks.after(
      { tool: "bash", sessionID, callID: "call_chain" },
      { title: "Ran command", output: "ok", metadata: null },
    )
    session.span.end()

    const spans = exporter.getFinishedSpans()
    const parentSpan = spans.find((s) => s.name === "invoke_agent opencode")!
    const childSpan = spans.find((s) => s.name === "execute_tool bash")!
    expect(childSpan.parentSpanContext?.spanId).toBe(parentSpan.spanContext().spanId)
    expect(childSpan.spanContext().traceId).toBe(parentSpan.spanContext().traceId)
  })

  test("tool span has no parent when session is absent", async () => {
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    await hooks.before({ tool: "bash", sessionID: "sess_missing", callID: "call_orphan" }, { args: {} })
    await hooks.after(
      { tool: "bash", sessionID: "sess_missing", callID: "call_orphan" },
      { title: "Ran command", output: "ok", metadata: null },
    )

    const spans = exporter.getFinishedSpans()
    const toolSpan = spans.find((s) => s.name === "execute_tool bash")!
    expect(toolSpan.parentSpanContext).toBeUndefined()
  })

  test("multiple tool spans share same trace as session", async () => {
    const sessionID = "sess_multi"
    const session = startSessionSpan(tracer, sessionID)
    state.sessionSpans.set(sessionID, {
      span: session.span,
      context: session.context,
      sessionID,
      requestCount: 0,
      lastActivityAt: Date.now(),
    })

    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    await hooks.before({ tool: "edit", sessionID, callID: "call_a" }, { args: {} })
    await hooks.after(
      { tool: "edit", sessionID, callID: "call_a" },
      { title: "Edited", output: "ok", metadata: { path: "/a.ts" } },
    )
    await hooks.before({ tool: "bash", sessionID, callID: "call_b" }, { args: {} })
    await hooks.after(
      { tool: "bash", sessionID, callID: "call_b" },
      { title: "Ran", output: "ok", metadata: null },
    )
    session.span.end()

    const spans = exporter.getFinishedSpans()
    const sessionTraceId = spans.find((s) => s.name === "invoke_agent opencode")!.spanContext().traceId
    const editSpan = spans.find((s) => s.name === "execute_tool edit")!
    const bashSpan = spans.find((s) => s.name === "execute_tool bash")!
    expect(editSpan.spanContext().traceId).toBe(sessionTraceId)
    expect(bashSpan.spanContext().traceId).toBe(sessionTraceId)
  })
})

describe("tool span filtering", () => {
  test("Filtered tool → no span created", async () => {
    state.filteredTools = new Set(["read", "glob"])
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    const callID = "call_filtered"
    await hooks.before({ tool: "read", sessionID: "sess_1", callID }, { args: {} })
    expect(state.toolSpans.has(callID)).toBe(false)
    const spans = exporter.getFinishedSpans()
    expect(spans.find((s) => s.name === "execute_tool read")).toBeUndefined()
  })

  test("Non-filtered tool → span created normally", async () => {
    state.filteredTools = new Set(["read", "glob"])
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    const callID = "call_allowed"
    await hooks.before({ tool: "edit", sessionID: "sess_1", callID }, { args: {} })
    expect(state.toolSpans.has(callID)).toBe(true)
  })

  test("Filtered tool → metric still recorded", async () => {
    state.filteredTools = new Set(["read", "glob"])
    const { toolInvocationsSpy } = createMockInstruments()
    const filteredInstruments = {
      tokenUsage: { record() {} },
      operationDuration: { record() {} },
      requestCount: { add() {} },
      compactionCount: { add() {} },
      fileChanges: { add() {} },
      toolInvocations: toolInvocationsSpy,
      vcsOperations: { add() {} },
    } as unknown as MetricInstruments

    const hooks = createToolExecuteHooks({ tracer, instruments: filteredInstruments, state })
    const callID = "call_filtered_metric"
    await hooks.before({ tool: "read", sessionID: "sess_1", callID }, { args: {} })
    expect(toolInvocationsSpy.calls).toEqual([
      { value: 1, attributes: { "gen_ai.tool.name": "read" } },
    ])
  })

  test("After hook for filtered tool → graceful no-op", async () => {
    state.filteredTools = new Set(["read", "glob"])
    const hooks = createToolExecuteHooks({ tracer, instruments, state })
    const callID = "call_filtered_after"
    await hooks.before({ tool: "glob", sessionID: "sess_1", callID }, { args: {} })
    expect(state.toolSpans.has(callID)).toBe(false)
    await hooks.after(
      { tool: "glob", sessionID: "sess_1", callID, args: {} },
      { title: "Found files", output: "ok", metadata: { files: ["/a.ts"] } },
    )
    const spans = exporter.getFinishedSpans()
    expect(spans.find((s) => s.name === "execute_tool glob")).toBeUndefined()
  })
})
