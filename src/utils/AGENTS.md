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

### `index.ts` — Barrel Export (3 lines)

Re-exports `detectLanguage`, `getGitAuthor`, `getRepoUrl`, `getCurrentBranch`, `getHostname`, `truncate`.
