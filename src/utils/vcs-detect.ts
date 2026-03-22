export type VcsOperation =
  | "commit"
  | "pr_create"
  | "pr_merge"
  | "pr_close"
  | "pr_reopen"
  | "pr_review"
  | "pr_edit"

export interface VcsDetectionResult {
  operation: VcsOperation
  source: "cli" | "mcp"
}

// Bash command patterns — match at start of command or after && / ; chain separators
const GIT_COMMIT_RE = /(?:^|&&\s*|;\s*)(?:\S+=\S+\s+)*git\s+commit\b/
const GH_PR_CREATE_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+create\b/
const GH_PR_MERGE_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+merge\b/
const GH_PR_CLOSE_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+close\b/
const GH_PR_REOPEN_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+reopen\b/
const GH_PR_REVIEW_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+review\b/
const GH_PR_EDIT_RE = /(?:^|&&\s*|;\s*)gh\s+pr\s+edit\b/

// Ordered list: first match wins
const CLI_PATTERNS: ReadonlyArray<[RegExp, VcsOperation]> = [
  [GIT_COMMIT_RE, "commit"],
  [GH_PR_CREATE_RE, "pr_create"],
  [GH_PR_MERGE_RE, "pr_merge"],
  [GH_PR_CLOSE_RE, "pr_close"],
  [GH_PR_REOPEN_RE, "pr_reopen"],
  [GH_PR_REVIEW_RE, "pr_review"],
  [GH_PR_EDIT_RE, "pr_edit"],
]

function classifyBash(args: unknown): VcsDetectionResult | null {
  if (!args || typeof args !== "object") return null
  const command = (args as Record<string, unknown>).command
  if (typeof command !== "string" || command.length === 0) return null

  for (const [pattern, operation] of CLI_PATTERNS) {
    if (pattern.test(command)) {
      return { operation, source: "cli" }
    }
  }
  return null
}

function classifyMcp(tool: string): VcsDetectionResult | null {
  const lower = tool.toLowerCase()
  // Guard: exclude copilot and branch-update variants
  if (lower.includes("copilot")) return null
  if (lower.includes("merge_pull_request")) return { operation: "pr_merge", source: "mcp" }
  if (lower.includes("pull_request_review")) return { operation: "pr_review", source: "mcp" }
  if (lower.includes("update_pull_request")) {
    if (lower.includes("branch")) return null
    return { operation: "pr_edit", source: "mcp" }
  }
  if (lower.includes("create_pull_request")) return { operation: "pr_create", source: "mcp" }
  return null
}

/** Classify a tool execution as a VCS operation, or null if not VCS-related. */
export function classifyVcsOperation(
  tool: string,
  args?: unknown,
): VcsDetectionResult | null {
  // Fast path: vast majority of tools are not VCS-related
  if (tool === "bash") return classifyBash(args)
  if (tool.includes("pull_request")) return classifyMcp(tool)
  return null
}
