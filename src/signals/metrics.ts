import type { Counter, Histogram, Meter } from "@opentelemetry/api"

export interface MetricInstruments {
  tokenUsage: Histogram
  operationDuration: Histogram
  requestCount: Counter
  compactionCount: Counter
  fileChanges: Counter
  toolInvocations: Counter
  vcsOperations: Counter
}

export function createMetricInstruments(meter: Meter): MetricInstruments {
  return {
    tokenUsage: meter.createHistogram("gen_ai.client.token.usage", {
      description: "Number of input and output tokens used per GenAI operation",
      unit: "{token}",
    }),
    operationDuration: meter.createHistogram("gen_ai.client.operation.duration", {
      description: "Duration of GenAI operations",
      unit: "s",
    }),
    requestCount: meter.createCounter("opencode.session.request.count", {
      description: "Total LLM requests per session",
      unit: "{request}",
    }),
    compactionCount: meter.createCounter("opencode.session.compaction.count", {
      description: "Number of session compaction calls",
      unit: "{compaction}",
    }),
    fileChanges: meter.createCounter("opencode.file.changes", {
      description: "Lines added or removed in file edits",
      unit: "{line}",
    }),
    toolInvocations: meter.createCounter("opencode.tool.invocations", {
      description: "Number of tool invocations",
      unit: "{invocation}",
    }),
    vcsOperations: meter.createCounter("opencode.vcs.operations", {
      description: "VCS operations (commits, PR mutations) performed during sessions",
      unit: "{operation}",
    }),
  }
}
