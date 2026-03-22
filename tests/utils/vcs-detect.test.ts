import { describe, expect, test } from "bun:test"
import { classifyVcsOperation } from "../../src/utils/vcs-detect"

describe("classifyVcsOperation", () => {
  describe("git commit detection", () => {
    test("detects simple git commit", () => {
      expect(classifyVcsOperation("bash", { command: "git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit --amend", () => {
      expect(classifyVcsOperation("bash", { command: "git commit --amend" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit in chained command", () => {
      expect(classifyVcsOperation("bash", { command: "git add . && git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit with env prefix", () => {
      expect(classifyVcsOperation("bash", { command: "GIT_AUTHOR_NAME=x git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("detects git commit after semicolon", () => {
      expect(classifyVcsOperation("bash", { command: "echo done; git commit -m \"msg\"" }))
        .toEqual({ operation: "commit", source: "cli" })
    })

    test("first VCS match wins in chain (commit before pr)", () => {
      expect(classifyVcsOperation("bash", { command: "git commit -m \"msg\" && gh pr create" }))
        .toEqual({ operation: "commit", source: "cli" })
    })
  })

  describe("non-VCS operations return null", () => {
    test("returns null for non-bash tool", () => {
      expect(classifyVcsOperation("edit", { path: "/src/app.ts" })).toBeNull()
    })

    test("returns null for bash with git push", () => {
      expect(classifyVcsOperation("bash", { command: "git push origin main" })).toBeNull()
    })

    test("returns null for bash with git status", () => {
      expect(classifyVcsOperation("bash", { command: "git status" })).toBeNull()
    })

    test("returns null for bash with no args", () => {
      expect(classifyVcsOperation("bash", undefined)).toBeNull()
    })

    test("returns null for bash with non-object args", () => {
      expect(classifyVcsOperation("bash", "string args")).toBeNull()
    })

    test("returns null for bash with empty command", () => {
      expect(classifyVcsOperation("bash", { command: "" })).toBeNull()
    })
  })
})
