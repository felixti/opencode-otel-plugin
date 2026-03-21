# OpenCode OTel Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publishable OpenCode plugin that instruments AI coding sessions with OpenTelemetry traces and metrics via OTLP/HTTP.

**Architecture:** OpenCode plugin hooks capture session events, tool calls, and chat params. These feed into OTel SDK (modular packages) to produce spans following gen_ai semantic conventions and custom metrics. All telemetry exports via OTLP/HTTP to a configurable endpoint. Resource attributes carry git author, hostname, project, repo, and branch info.

**Tech Stack:** TypeScript, Bun, @opencode-ai/plugin, @opentelemetry/* modular packages (api 1.9.0, sdk-trace-base 2.6.0, sdk-metrics 2.6.0, exporters 0.213.0, resources 2.6.0, semantic-conventions 1.40.0)

**Design doc:** `docs/plans/2026-03-21-opencode-otel-plugin-design.md`

**Skills to load:** `create-opencode-plugin`, `opentelemetry`, `genai-semconv`

---

## File Structure

```
opencode-otel-plugin/
├── src/
│   ├── index.ts                 # Plugin entry — wires hooks to signals
│   ├── types.ts                 # Shared types (SessionState, ToolSpanMap, etc.)
│   ├── telemetry/
│   │   ├── index.ts             # Barrel: re-exports provider, resources, shutdown
│   │   ├── provider.ts          # Creates TracerProvider + MeterProvider with OTLP/HTTP exporters
│   │   ├── resources.ts         # Builds Resource with git, host, project attributes
│   │   └── shutdown.ts          # Graceful flush + shutdown of providers
│   ├── hooks/
│   │   ├── index.ts             # Barrel: re-exports all hook factories
│   │   ├── event.ts             # Event hook — dispatches session/file/compaction events
│   │   ├── chat-params.ts       # chat.params hook — captures model/provider per request
│   │   └── tool-execute.ts      # tool.execute.before/after — wraps tool calls in spans
│   ├── signals/
│   │   ├── index.ts             # Barrel: re-exports spans + metrics
│   │   ├── spans.ts             # Span helpers (startSessionSpan, startChatSpan, etc.)
│   │   └── metrics.ts           # Metric instrument creation + recording helpers
│   └── utils/
│       ├── index.ts             # Barrel: re-exports all utils
│       ├── git.ts               # Shell helpers: git email, repo URL, branch
│       ├── language.ts          # File extension → programming language mapping
│       └── diff.ts              # FileDiff[] → {linesAdded, linesRemoved} extraction
├── tests/
│   ├── utils/
│   │   ├── language.test.ts     # Tests for language detection
│   │   └── diff.test.ts         # Tests for diff parsing
│   ├── signals/
│   │   ├── metrics.test.ts      # Tests for metric recording
│   │   └── spans.test.ts        # Tests for span creation
│   └── telemetry/
│       └── resources.test.ts    # Tests for resource building
├── package.json
├── tsconfig.json
└── README.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "opencode-otel-plugin",
  "version": "0.1.0",
  "description": "OpenTelemetry observability plugin for OpenCode — traces, metrics, and resource attributes for AI coding sessions",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "bun build ./src/index.ts --outdir dist --target bun",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": ">=0.1.0"
  },
  "dependencies": {
    "@opentelemetry/api": "1.9.0",
    "@opentelemetry/sdk-trace-base": "2.6.0",
    "@opentelemetry/sdk-metrics": "2.6.0",
    "@opentelemetry/exporter-trace-otlp-http": "0.213.0",
    "@opentelemetry/exporter-metrics-otlp-http": "0.213.0",
    "@opentelemetry/resources": "2.6.0",
    "@opentelemetry/semantic-conventions": "1.40.0"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "latest",
    "@types/bun": "latest",
    "typescript": "latest"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: Lock file created, all packages resolved.

- [ ] **Step 5: Verify typecheck**

Run: `bun run typecheck`
Expected: No errors (empty project, nothing to check yet).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lockb
git commit -m "chore: scaffold project with OTel dependencies"
```

---

## Task 2: Types Module

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create shared types**

```typescript
// Shared types for the OpenCode OTel plugin.
// Defines state tracking structures used across hooks and signals.

import type { Span } from "@opentelemetry/api"

/** Tracks the active OTel span for a session root. */
export interface SessionSpanState {
  span: Span
  sessionID: string
  requestCount: number
}

/** Model/provider info captured in chat.params, used when ending chat spans. */
export interface ChatRequestInfo {
  model: string
  provider: string
  startTime: number
}

/** Accumulated file change stats from session.diff events. */
export interface FileChangeStats {
  linesAdded: number
  linesRemoved: number
  filepath: string
  language: string
}

/** In-flight tool span keyed by callID. */
export type ToolSpanMap = Map<string, Span>

