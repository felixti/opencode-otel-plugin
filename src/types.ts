// Shared types for the OpenCode OTel plugin.
// Defines state tracking structures used across hooks and signals.

import type { Context, Span } from "@opentelemetry/api"

/** Tracks the active OTel span for a session root. */
export interface SessionSpanState {
  span: Span
  context: Context
  sessionID: string
  requestCount: number
  lastActivityAt: number
}

/** Model/provider info captured in chat.params, used when ending chat spans. */
export interface ChatRequestInfo {
  model: string
  provider: string
  startTime: number
}

export interface ToolSpanEntry {
  span: Span
  sessionID: string
  createdAt: number
}

/** In-flight tool span keyed by callID. */
export type ToolSpanMap = Map<string, ToolSpanEntry>

/** Plugin-wide mutable state shared across hooks. */
export interface PluginState {
  sessionSpans: Map<string, SessionSpanState>
  toolSpans: ToolSpanMap
  pendingChatRequests: Map<string, ChatRequestInfo>
  currentBranch: string | undefined
  opencodeVersion: string | undefined
  gitAuthor: string | undefined
  repoUrl: string | undefined
  sweepInterval?: ReturnType<typeof setInterval>
  lastFlushTime?: number
  gitReady: Promise<void>
}
