import { describe, expect, test } from "bun:test"
import { metrics } from "@opentelemetry/api"
import { createMetricInstruments } from "../../src/signals/metrics"

describe("createMetricInstruments", () => {
  test("creates all expected instruments", () => {
    const meter = metrics.getMeter("test")
    const instruments = createMetricInstruments(meter)

    expect(instruments.tokenUsage).toBeDefined()
    expect(instruments.operationDuration).toBeDefined()
    expect(instruments.requestCount).toBeDefined()
    expect(instruments.compactionCount).toBeDefined()
    expect(instruments.fileChanges).toBeDefined()
    expect(instruments.toolInvocations).toBeDefined()
  })

  test("recording metrics does not throw", () => {
    const meter = metrics.getMeter("test")
    const instruments = createMetricInstruments(meter)

    expect(() => {
      instruments.tokenUsage.record(100, {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.token.type": "input",
        "gen_ai.request.model": "gpt-4",
      })
    }).not.toThrow()

    expect(() => {
      instruments.operationDuration.record(1.5, {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": "gpt-4",
      })
    }).not.toThrow()

    expect(() => {
      instruments.requestCount.add(1, {
        "gen_ai.request.model": "gpt-4",
        "gen_ai.provider.name": "openai",
      })
    }).not.toThrow()

    expect(() => {
      instruments.compactionCount.add(1, {})
    }).not.toThrow()

    expect(() => {
      instruments.fileChanges.add(10, {
        "opencode.change.type": "added",
        "code.language": "typescript",
      })
    }).not.toThrow()

    expect(() => {
      instruments.toolInvocations.add(1, {
        "gen_ai.tool.name": "read",
      })
    }).not.toThrow()
  })
})