/** Plugin-wide mutable state shared across hooks. */
export interface PluginState {
  sessionSpans: Map<string, SessionSpanState>
  toolSpans: ToolSpanMap
  pendingChatRequests: Map<string, ChatRequestInfo>
  currentBranch: string | undefined
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: Clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types for plugin state tracking"
```

---

## Task 3: Language Detection Utility

**Files:**
- Create: `src/utils/language.ts`
- Create: `tests/utils/language.test.ts`
- Create: `src/utils/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/language.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { detectLanguage } from "../../src/utils/language"

describe("detectLanguage", () => {
  test("detects TypeScript from .ts extension", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript")
  })

  test("detects TypeScript from .tsx extension", () => {
    expect(detectLanguage("components/App.tsx")).toBe("typescript")
  })

  test("detects JavaScript from .js extension", () => {
    expect(detectLanguage("lib/utils.js")).toBe("javascript")
  })

  test("detects Python from .py extension", () => {
    expect(detectLanguage("main.py")).toBe("python")
  })

  test("detects Go from .go extension", () => {
    expect(detectLanguage("cmd/server.go")).toBe("go")
  })

  test("detects Rust from .rs extension", () => {
    expect(detectLanguage("src/main.rs")).toBe("rust")
  })

  test("detects JSON from .json extension", () => {
    expect(detectLanguage("package.json")).toBe("json")
  })

  test("detects YAML from .yml extension", () => {
    expect(detectLanguage("config.yml")).toBe("yaml")
  })

  test("detects YAML from .yaml extension", () => {
    expect(detectLanguage("docker-compose.yaml")).toBe("yaml")
  })

  test("detects Markdown from .md extension", () => {
    expect(detectLanguage("README.md")).toBe("markdown")
  })

  test("returns 'unknown' for unrecognized extensions", () => {
    expect(detectLanguage("data.xyz")).toBe("unknown")
  })

  test("returns 'unknown' for files without extension", () => {
    expect(detectLanguage("Makefile")).toBe("unknown")
  })

  test("handles dotfiles", () => {
    expect(detectLanguage(".gitignore")).toBe("unknown")
  })

  test("detects CSS", () => {
    expect(detectLanguage("styles.css")).toBe("css")
  })

  test("detects HTML", () => {
    expect(detectLanguage("index.html")).toBe("html")
  })

  test("detects C# from .cs extension", () => {
    expect(detectLanguage("Program.cs")).toBe("csharp")
  })

  test("detects Java from .java extension", () => {
    expect(detectLanguage("Main.java")).toBe("java")
  })

  test("detects Ruby from .rb extension", () => {
    expect(detectLanguage("app.rb")).toBe("ruby")
  })

  test("detects PHP from .php extension", () => {
    expect(detectLanguage("index.php")).toBe("php")
  })

  test("detects Swift from .swift extension", () => {
    expect(detectLanguage("ViewController.swift")).toBe("swift")
  })

  test("detects Kotlin from .kt extension", () => {
    expect(detectLanguage("Main.kt")).toBe("kotlin")
  })

  test("detects Shell from .sh extension", () => {
    expect(detectLanguage("setup.sh")).toBe("shell")
  })

  test("detects SQL from .sql extension", () => {
    expect(detectLanguage("schema.sql")).toBe("sql")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/utils/language.test.ts`
Expected: FAIL — module `../../src/utils/language` not found.

- [ ] **Step 3: Write implementation**

Create `src/utils/language.ts`:

```typescript
// Maps file extensions to programming language names.
// Used to tag file edit spans and metrics with the language being modified.

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".cs": "csharp",
  ".fs": "fsharp",
  ".swift": "swift",
  ".php": "php",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".html": "html",
  ".htm": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".ps1": "powershell",
  ".r": "r",
  ".R": "r",
  ".dart": "dart",
  ".lua": "lua",
  ".zig": "zig",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".tf": "terraform",
  ".hcl": "hcl",
  ".proto": "protobuf",
  ".graphql": "graphql",
  ".gql": "graphql",
}

/** Detects the programming language from a file path's extension. */
export function detectLanguage(filepath: string): string {
  const lastDot = filepath.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === filepath.length - 1) return "unknown"

  const ext = filepath.slice(lastDot).toLowerCase()
  return EXTENSION_MAP[ext] ?? "unknown"
}
```

- [ ] **Step 4: Create barrel export**

Create `src/utils/index.ts`:

```typescript
// Utility functions for git info, language detection, and diff parsing.

export { detectLanguage } from "./language"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/utils/language.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/ tests/utils/language.test.ts
git commit -m "feat: add file extension to language detection utility"
```

---

## Task 4: Diff Parsing Utility

**Files:**
- Create: `src/utils/diff.ts`
- Create: `tests/utils/diff.test.ts`
- Modify: `src/utils/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/diff.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { extractFileChanges } from "../../src/utils/diff"

describe("extractFileChanges", () => {
  test("extracts added and removed lines from a diff array", () => {
    const diffs = [
      { path: "src/index.ts", additions: 10, deletions: 3 },
      { path: "src/utils.ts", additions: 5, deletions: 0 },
    ]
    const result = extractFileChanges(diffs as any)
    expect(result).toEqual([
      { filepath: "src/index.ts", linesAdded: 10, linesRemoved: 3, language: "typescript" },
      { filepath: "src/utils.ts", linesAdded: 5, linesRemoved: 0, language: "typescript" },
    ])
  })

  test("returns empty array for empty diff", () => {
    expect(extractFileChanges([])).toEqual([])
  })

  test("handles unknown file extensions", () => {
    const diffs = [{ path: "Makefile", additions: 2, deletions: 1 }]
    const result = extractFileChanges(diffs as any)
    expect(result).toEqual([
      { filepath: "Makefile", linesAdded: 2, linesRemoved: 1, language: "unknown" },
    ])
  })

  test("handles diffs with missing addition/deletion counts gracefully", () => {
    const diffs = [{ path: "src/foo.py" }]
    const result = extractFileChanges(diffs as any)
    expect(result).toEqual([
      { filepath: "src/foo.py", linesAdded: 0, linesRemoved: 0, language: "python" },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/utils/diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/utils/diff.ts`:

```typescript
// Extracts line-level file change stats from OpenCode session diff events.
// The FileDiff type comes from the OpenCode SDK event system.

import type { FileChangeStats } from "../types"
import { detectLanguage } from "./language"

/** A minimal representation of OpenCode's FileDiff, accepting any shape. */
interface FileDiffLike {
  path: string
  additions?: number
  deletions?: number
}

/** Converts an array of FileDiff objects into structured change stats. */
export function extractFileChanges(diffs: FileDiffLike[]): FileChangeStats[] {
  return diffs.map((diff) => ({
    filepath: diff.path,
    linesAdded: diff.additions ?? 0,
    linesRemoved: diff.deletions ?? 0,
    language: detectLanguage(diff.path),
  }))
}
```

- [ ] **Step 4: Update barrel export**

Add to `src/utils/index.ts`:

```typescript
export { extractFileChanges } from "./diff"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/utils/diff.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/diff.ts src/utils/index.ts tests/utils/diff.test.ts
git commit -m "feat: add diff parsing utility for file change extraction"
```

---

## Task 5: Git Info Utility

**Files:**
- Create: `src/utils/git.ts`
- Modify: `src/utils/index.ts`

- [ ] **Step 1: Write implementation**

Note: Git utilities use the Bun shell (`$`) which requires the plugin runtime context. We test these indirectly via integration. Unit testing shell commands adds complexity without proportional value here.

Create `src/utils/git.ts`:

```typescript
// Helpers to extract git metadata (author, repo, branch) via Bun shell.
// These run once at plugin initialization to populate resource attributes.

import type { BunShell } from "bun"

/** Runs a shell command quietly and returns trimmed stdout, or fallback on error. */
async function shellGet($: BunShell, cmd: string, fallback: string): Promise<string> {
  try {
    const result = await $`sh -c ${cmd}`.quiet()
    return result.text().trim() || fallback
  } catch {
    return fallback
  }
}

/** Gets the git user email, falling back to user name, then "unknown". */
export async function getGitAuthor($: BunShell): Promise<string> {
  const email = await shellGet($, "git config user.email", "")
  if (email) return email
  return shellGet($, "git config user.name", "unknown")
}

/** Gets the remote origin URL (repository identifier). */
export async function getRepoUrl($: BunShell): Promise<string> {
  return shellGet($, "git remote get-url origin", "unknown")
}

/** Gets the current branch name. */
export async function getCurrentBranch($: BunShell): Promise<string> {
  return shellGet($, "git branch --show-current", "unknown")
}

/** Gets the machine hostname. */
export function getHostname(): string {
  try {
    return require("os").hostname() ?? "unknown"
  } catch {
    return "unknown"
  }
}
```

- [ ] **Step 2: Update barrel export**

Add to `src/utils/index.ts`:

```typescript
export { getGitAuthor, getRepoUrl, getCurrentBranch, getHostname } from "./git"
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/utils/git.ts src/utils/index.ts
git commit -m "feat: add git info and hostname utilities"
```

---

## Task 6: OTel Resource Builder

**Files:**
- Create: `src/telemetry/resources.ts`
- Create: `src/telemetry/index.ts`
- Create: `tests/telemetry/resources.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/telemetry/resources.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { buildResourceAttributes } from "../../src/telemetry/resources"

describe("buildResourceAttributes", () => {
  test("includes all required resource attributes", () => {
    const attrs = buildResourceAttributes({
      author: "dev@example.com",
      hostname: "macbook-pro",
      projectName: "my-project",
      repoUrl: "https://github.com/org/repo",
      branch: "main",
      worktree: "/Users/dev/projects/my-project",
      directory: "/Users/dev/projects/my-project",
    })

    expect(attrs["service.name"]).toBe("opencode")
    expect(attrs["host.name"]).toBe("macbook-pro")
    expect(attrs["enduser.id"]).toBe("dev@example.com")
    expect(attrs["opencode.project.name"]).toBe("my-project")
    expect(attrs["vcs.repository.url.full"]).toBe("https://github.com/org/repo")
    expect(attrs["vcs.repository.ref.name"]).toBe("main")
    expect(attrs["opencode.worktree"]).toBe("/Users/dev/projects/my-project")
    expect(attrs["opencode.directory"]).toBe("/Users/dev/projects/my-project")
  })

  test("uses fallback values for missing data", () => {
    const attrs = buildResourceAttributes({
      author: "unknown",
      hostname: "unknown",
      projectName: "",
      repoUrl: "unknown",
      branch: "unknown",
      worktree: "",
      directory: "",
    })

    expect(attrs["service.name"]).toBe("opencode")
    expect(attrs["host.name"]).toBe("unknown")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/telemetry/resources.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/telemetry/resources.ts`:

```typescript
// Builds the OTel Resource with static attributes gathered at plugin init.
// These attributes are attached to every span and metric exported.

import { Resource } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_HOST_NAME } from "@opentelemetry/semantic-conventions"

export interface ResourceInput {
  author: string
  hostname: string
  projectName: string
  repoUrl: string
  branch: string
  worktree: string
  directory: string
  opencodeVersion?: string
}

/** Builds a flat attributes record from resource input. Useful for testing. */
export function buildResourceAttributes(input: ResourceInput): Record<string, string> {
  return {
    [ATTR_SERVICE_NAME]: "opencode",
    [ATTR_HOST_NAME]: input.hostname,
    ...(input.opencodeVersion ? { [ATTR_SERVICE_VERSION]: input.opencodeVersion } : {}),
    "enduser.id": input.author,
    "opencode.project.name": input.projectName,
    "vcs.repository.url.full": input.repoUrl,
    "vcs.repository.ref.name": input.branch,
    "opencode.worktree": input.worktree,
    "opencode.directory": input.directory,
  }
}

/** Creates an OTel Resource from plugin context data. */
export function createResource(input: ResourceInput): Resource {
  return new Resource(buildResourceAttributes(input))
}
```

- [ ] **Step 4: Create barrel export**

Create `src/telemetry/index.ts`:

```typescript
// Telemetry initialization: providers, resource building, and shutdown.

export { buildResourceAttributes, createResource } from "./resources"
export type { ResourceInput } from "./resources"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/telemetry/resources.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/telemetry/ tests/telemetry/
git commit -m "feat: add OTel resource builder with git and project attributes"
```

---

## Task 7: OTel Provider Setup

**Files:**
- Create: `src/telemetry/provider.ts`
- Create: `src/telemetry/shutdown.ts`
- Modify: `src/telemetry/index.ts`

- [ ] **Step 1: Write provider setup**

Create `src/telemetry/provider.ts`:

```typescript
// Initializes the OTel TracerProvider and MeterProvider with OTLP/HTTP exporters.
// Reads endpoint configuration from standard OTEL_EXPORTER_OTLP_* env vars.

import { trace, metrics } from "@opentelemetry/api"
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { Resource } from "@opentelemetry/resources"

export interface Providers {
  tracerProvider: BasicTracerProvider
  meterProvider: MeterProvider
}

/** Creates and registers global TracerProvider and MeterProvider. */
export function initProviders(resource: Resource): Providers {
  const traceExporter = new OTLPTraceExporter()
  const tracerProvider = new BasicTracerProvider({ resource })
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter))
  tracerProvider.register()

  const metricExporter = new OTLPMetricExporter()
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30_000,
  })
  const meterProvider = new MeterProvider({ resource, readers: [metricReader] })
  metrics.setGlobalMeterProvider(meterProvider)

  return { tracerProvider, meterProvider }
}
```

- [ ] **Step 2: Write shutdown helper**

Create `src/telemetry/shutdown.ts`:

```typescript
// Graceful shutdown: flushes pending spans and metrics before the process exits.
// Called on session.idle or global.disposed events.

import type { Providers } from "./provider"

/** Flushes and shuts down both trace and metric providers. */
export async function shutdownProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      providers.tracerProvider.forceFlush(),
      providers.meterProvider.forceFlush(),
    ])
  } catch {
    // Swallow shutdown errors — never crash the host process
  }
}

/** Flushes pending data without shutting down. Use between sessions. */
export async function flushProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      providers.tracerProvider.forceFlush(),
      providers.meterProvider.forceFlush(),
    ])
  } catch {
    // Swallow flush errors
  }
}
```

- [ ] **Step 3: Update barrel export**

Replace `src/telemetry/index.ts`:

```typescript
// Telemetry initialization: providers, resource building, and shutdown.

