/** Truncate a string to at most `max` code units, appending `…` if truncated. */
export function truncate(s: string, max = 256): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
