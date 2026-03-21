import { resourceFromAttributes } from "@opentelemetry/resources"
import type { Resource } from "@opentelemetry/resources"
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions"
import { ATTR_HOST_NAME } from "@opentelemetry/semantic-conventions/incubating"

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

export function createResource(input: ResourceInput): Resource {
  return resourceFromAttributes(buildResourceAttributes(input))
}