export { buildResourceAttributes, createResource } from "./resources"
export type { ResourceInput } from "./resources"
export { initProviders } from "./provider"
export type { Providers } from "./provider"
export { shutdownProviders, flushProviders } from "./shutdown"
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry/
git commit -m "feat: add OTel provider init and graceful shutdown"
```

---

## Task 8: Metric Instruments

**Files:**
- Create: `src/signals/metrics.ts`
- Create: `src/signals/index.ts`
- Create: `tests/signals/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/signals/metrics.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/signals/metrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/signals/metrics.ts`:

```typescript
// Defines all metric instruments for the plugin.
// Follows gen_ai semantic conventions for token usage and operation duration.

import type { Meter, Counter, Histogram } from "@opentelemetry/api"

export interface MetricInstruments {
  /** gen_ai.client.token.usage — histogram of tokens per request */
  tokenUsage: Histogram
  /** gen_ai.client.operation.duration — histogram of LLM call duration in seconds */
  operationDuration: Histogram
  /** opencode.session.request.count — counter of LLM requests per session */
  requestCount: Counter
  /** opencode.session.compaction.count — counter of compaction calls */
  compactionCount: Counter
  /** opencode.file.changes — counter of lines added/removed */
  fileChanges: Counter
  /** opencode.tool.invocations — counter of tool calls */
  toolInvocations: Counter
}

