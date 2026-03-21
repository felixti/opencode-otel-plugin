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
})
