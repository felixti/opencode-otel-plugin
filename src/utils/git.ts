import { hostname } from "node:os"
import type { PluginInput } from "@opencode-ai/plugin"

type Shell = PluginInput["$"]

async function shellGet($: Shell, cmd: string, fallback: string): Promise<string> {
  try {
    const result = await $`sh -c ${cmd}`.quiet()
    return result.text().trim() || fallback
  } catch {
    return fallback
  }
}

export async function getGitAuthor($: Shell): Promise<string> {
  return shellGet($, "git config user.email", "unknown")
}

export async function getRepoUrl($: Shell): Promise<string> {
  return shellGet($, "git remote get-url origin", "unknown")
}

export async function getCurrentBranch($: Shell): Promise<string> {
  return shellGet($, "git branch --show-current", "unknown")
}

export function getHostname(): string {
  try {
    return hostname() ?? "unknown"
  } catch {
    return "unknown"
  }
}
