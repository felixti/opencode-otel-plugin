import { describe, test, expect } from "bun:test"
import { isNewerVersion, fetchLatestVersion } from "../../src/utils/update-checker"

describe("isNewerVersion", () => {
  test("returns true when latest is newer (patch)", () => {
    expect(isNewerVersion("0.7.0", "0.7.1")).toBe(true)
  })

  test("returns true when latest is newer (minor)", () => {
    expect(isNewerVersion("0.7.0", "0.8.0")).toBe(true)
  })

  test("returns true when latest is newer (major)", () => {
    expect(isNewerVersion("0.7.0", "1.0.0")).toBe(true)
  })

  test("returns false when versions are equal", () => {
    expect(isNewerVersion("0.7.0", "0.7.0")).toBe(false)
  })

  test("returns false when current is newer", () => {
    expect(isNewerVersion("0.8.0", "0.7.0")).toBe(false)
  })

  test("handles v prefix in current version", () => {
    expect(isNewerVersion("v0.7.0", "0.8.0")).toBe(true)
  })

  test("handles v prefix in latest version", () => {
    expect(isNewerVersion("0.7.0", "v0.8.0")).toBe(true)
  })

  test("handles v prefix in both versions", () => {
    expect(isNewerVersion("v0.7.0", "v0.8.0")).toBe(true)
  })

  test("compares numerically not lexically (0.10.0 > 0.9.0)", () => {
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(true)
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(false)
  })

  test("handles different length versions", () => {
    expect(isNewerVersion("0.7", "0.7.1")).toBe(true)
    expect(isNewerVersion("0.7.0", "0.7")).toBe(false)
  })

  test("returns false for equal versions with different lengths", () => {
    expect(isNewerVersion("0.7.0", "0.7.0.0")).toBe(false)
  })
})

describe("fetchLatestVersion", () => {
  test("returns null on network error", async () => {
    // Mock a failing fetch by using an invalid URL that will 404
    const result = await fetchLatestVersion("nonexistent-package-12345")
    // Should return null gracefully, not throw
    expect(result).toBeNull()
  })

  test("can fetch real package version", async () => {
    // This test actually hits the npm registry
    const result = await fetchLatestVersion("opencode-otel-plugin")
    // Should return a valid semver string or null (if network issues)
    if (result !== null) {
      expect(result).toMatch(/^\d+\.\d+\.\d+/)
    }
  })
})
