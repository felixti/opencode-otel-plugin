/**
 * Update Checker for opencode-otel-plugin
 *
 * Checks npm registry for newer versions and shows a toast if available.
 * Non-blocking - runs in background and fails silently.
 */

import type { PluginInput } from "@opencode-ai/plugin"

// ============================================================================
// Version Comparison
// ============================================================================

/**
 * Compares two semver versions. Returns true if `latest` is newer than `current`.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const clean = (v: string) => v.replace(/^v/, "")
  const partsA = clean(current).split(".").map(Number)
  const partsB = clean(latest).split(".").map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] ?? 0
    const b = partsB[i] ?? 0
    if (a < b) return true
    if (a > b) return false
  }
  return false
}

// ============================================================================
// Registry Fetch
// ============================================================================

/**
 * Fetches latest version from npm. Returns null on any error.
 */
export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })

    clearTimeout(timeout)
    if (!response.ok) return null

    const data = await response.json()
    return data["dist-tags"]?.latest ?? null
  } catch {
    return null
  }
}

// ============================================================================
// Update Checker
// ============================================================================

type UpdateCheckOptions = {
  /** npm package name */
  packageName: string
  /** Current installed version (from package.json) */
  currentVersion: string
  /** Display name for toast */
  pluginName: string
  /** SDK client */
  client: PluginInput["client"]
  /** Delay before check (ms). Default: 8000 */
  delay?: number
}

/**
 * Checks for updates and shows toast if newer version exists.
 *
 * Call during plugin initialization (fire and forget - MUST NOT await).
 */
export function checkForUpdates(options: UpdateCheckOptions): void {
  const { packageName, currentVersion, pluginName, client, delay = 8000 } = options

  setTimeout(async () => {
    try {
      const latest = await fetchLatestVersion(packageName)
      if (!latest || !isNewerVersion(currentVersion, latest)) return

      await client.tui.showToast({
        body: {
          title: `${pluginName}: Update Available`,
          message: `v${currentVersion} → v${latest}\nUpdate config to use @${latest}`,
          variant: "info",
          duration: 10000,
        },
      })
    } catch {
      // Fail silently - update check is non-critical
    }
  }, delay)
}