/** Creates all metric instruments from a Meter instance. */
export function createMetricInstruments(meter: Meter): MetricInstruments {
  return {
    tokenUsage: meter.createHistogram("gen_ai.client.token.usage", {
      description: "Number of input and output tokens used per GenAI operation",
      unit: "{token}",
    }),
    operationDuration: meter.createHistogram("gen_ai.client.operation.duration", {
      description: "Duration of GenAI operations",
      unit: "s",
    }),
    requestCount: meter.createCounter("opencode.session.request.count", {
      description: "Total LLM requests per session",
      unit: "{request}",
    }),
    compactionCount: meter.createCounter("opencode.session.compaction.count", {
      description: "Number of session compaction calls",
      unit: "{compaction}",
    }),
    fileChanges: meter.createCounter("opencode.file.changes", {
      description: "Lines added or removed in file edits",
      unit: "{line}",
    }),
    toolInvocations: meter.createCounter("opencode.tool.invocations", {
      description: "Number of tool invocations",
      unit: "{invocation}",
    }),
  }
}
```

- [ ] **Step 4: Create barrel export**

Create `src/signals/index.ts`:

```typescript
// Signal creation helpers for spans and metric instruments.

export { createMetricInstruments } from "./metrics"
export type { MetricInstruments } from "./metrics"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/signals/metrics.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/signals/ tests/signals/
git commit -m "feat: add metric instrument definitions (gen_ai semconv + custom)"
```

---

## Task 9: Span Helpers

**Files:**
- Create: `src/signals/spans.ts`
- Create: `tests/signals/spans.test.ts`
- Modify: `src/signals/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/signals/spans.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from "bun:test"
import { trace, SpanKind, context } from "@opentelemetry/api"
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { startSessionSpan, startChatSpan, startToolSpan, startFileEditSpan, startCompactionSpan } from "../../src/signals/spans"

