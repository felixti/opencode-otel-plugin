import type { FileChangeStats } from "../types"
import { detectLanguage } from "./language"

interface FileDiffLike {
  path: string
  additions?: number
  deletions?: number
}

export function extractFileChanges(diffs: FileDiffLike[]): FileChangeStats[] {
  return diffs.map((diff) => ({
    filepath: diff.path,
    linesAdded: diff.additions ?? 0,
    linesRemoved: diff.deletions ?? 0,
    language: detectLanguage(diff.path),
  }))
}
