import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { loadValidatedRegistrySources } from "../../../registry/scripts/validate.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../../..")
const SOURCE_REGISTRY_ROOT = path.join(REPOSITORY_ROOT, "registry")
const VALIDATE_SCRIPT_PATH = path.join(REPOSITORY_ROOT, "registry", "scripts", "validate.mjs")
const WORKFLOW_PATH = path.join(REPOSITORY_ROOT, ".github", "workflows", "registry-pr.yml")
const require = createRequire(import.meta.url)
const TSX_CLI_PATH = require.resolve("tsx/cli")

let exampleManifest
let packageVersion
let registryRoot

const writeJson = async (relativePath, value) => {
  const targetPath = path.join(registryRoot, ...relativePath.split("/"))
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

const writePack = (fileName, manifest) => writeJson(`sites/${fileName}`, manifest)

const updateSchema = async (updater) => {
  const schemaPath = path.join(registryRoot, "schema", "site-pack.schema.json")
  const schema = JSON.parse(await readFile(schemaPath, "utf8"))
  updater(schema)
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8")
}

const createPack = ({ id = "fixture-pack", matches = ["https://fixture.example/*"] } = {}) => ({
  ...structuredClone(exampleManifest),
  id,
  name: `Fixture ${id}`,
  matches,
})

const captureRegistryFailure = async () => {
  try {
    await loadValidatedRegistrySources({ registryRoot })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ""
}

const expectRegistryFailure = async (...expectedFragments) => {
  const message = await captureRegistryFailure()
  expect(message).not.toBe("")
  for (const fragment of expectedFragments) {
    expect(message).toContain(fragment)
  }
}

beforeAll(async () => {
  exampleManifest = JSON.parse(
    await readFile(path.join(SOURCE_REGISTRY_ROOT, "examples", "site-pack.example.json"), "utf8"),
  )
  packageVersion = JSON.parse(
    await readFile(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
  ).version
})

beforeEach(async () => {
  registryRoot = await mkdtemp(path.join(tmpdir(), "ophel-registry-validation-"))
  await Promise.all([
    cp(path.join(SOURCE_REGISTRY_ROOT, "schema"), path.join(registryRoot, "schema"), {
      recursive: true,
    }),
    cp(path.join(SOURCE_REGISTRY_ROOT, "examples"), path.join(registryRoot, "examples"), {
      recursive: true,
    }),
    mkdir(path.join(registryRoot, "sites"), { recursive: true }),
    mkdir(path.join(registryRoot, "patches"), { recursive: true }),
  ])
})

afterEach(async () => {
  if (registryRoot) await rm(registryRoot, { recursive: true, force: true })
})

describe("registry PR candidate validation", () => {
  it("accepts a valid isolated registry root", async () => {
    await writePack("fixture-pack.json", createPack())

    const result = await loadValidatedRegistrySources({ registryRoot })

    expect(result.packs.map(({ manifest }) => manifest.id)).toEqual(["fixture-pack"])
    expect(result.patches).toEqual([])
  })

  it("reports JSON Schema failures at the source field", async () => {
    const pack = createPack()
    pack.schemaVersion = "1"
    await writePack("schema-error.json", pack)

    await expectRegistryFailure(
      "sites/schema-error.json:$/schemaVersion [schema_const]",
      "sites/schema-error.json:$.schemaVersion [invalid_type]",
    )
  })

  it("rejects duplicate pack IDs", async () => {
    await Promise.all([
      writePack(
        "alpha.json",
        createPack({ id: "duplicate-pack", matches: ["https://alpha.fixture.example/*"] }),
      ),
      writePack(
        "beta.json",
        createPack({ id: "duplicate-pack", matches: ["https://beta.fixture.example/*"] }),
      ),
    ])

    await expectRegistryFailure(
      "sites/beta.json:$.id [duplicate_id]",
      "SitePack id duplicate-pack is already declared by sites/alpha.json",
    )
  })

  it("rejects IDs reserved by built-in adapters", async () => {
    await writePack("builtin-id.json", createPack({ id: "chatgpt" }))

    await expectRegistryFailure(
      "sites/builtin-id.json:$.id [builtin_id_conflict]",
      "conflicts with an internal SITE_IDS value",
    )
  })

  it("rejects matches that overlap built-in adapters", async () => {
    await writePack(
      "builtin-match.json",
      createPack({ id: "builtin-match-pack", matches: ["https://chatgpt.com/*"] }),
    )

    await expectRegistryFailure(
      "sites/builtin-match.json:$.matches[0] [builtin_match_conflict]",
      "overlaps built-in site chatgpt",
    )
  })

  it("rejects matches that overlap another registry pack", async () => {
    await Promise.all([
      writePack(
        "alpha.json",
        createPack({ id: "alpha-pack", matches: ["https://*.fixture.example/*"] }),
      ),
      writePack(
        "beta.json",
        createPack({ id: "beta-pack", matches: ["https://chat.fixture.example/*"] }),
      ),
    ])

    await expectRegistryFailure(
      "sites/beta.json:$.matches[0] [registry_match_conflict]",
      "overlaps sites/alpha.json (https://*.fixture.example/*)",
    )
  })

  it("rejects unsafe regular expressions through the shared validator", async () => {
    const pack = createPack()
    pack.conversation.idFrom.regex = "(a+)+$"
    await writePack("unsafe-regex.json", pack)

    await expectRegistryFailure(
      "sites/unsafe-regex.json:$.conversation.idFrom.regex [unsafe_regex]",
    )
  })

  it("rejects escaped unsafe CSS through the shared validator", async () => {
    const pack = createPack()
    pack.widthSelectors[0].extraCss = "background: \\75 rl(https://evil.example/pixel)"
    await writePack("unsafe-css.json", pack)

    await expectRegistryFailure("sites/unsafe-css.json:$.widthSelectors[0].extraCss [unsafe_css]")
  })

  it("rejects missing fields required by declared capabilities", async () => {
    const pack = createPack()
    delete pack.selectors.responseContainer
    await writePack("missing-capability-field.json", pack)

    await expectRegistryFailure(
      "sites/missing-capability-field.json:$.selectors.responseContainer [capability_requirement]",
    )
  })

  it("returns a non-zero CLI status with field-located errors", async () => {
    const pack = createPack()
    pack.conversation.idFrom.regex = "(a+)+$"
    await writePack("cli-error.json", pack)

    const result = spawnSync(
      process.execPath,
      [TSX_CLI_PATH, VALIDATE_SCRIPT_PATH, "--registry-root", registryRoot],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("[registry] validation failed")
    expect(result.stderr).toContain(
      "sites/cli-error.json:$.conversation.idFrom.regex [unsafe_regex]",
    )
  })

  it("accepts the `--` separator forwarded by pnpm run", async () => {
    await writePack("cli-separator.json", createPack())

    const result = spawnSync(
      process.execPath,
      [TSX_CLI_PATH, VALIDATE_SCRIPT_PATH, "--", "--registry-root", registryRoot],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      },
    )

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stderr).toContain("[registry] validated")
  })
})

describe("forward-compatible schema-declared fields", () => {
  const declareRootKey = (key) =>
    updateSchema((schema) => {
      schema.properties[key] = { type: "boolean" }
    })

  it("accepts schema-declared root keys unknown to this code when minAppVersion gates them", async () => {
    await declareRootKey("futureToggle")
    const pack = createPack()
    pack.futureToggle = true
    pack.minAppVersion = packageVersion
    await writePack("future-toggle.json", pack)

    const result = await loadValidatedRegistrySources({ registryRoot })

    expect(result.packs.map(({ manifest }) => manifest.id)).toEqual(["fixture-pack"])
  })

  it("requires minAppVersion at or above the current app version for unknown root keys", async () => {
    await declareRootKey("futureToggle")
    const pack = createPack()
    pack.futureToggle = true
    pack.minAppVersion = "0.9.0"
    await writePack("future-toggle.json", pack)

    const message = await captureRegistryFailure()

    expect(message).toContain("sites/future-toggle.json:$.minAppVersion [min_app_version_too_low]")
    expect(message).toContain("futureToggle")
    expect(message).not.toContain("[unknown_key]")
  })

  it("still rejects root keys that the schema does not declare", async () => {
    const pack = createPack()
    pack.futureToggle = true
    pack.minAppVersion = packageVersion
    await writePack("future-toggle.json", pack)

    const message = await captureRegistryFailure()

    expect(message).toContain(
      "sites/future-toggle.json:$/futureToggle [schema_additionalProperties]",
    )
    expect(message).not.toContain("[unknown_key]")
  })

  it("does not tolerate dangerous root keys", async () => {
    const pack = createPack()
    pack.minAppVersion = packageVersion
    const text = JSON.stringify(pack, null, 2).replace(
      /^\{/,
      '{\n  "__proto__": { "polluted": true },',
    )
    await writeFile(path.join(registryRoot, "sites", "proto.json"), `${text}\n`, "utf8")

    await expectRegistryFailure("sites/proto.json:$.__proto__ [unknown_key]")
  })

  it("accepts schema-declared nested keys unknown to this code when minAppVersion gates them", async () => {
    await updateSchema((schema) => {
      schema.definitions.selectors.properties.futureSelector = { type: "string" }
    })
    const pack = createPack()
    pack.selectors.futureSelector = ".future"
    pack.minAppVersion = packageVersion
    await writePack("future-nested.json", pack)

    const result = await loadValidatedRegistrySources({ registryRoot })

    expect(result.packs.map(({ manifest }) => manifest.id)).toEqual(["fixture-pack"])
  })

  it("requires minAppVersion at or above the current app version for unknown nested keys", async () => {
    await updateSchema((schema) => {
      schema.definitions.selectors.properties.futureSelector = { type: "string" }
    })
    const pack = createPack()
    pack.selectors.futureSelector = ".future"
    pack.minAppVersion = "0.9.0"
    await writePack("future-nested.json", pack)

    const message = await captureRegistryFailure()

    expect(message).toContain("sites/future-nested.json:$.minAppVersion [min_app_version_too_low]")
    expect(message).toContain("selectors.futureSelector")
    expect(message).not.toContain("[unknown_key]")
  })

  it("still rejects nested keys that the schema does not declare", async () => {
    const pack = createPack()
    pack.selectors.futureSelector = ".future"
    pack.minAppVersion = packageVersion
    await writePack("future-nested.json", pack)

    const message = await captureRegistryFailure()

    expect(message).toContain(
      "sites/future-nested.json:$/selectors/futureSelector [schema_additionalProperties]",
    )
    expect(message).not.toContain("[unknown_key]")
  })
})

describe("registry PR workflow security contract", () => {
  it("runs trusted code against a detached candidate registry and reports failures", async () => {
    const workflow = await readFile(WORKFLOW_PATH, "utf8")

    expect(workflow).toContain("pull_request_target:")
    expect(workflow).toContain('- "registry/schema/**"')
    expect(workflow).toContain('- "registry/examples/**"')
    expect(workflow).toContain("ref: ${{ github.event.pull_request.base.sha }}")
    expect(workflow).toContain("persist-credentials: false")
    expect(workflow).toContain("EXPECTED_HEAD: ${{ github.event.pull_request.head.sha }}")
    expect(workflow).toContain('git fetch --no-tags --depth=1 origin "pull/$PR_NUMBER/head"')
    expect(workflow).toContain('if [ "$ACTUAL_HEAD" != "$EXPECTED_HEAD" ]; then')
    expect(workflow).toContain('git worktree add --detach "$RUNNER_TEMP/registry-pr" FETCH_HEAD')
    expect(workflow).toContain(
      'pnpm registry:validate -- --registry-root "$RUNNER_TEMP/registry-pr/registry"',
    )
    expect(workflow).toContain("uses: actions/github-script@v8")
    expect(workflow).toContain("VALIDATION_LOG: ${{ runner.temp }}/registry-validation.log")
    expect(workflow).toContain(
      "if: always() && steps.registry_validation.outputs.result != 'success'",
    )
  })
})