let exporter: InMemorySpanExporter

beforeEach(() => {
  exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider()
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
  provider.register()
})

describe("startSessionSpan", () => {
  test("creates an INTERNAL span named invoke_agent opencode", () => {
    const tracer = trace.getTracer("test")
    const span = startSessionSpan(tracer, "sess_123")
    span.end()

    const spans = exporter.getFinishedSpans()
    expect(spans.length).toBe(1)
    expect(spans[0].name).toBe("invoke_agent opencode")
    expect(spans[0].kind).toBe(SpanKind.INTERNAL)
  })
})

describe("startChatSpan", () => {
  test("creates a CLIENT span with model name", () => {
    const tracer = trace.getTracer("test")
    const span = startChatSpan(tracer, { model: "gpt-4", provider: "openai", sessionID: "sess_123" })
    span.end()

    const spans = exporter.getFinishedSpans()
    const chatSpan = spans.find((s) => s.name === "chat gpt-4")
    expect(chatSpan).toBeDefined()
    expect(chatSpan!.kind).toBe(SpanKind.CLIENT)
  })
})

describe("startToolSpan", () => {
  test("creates an INTERNAL span with tool name", () => {
    const tracer = trace.getTracer("test")
    const span = startToolSpan(tracer, { toolName: "read", callID: "call_1", sessionID: "sess_123" })
    span.end()

    const spans = exporter.getFinishedSpans()
    const toolSpan = spans.find((s) => s.name === "execute_tool read")
    expect(toolSpan).toBeDefined()
    expect(toolSpan!.kind).toBe(SpanKind.INTERNAL)
  })
})

describe("startFileEditSpan", () => {
  test("creates an INTERNAL span with filepath", () => {
    const tracer = trace.getTracer("test")
    const span = startFileEditSpan(tracer, {
      filepath: "src/index.ts",
      language: "typescript",
      linesAdded: 10,
      linesRemoved: 3,
      sessionID: "sess_123",
    })
    span.end()

    const spans = exporter.getFinishedSpans()
    const fileSpan = spans.find((s) => s.name === "file_edit src/index.ts")
    expect(fileSpan).toBeDefined()
  })
})

