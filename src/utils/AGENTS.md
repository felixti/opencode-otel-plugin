# utils/

Pure helper functions with no OTel dependencies.

## Files

### `language.ts` — Language Detection (64 lines)

`detectLanguage(filepath)` → maps file extension to language name string. Uses a static `EXTENSION_MAP` covering 35+ extensions (TypeScript, Python, Go, Rust, etc.). Returns `"unknown"` for unrecognized extensions or files without extensions.

### `git.ts` — Git & Host Info (33 lines)

Shell-based git metadata extraction using `PluginInput["$"]` (BunShell):

- `getGitAuthor($)` → `git config user.email` (fallback: `"unknown"`)
- `getRepoUrl($)` → `git remote get-url origin` (fallback: `"unknown"`)
- `getCurrentBranch($)` → `git branch --show-current` (fallback: `"unknown"`)
- `getHostname()` → `os.hostname()` (fallback: `"unknown"`)

All functions use a shared `shellGet()` helper that runs commands via `$\`sh -c ${cmd}\`.quiet()` and returns the trimmed output or a fallback string on error.

### `truncate.ts` — String Truncation (7 lines)

`truncate(value, maxLength)` → truncates strings for low-cardinality span attributes. Used by `setMetadataAttributes` in `hooks/tool-execute.ts` and for branch/version attributes.

### `vcs-detect.ts` — VCS Operation Detection (71 lines)

`classifyVcsOperation(tool, args)` → classifies a tool execution as a VCS operation or returns `null`. Pure function with no side effects.

Types: `VcsOperation` (7-value union: `commit`, `pr_create`, `pr_merge`, `pr_close`, `pr_reopen`, `pr_review`, `pr_edit`), `VcsDetectionResult` (`{ operation, source }`).

Detection channels:
- **Bash CLI**: regex patterns match `git commit` and `gh pr {create,merge,close,reopen,review,edit}` in command strings, handling chained commands (`&&`, `;`) and env prefixes.
- **MCP tools**: case-insensitive substring matching on tool names containing `pull_request`, with guards for copilot and branch-update variants.

### `index.ts` — Barrel Export (4 lines)

Re-exports `detectLanguage`, `getGitAuthor`, `getRepoUrl`, `getCurrentBranch`, `getHostname`, `truncate`, `classifyVcsOperation`, `VcsOperation`, `VcsDetectionResult`.
