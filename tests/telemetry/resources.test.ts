import { describe, expect, test } from "bun:test"
import { buildResourceAttributes } from "../../src/telemetry/resources"

describe("buildResourceAttributes", () => {
  test("includes all required resource attributes", () => {
    const attrs = buildResourceAttributes({
      author: "dev@example.com",
      hostname: "macbook-pro",
      email: "dev@example.com",
      projectName: "my-project",
      repoUrl: "https://github.com/org/repo",
      branch: "main",
      worktree: "/Users/dev/projects/my-project",
      directory: "/Users/dev/projects/my-project",
    })

    expect(attrs["service.name"]).toBe("opencode")
    expect(attrs["host.name"]).toBe("macbook-pro")
    expect(attrs["host.user.email"]).toBe("dev@example.com")
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
      email: "unknown",
      projectName: "",
      repoUrl: "unknown",
      branch: "unknown",
      worktree: "",
      directory: "",
    })

    expect(attrs["service.name"]).toBe("opencode")
    expect(attrs["host.name"]).toBe("unknown")
    expect(attrs["host.user.email"]).toBe("unknown")
  })

  test("does not include service.version (set on spans via installation.updated)", () => {
    const attrs = buildResourceAttributes({
      author: "dev@example.com",
      hostname: "macbook-pro",
      email: "dev@example.com",
      projectName: "my-project",
      repoUrl: "https://github.com/org/repo",
      branch: "main",
      worktree: "/Users/dev/projects/my-project",
      directory: "/Users/dev/projects/my-project",
    })

    expect(attrs["service.version"]).toBeUndefined()
  })
})