describe("startCompactionSpan", () => {
  test("creates an INTERNAL span for compaction", () => {
    const tracer = trace.getTracer("test")
    const span = startCompactionSpan(tracer, "sess_123")
    span.end()

    const spans = exporter.getFinishedSpans()
    const compSpan = spans.find((s) => s.name === "session_compaction")
    expect(compSpan).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/signals/spans.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/signals/spans.ts`:

```typescript
// Span creation helpers following gen_ai semantic conventions.
// Each function creates a span with the correct name, kind, and attributes.

import { type Tracer, type Span, SpanKind } from "@opentelemetry/api"

/** Starts the root session span: invoke_agent opencode. */
export function startSessionSpan(tracer: Tracer, sessionID: string): Span {
  return tracer.startSpan("invoke_agent opencode", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.agent.name": "opencode",
      "gen_ai.conversation.id": sessionID,
    },
  })
}

/** Starts a chat span for an LLM request. */
export function startChatSpan(
  tracer: Tracer,
  opts: { model: string; provider: string; sessionID: string },
): Span {
  return tracer.startSpan(`chat ${opts.model}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": opts.provider,
      "gen_ai.request.model": opts.model,
      "gen_ai.conversation.id": opts.sessionID,
    },
  })
}

/** Starts a tool execution span. */
export function startToolSpan(
  tracer: Tracer,
  opts: { toolName: string; callID: string; sessionID: string },
): Span {
  return tracer.startSpan(`execute_tool ${opts.toolName}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": opts.toolName,
      "gen_ai.tool.call.id": opts.callID,
      "gen_ai.conversation.id": opts.sessionID,
    },
  })
}

/** Starts a file edit span with change stats. */
export function startFileEditSpan(
  tracer: Tracer,
  opts: {
    filepath: string
    language: string
    linesAdded: number
    linesRemoved: number
    sessionID: string
  },
): Span {
  const span = tracer.startSpan(`file_edit ${opts.filepath}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.conversation.id": opts.sessionID,
      "code.filepath": opts.filepath,
      "code.language": opts.language,
      "opencode.file.lines_added": opts.linesAdded,
      "opencode.file.lines_removed": opts.linesRemoved,
    },
  })
  span.end()
  return span
}

/** Starts a session compaction span. */
export function startCompactionSpan(tracer: Tracer, sessionID: string): Span {
  const span = tracer.startSpan("session_compaction", {
    kind: SpanKind.INTERNAL,
    attributes: {
      "gen_ai.operation.name": "session_compaction",
      "gen_ai.conversation.id": sessionID,
    },
  })
  span.end()
  return span
}
```

- [ ] **Step 4: Update barrel export**

Add to `src/signals/index.ts`:

```typescript
export {
  startSessionSpan,
  startChatSpan,
  startToolSpan,
  startFileEditSpan,
  startCompactionSpan,
} from "./spans"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/signals/spans.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/signals/ tests/signals/spans.test.ts
git commit -m "feat: add span creation helpers (session, chat, tool, file, compaction)"
```

---

## Task 10: Event Hook

**Files:**
- Create: `src/hooks/event.ts`
- Create: `src/hooks/index.ts`

- [ ] **Step 1: Write implementation**

Create `src/hooks/event.ts`:

```typescript
// Event hook — dispatches OpenCode events to the appropriate OTel signals.
// Handles session lifecycle, file edits, compaction, and branch updates.

import type { Tracer } from "@opentelemetry/api"
import type { PluginState, FileChangeStats } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startSessionSpan, startFileEditSpan, startCompactionSpan } from "../signals/spans"
import { extractFileChanges } from "../utils/diff"
import { detectLanguage } from "../utils/language"
import { flushProviders } from "../telemetry/shutdown"
import type { Providers } from "../telemetry/provider"

interface EventHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
  providers: Providers
}

/** Creates the event hook handler. */
export function createEventHook(deps: EventHookDeps) {
  const { tracer, instruments, state, providers } = deps

  return async ({ event }: { event: any }) => {
    switch (event.type) {
      case "session.created": {
        const sessionID = event.properties.info?.id
        if (!sessionID) break
        const span = startSessionSpan(tracer, sessionID)
        state.sessionSpans.set(sessionID, { span, sessionID, requestCount: 0 })
        break
      }

      case "session.idle": {
        const sessionID = event.properties.sessionID as string
        const session = state.sessionSpans.get(sessionID)
        if (session) {
          session.span.setAttribute("opencode.session.request_count", session.requestCount)
          session.span.end()
          state.sessionSpans.delete(sessionID)
        }
        await flushProviders(providers)
        break
      }

      case "session.diff": {
        const sessionID = event.properties.sessionID as string
        const diffs = event.properties.diff as any[] | undefined
        if (!diffs?.length) break

        const changes: FileChangeStats[] = extractFileChanges(diffs)
        for (const change of changes) {
          startFileEditSpan(tracer, { ...change, sessionID })

          if (change.linesAdded > 0) {
            instruments.fileChanges.add(change.linesAdded, {
              "opencode.change.type": "added",
              "code.language": change.language,
              "code.filepath": change.filepath,
            })
          }
          if (change.linesRemoved > 0) {
            instruments.fileChanges.add(change.linesRemoved, {
              "opencode.change.type": "removed",
              "code.language": change.language,
              "code.filepath": change.filepath,
            })
          }
        }
        break
      }

      case "session.compacted": {
        const sessionID = event.properties.sessionID as string
        startCompactionSpan(tracer, sessionID)
        instruments.compactionCount.add(1, {
          "gen_ai.conversation.id": sessionID,
        })
        break
      }

      case "vcs.branch.updated": {
        state.currentBranch = event.properties.branch ?? state.currentBranch
        break
      }
    }
  }
}
```

- [ ] **Step 2: Create barrel export**

Create `src/hooks/index.ts`:

```typescript
// Hook factories for event, chat params, and tool execution.

export { createEventHook } from "./event"
export { createChatParamsHook } from "./chat-params"
export { createToolExecuteHooks } from "./tool-execute"
```

Note: chat-params.ts and tool-execute.ts are created in the next tasks. The barrel import will initially fail typecheck — that's expected until Tasks 11 and 12 are done.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/event.ts src/hooks/index.ts
git commit -m "feat: add event hook for session, file, compaction, and branch events"
```

---

## Task 11: Chat Params Hook

**Files:**
- Create: `src/hooks/chat-params.ts`

- [ ] **Step 1: Write implementation**

Create `src/hooks/chat-params.ts`:

```typescript
// Chat params hook — captures model and provider info at the start of each LLM request.
// Creates a chat span and records request count and token metrics.

import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startChatSpan } from "../signals/spans"

interface ChatParamsHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
}

