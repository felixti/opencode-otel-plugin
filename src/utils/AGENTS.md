# utils/

Pure helper functions with no OTel dependencies.

## Files

### `language.ts` — Language Detection (64 lines)

`detectLanguage(filepath)` → maps file extension to language name string. Uses a static `EXTENSION_MAP` covering 35+ extensions (TypeScript, Python, Go, Rust, etc.). Returns `"unknown"` for unrecognized extensions or files without extensions.

### `diff.ts` — Diff Parsing (17 lines)

`extractFileChanges(diffs)` → converts `session.diff` event payloads into `FileChangeStats[]`. Maps each diff entry's `additions`/`deletions` (defaulting to 0) and calls `detectLanguage` on the path.

### `git.ts` — Git & Host Info (33 lines)

Shell-based git metadata extraction using `PluginInput["$"]` (BunShell):

- `getGitAuthor($)` → `git config user.email` (fallback: `"unknown"`)
- `getRepoUrl($)` → `git remote get-url origin` (fallback: `"unknown"`)
- `getCurrentBranch($)` → `git branch --show-current` (fallback: `"unknown"`)
- `getHostname()` → `os.hostname()` (fallback: `"unknown"`)

All functions use a shared `shellGet()` helper that runs commands via `$\`sh -c ${cmd}\`.quiet()` and returns the trimmed output or a fallback string on error.

### `index.ts` — Barrel Export (3 lines)
