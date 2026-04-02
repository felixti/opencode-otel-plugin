import { resourceFromAttributes } from "@opentelemetry/resources"
import type { Resource } from "@opentelemetry/resources"
import { truncate } from "../utils/truncate"

export interface ResourceInput {
  author: string
  hostname: string
  projectName: string
  repoUrl: string
  branch: string
  worktree: string
  directory: string
  email: string
}

export function buildResourceAttributes(input: ResourceInput): Record<string, string> {
  return {
    "service.name": truncate("opencode"),
    "host.name": truncate(input.hostname),
    "host.user.email": truncate(input.email),
    "enduser.id": truncate(input.author),
    "opencode.project.name": truncate(input.projectName),
    "vcs.repository.url.full": truncate(input.repoUrl),
    "vcs.repository.ref.name": truncate(input.branch),
    "opencode.worktree": truncate(input.worktree),
    "opencode.directory": truncate(input.directory),
  }
}

export function createResource(input: ResourceInput): Resource {
  return resourceFromAttributes(buildResourceAttributes(input))
}