/** Creates the chat.params hook handler. */
export function createChatParamsHook(deps: ChatParamsHookDeps) {
  const { tracer, instruments, state } = deps

  return async (
    input: { sessionID: string; agent: string; model: any; provider: any; message: any },
    output: { temperature: number; topP: number; topK: number; options: Record<string, any> },
  ) => {
    const modelID = input.model?.id ?? input.model?.modelID ?? "unknown"
    const providerID = input.provider?.id ?? input.provider?.providerID ?? "unknown"
    const sessionID = input.sessionID

    const span = startChatSpan(tracer, {
      model: modelID,
      provider: providerID,
      sessionID,
    })

    state.pendingChatRequests.set(sessionID, {
      model: modelID,
      provider: providerID,
      startTime: Date.now(),
    })

    instruments.requestCount.add(1, {
      "gen_ai.request.model": modelID,
      "gen_ai.provider.name": providerID,
      "gen_ai.conversation.id": sessionID,
    })

    const session = state.sessionSpans.get(sessionID)
    if (session) {
      session.requestCount++
    }

    // The span will be ended when message.updated fires with token data.
    // Store it for later retrieval. We key by sessionID since only one
    // chat request is active per session at a time.
    state.toolSpans.set(`chat:${sessionID}`, span)
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: Clean (or only barrel import errors if tool-execute.ts doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/chat-params.ts
git commit -m "feat: add chat.params hook for model/provider capture"
```

---

## Task 12: Tool Execute Hooks

**Files:**
- Create: `src/hooks/tool-execute.ts`

- [ ] **Step 1: Write implementation**

Create `src/hooks/tool-execute.ts`:

```typescript
// Tool execution hooks — wraps each tool call in an OTel span.
// tool.execute.before starts the span, tool.execute.after ends it.

import type { Tracer } from "@opentelemetry/api"
import type { PluginState } from "../types"
import type { MetricInstruments } from "../signals/metrics"
import { startToolSpan } from "../signals/spans"

interface ToolExecuteHookDeps {
  tracer: Tracer
  instruments: MetricInstruments
  state: PluginState
}

/** Creates both tool.execute.before and tool.execute.after hook handlers. */
export function createToolExecuteHooks(deps: ToolExecuteHookDeps) {
  const { tracer, instruments, state } = deps

  const before = async (
    input: { tool: string; sessionID: string; callID: string },
    _output: { args: any },
  ) => {
    const span = startToolSpan(tracer, {
      toolName: input.tool,
      callID: input.callID,
      sessionID: input.sessionID,
    })
    state.toolSpans.set(input.callID, span)

    instruments.toolInvocations.add(1, {
      "gen_ai.tool.name": input.tool,
    })
  }

  const after = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: any },
  ) => {
    const span = state.toolSpans.get(input.callID)
    if (span) {
      span.setAttribute("gen_ai.tool.output.title", output.title)
      span.end()
      state.toolSpans.delete(input.callID)
    }
  }

  return { before, after }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/tool-execute.ts
git commit -m "feat: add tool execution hooks with span lifecycle"
```

---

## Task 13: Plugin Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write implementation**

Create `src/index.ts`:

```typescript
// OpenCode OTel Plugin — instruments AI coding sessions with OpenTelemetry.
// Emits traces (session, chat, tool, file edit spans) and metrics (tokens,
// requests, compactions, file changes, tool invocations) via OTLP/HTTP.

import type { Plugin } from "@opencode-ai/plugin"
import { trace, metrics } from "@opentelemetry/api"
import { createResource } from "./telemetry/resources"
import { initProviders } from "./telemetry/provider"
import { shutdownProviders } from "./telemetry/shutdown"
import { createMetricInstruments } from "./signals/metrics"
import { createEventHook } from "./hooks/event"
import { createChatParamsHook } from "./hooks/chat-params"
import { createToolExecuteHooks } from "./hooks/tool-execute"
import { getGitAuthor, getRepoUrl, getCurrentBranch, getHostname } from "./utils/git"
import type { PluginState } from "./types"

const TRACER_NAME = "opencode-otel-plugin"
const METER_NAME = "opencode-otel-plugin"

export const OpenCodeOtelPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  // Gather resource attributes from environment
  const [author, repoUrl, branch] = await Promise.all([
    getGitAuthor($),
    getRepoUrl($),
    getCurrentBranch($),
  ])

  const resource = createResource({
    author,
    hostname: getHostname(),
    projectName: project.name ?? "",
    repoUrl,
    branch,
    worktree,
    directory,
  })

  // Initialize OTel providers
  const providers = initProviders(resource)
  const tracer = trace.getTracer(TRACER_NAME)
  const meter = metrics.getMeter(METER_NAME)
  const instruments = createMetricInstruments(meter)

  // Shared mutable state across hooks
  const state: PluginState = {
    sessionSpans: new Map(),
    toolSpans: new Map(),
    pendingChatRequests: new Map(),
    currentBranch: branch,
  }

  // Create hook handlers
  const eventHook = createEventHook({ tracer, instruments, state, providers })
  const chatParamsHook = createChatParamsHook({ tracer, instruments, state })
  const toolHooks = createToolExecuteHooks({ tracer, instruments, state })

  return {
    event: async ({ event }) => {
      try {
        // Handle message.updated for ending chat spans with token data
        if (event.type === "message.updated") {
          const msg = (event as any).properties?.info
          if (msg?.role === "assistant" && msg?.tokens) {
            const sessionID = msg.sessionID
            const chatSpan = state.toolSpans.get(`chat:${sessionID}`)
            const chatReq = state.pendingChatRequests.get(sessionID)

            if (chatSpan && chatReq) {
              const inputTokens = msg.tokens.input ?? 0
              const outputTokens = msg.tokens.output ?? 0

              chatSpan.setAttribute("gen_ai.usage.input_tokens", inputTokens)
              chatSpan.setAttribute("gen_ai.usage.output_tokens", outputTokens)
              chatSpan.setAttribute("gen_ai.response.model", chatReq.model)
              chatSpan.end()
              state.toolSpans.delete(`chat:${sessionID}`)

              const durationS = (Date.now() - chatReq.startTime) / 1000
              instruments.tokenUsage.record(inputTokens, {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": chatReq.provider,
                "gen_ai.token.type": "input",
                "gen_ai.request.model": chatReq.model,
              })
              instruments.tokenUsage.record(outputTokens, {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": chatReq.provider,
                "gen_ai.token.type": "output",
                "gen_ai.request.model": chatReq.model,
              })
              instruments.operationDuration.record(durationS, {
                "gen_ai.operation.name": "chat",
                "gen_ai.provider.name": chatReq.provider,
                "gen_ai.request.model": chatReq.model,
              })

              state.pendingChatRequests.delete(sessionID)
            }
          }
        }

        // Handle global.disposed for shutdown
        if (event.type === "global.disposed") {
          await shutdownProviders(providers)
          return
        }

        // Delegate to the event hook for all other events
        await eventHook({ event })
      } catch {
        // Never let telemetry errors crash the plugin
      }
    },

    "chat.params": async (input, output) => {
      try {
        await chatParamsHook(input, output)
      } catch {
        // Swallow errors
      }
    },

    "tool.execute.before": async (input, output) => {
      try {
        await toolHooks.before(input, output)
      } catch {
        // Swallow errors
      }
    },

    "tool.execute.after": async (input, output) => {
      try {
        await toolHooks.after(input, output)
      } catch {
        // Swallow errors
      }
    },
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: Clean.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Produces `dist/index.js` without errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire plugin entry point — connect hooks to OTel signals"
```

---

## Task 14: Run All Tests

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS. Note any failures and fix before proceeding.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Clean.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: `dist/index.js` produced.

- [ ] **Step 4: Fix any issues and commit**

If anything is broken, fix it and commit with:

```bash
git commit -am "fix: resolve test/build issues"
```

---

## Task 15: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md` with:
- Package name and description
- Installation instructions (`opencode.json` plugin entry)
- Configuration (env vars: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`)
- What it collects (traces, metrics, resource attributes — summarize the tables from the design doc)
- Example OTLP endpoint configurations (local Collector, Grafana Cloud, Honeycomb)
- Development instructions (clone, `bun install`, `bun test`, `bun run build`)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation and configuration guide"
```

---

## Task 16: Final Verification

**Files:** None

- [ ] **Step 1: Run full verification**

```bash
bun test && bun run typecheck && bun run build
```

Expected: All green.

- [ ] **Step 2: Review exported dist size**

Run: `ls -la dist/`
Expected: Single `index.js` file, reasonable size.

- [ ] **Step 3: Verify plugin loads in test environment**

Create a temporary test folder with `opencode.json` pointing to the built plugin:

```jsonc
{
  "plugin": ["file:///path/to/opencode-otel-plugin/src/index.ts"]
}
```

Run: `opencode run hi` from the test folder.
Expected: No crash, plugin loads without errors.
