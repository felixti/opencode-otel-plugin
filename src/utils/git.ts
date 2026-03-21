import { hostname } from "node:os"

type BunShell = typeof import("bun").$

async function shellGet($: BunShell, cmd: string, fallback: string): Promise<string> {
  try {
    const result = await $`sh -c ${cmd}`.quiet()
    return result.text().trim() || fallback
  } catch {
    return fallback
  }
}

export async function getGitAuthor($: BunShell): Promise<string> {
  const email = await shellGet($, "git config user.email", "")
  if (email) return email
  return shellGet($, "git config user.name", "unknown")
}

export async function getRepoUrl($: BunShell): Promise<string> {
  return shellGet($, "git remote get-url origin", "unknown")
}

export async function getCurrentBranch($: BunShell): Promise<string> {
  return shellGet($, "git branch --show-current", "unknown")
}

export function getHostname(): string {
  try {
    return hostname() ?? "unknown"
  } catch {
    return "unknown"
  }
}
