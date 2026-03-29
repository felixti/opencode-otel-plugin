import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { parseFilteredTools } from "../src/index"

describe("parseFilteredTools", () => {
  const originalEnv = process.env.OTEL_OPENCODE_FILTERED_TOOLS

  beforeEach(() => {
    // Restore env before each test
    if (originalEnv === undefined) {
      delete process.env.OTEL_OPENCODE_FILTERED_TOOLS
    } else {
      process.env.OTEL_OPENCODE_FILTERED_TOOLS = originalEnv
    }
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OTEL_OPENCODE_FILTERED_TOOLS
    } else {
      process.env.OTEL_OPENCODE_FILTERED_TOOLS = originalEnv
    }
  })

  test("unset env var → empty Set", () => {
    delete process.env.OTEL_OPENCODE_FILTERED_TOOLS
    const result = parseFilteredTools()
    expect(result.size).toBe(0)
  })

  test("empty string → empty Set", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = ""
    const result = parseFilteredTools()
    expect(result.size).toBe(0)
  })

  test("single tool name → Set with 1 item", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = "read"
    const result = parseFilteredTools()
    expect(result.size).toBe(1)
    expect(result.has("read")).toBe(true)
  })

  test("multiple tool names → Set with all items", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = "read,glob,grep"
    const result = parseFilteredTools()
    expect(result.size).toBe(3)
    expect(result.has("read")).toBe(true)
    expect(result.has("glob")).toBe(true)
    expect(result.has("grep")).toBe(true)
  })

  test("whitespace trimmed", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = " read , glob , grep "
    const result = parseFilteredTools()
    expect(result.size).toBe(3)
    expect(result.has("read")).toBe(true)
    expect(result.has("glob")).toBe(true)
    expect(result.has("grep")).toBe(true)
    // Ensure no whitespace in keys
    for (const tool of result) {
      expect(tool).toBe(tool.trim())
      expect(tool).not.toContain(" ")
    }
  })

  test("empty strings between commas filtered out", () => {
    process.env.OTEL_OPENCODE_FILTERED_TOOLS = "read,,glob"
    const result = parseFilteredTools()
    expect(result.size).toBe(2)
    expect(result.has("read")).toBe(true)
    expect(result.has("glob")).toBe(true)
    expect(result.has("")).toBe(false)
  })
})
