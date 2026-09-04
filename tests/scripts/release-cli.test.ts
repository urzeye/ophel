import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))
const releaseScript = path.join(repoRoot, "scripts", "release.mjs")

function runRelease(args: string[]) {
  return spawnSync(process.execPath, [releaseScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  })
}

describe("release CLI", () => {
  it("rejects unknown flags before changing git state", () => {
    const result = runRelease(["--not-a-real-flag"])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Unknown option: --not-a-real-flag/)
  })

  it("documents --skip-checks in help", () => {
    const result = runRelease(["--help"])
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/--skip-checks/)
  })

  it("skips quality checks on dry-run --skip-checks and does not create a tag", () => {
    const beforeTags = spawnSync("git", ["tag", "--list"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
    const result = runRelease(["--dry-run", "--skip-checks"])
    const afterTags = spawnSync("git", ["tag", "--list"], {
      cwd: repoRoot,
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/Skipping pre-release checks \(--skip-checks\)\./)
    expect(result.stdout + result.stderr).not.toMatch(/Running pre-release checks/)
    expect(afterTags.stdout).toBe(beforeTags.stdout)
    expect(existsSync(path.join(repoRoot, ".git"))).toBe(true)
  })
})
