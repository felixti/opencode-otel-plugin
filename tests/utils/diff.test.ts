import { describe, expect, test } from "bun:test"
import { extractFileChanges } from "../../src/utils/diff"

interface TestFileDiff {
  path: string
  additions?: number
  deletions?: number
}

describe("extractFileChanges", () => {
  test("extracts added and removed lines from a diff array", () => {
    const diffs: TestFileDiff[] = [
      { path: "src/index.ts", additions: 10, deletions: 3 },
      { path: "src/utils.ts", additions: 5, deletions: 0 },
    ]
    const result = extractFileChanges(diffs)
    expect(result).toEqual([
      { filepath: "src/index.ts", linesAdded: 10, linesRemoved: 3, language: "typescript" },
      { filepath: "src/utils.ts", linesAdded: 5, linesRemoved: 0, language: "typescript" },
    ])
  })

  test("returns empty array for empty diff", () => {
    expect(extractFileChanges([])).toEqual([])
  })

  test("handles unknown file extensions", () => {
    const diffs: TestFileDiff[] = [{ path: "Makefile", additions: 2, deletions: 1 }]
    const result = extractFileChanges(diffs)
    expect(result).toEqual([
      { filepath: "Makefile", linesAdded: 2, linesRemoved: 1, language: "unknown" },
    ])
  })

  test("handles diffs with missing addition/deletion counts gracefully", () => {
    const diffs: TestFileDiff[] = [{ path: "src/foo.py" }]
    const result = extractFileChanges(diffs)
    expect(result).toEqual([
      { filepath: "src/foo.py", linesAdded: 0, linesRemoved: 0, language: "python" },
    ])
  })
})
