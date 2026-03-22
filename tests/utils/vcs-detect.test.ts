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

  describe("gh pr CLI detection", () => {
    test("detects gh pr create", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr create --title \"fix\"" }))
        .toEqual({ operation: "pr_create", source: "cli" })
    })

    test("detects gh pr merge", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr merge 123" }))
        .toEqual({ operation: "pr_merge", source: "cli" })
    })

    test("detects gh pr close", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr close 456" }))
        .toEqual({ operation: "pr_close", source: "cli" })
    })

    test("detects gh pr reopen", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr reopen 789" }))
        .toEqual({ operation: "pr_reopen", source: "cli" })
    })

    test("detects gh pr review", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr review --approve" }))
        .toEqual({ operation: "pr_review", source: "cli" })
    })

    test("detects gh pr edit", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr edit 123 --title \"new\"" }))
        .toEqual({ operation: "pr_edit", source: "cli" })
    })

    test("does not detect gh pr list (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr list" })).toBeNull()
    })

    test("does not detect gh pr view (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr view 123" })).toBeNull()
    })

    test("does not detect gh pr status (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr status" })).toBeNull()
    })

    test("does not detect gh pr checks (read operation)", () => {
      expect(classifyVcsOperation("bash", { command: "gh pr checks 123" })).toBeNull()
    })
  })

  describe("MCP tool detection", () => {
    test("detects create_pull_request MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__create_pull_request", {}))
        .toEqual({ operation: "pr_create", source: "mcp" })
    })

    test("detects merge_pull_request MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__merge_pull_request", {}))
        .toEqual({ operation: "pr_merge", source: "mcp" })
    })

    test("detects pull_request_review_write MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__pull_request_review_write", {}))
        .toEqual({ operation: "pr_review", source: "mcp" })
    })

    test("detects update_pull_request MCP tool", () => {
      expect(classifyVcsOperation("mcp__github__update_pull_request", {}))
        .toEqual({ operation: "pr_edit", source: "mcp" })
    })

    test("excludes update_pull_request_branch (not a PR edit)", () => {
      expect(classifyVcsOperation("mcp__github__update_pull_request_branch", {}))
        .toBeNull()
    })

    test("excludes create_pull_request_with_copilot", () => {
      expect(classifyVcsOperation("mcp__github__create_pull_request_with_copilot", {}))
        .toBeNull()
    })

    test("excludes list_pull_requests (read operation)", () => {
      expect(classifyVcsOperation("mcp__github__list_pull_requests", {}))
        .toBeNull()
    })

    test("excludes search_pull_requests (read operation)", () => {
      expect(classifyVcsOperation("mcp__github__search_pull_requests", {}))
        .toBeNull()
    })

    test("excludes pull_request_read (read operation)", () => {
      expect(classifyVcsOperation("mcp__github__pull_request_read", {}))
        .toBeNull()
    })

    test("works without prefix (bare tool name)", () => {
      expect(classifyVcsOperation("create_pull_request", {}))
        .toEqual({ operation: "pr_create", source: "mcp" })
    })

    test("works with single-underscore prefix", () => {
      expect(classifyVcsOperation("github_merge_pull_request", {}))
        .toEqual({ operation: "pr_merge", source: "mcp" })
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
