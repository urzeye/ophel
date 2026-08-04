import { generateKeyPairSync, verify } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { buildRegistryDist } from "../../../registry/scripts/build-dist.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../../..")
const SOURCE_REGISTRY_ROOT = path.join(REPOSITORY_ROOT, "registry")
const REGISTRY_WORKFLOW_PATH = path.join(
  REPOSITORY_ROOT,
  ".github",
  "workflows",
  "registry-dist.yml",
)
const GENERATED_AT = 1_800_000_000_000
const REVISION = 42
const KEY_ID = "ophel-registry-test"

let registryRoot

const exportRawPublicKeyHex = (publicKey) =>
  publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex")

const createSigningKey = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  return {
    privateKey,
    publicKey,
    signingKey: {
      keyId: KEY_ID,
      privateKey,
      expectedPublicKeyHex: exportRawPublicKeyHex(publicKey),
    },
  }
}

beforeEach(async () => {
  registryRoot = await mkdtemp(path.join(tmpdir(), "ophel-registry-build-"))
  await Promise.all([
    cp(path.join(SOURCE_REGISTRY_ROOT, "schema"), path.join(registryRoot, "schema"), {
      recursive: true,
    }),
    cp(path.join(SOURCE_REGISTRY_ROOT, "examples"), path.join(registryRoot, "examples"), {
      recursive: true,
    }),
    cp(path.join(SOURCE_REGISTRY_ROOT, "sites"), path.join(registryRoot, "sites"), {
      recursive: true,
    }),
    mkdir(path.join(registryRoot, "patches"), { recursive: true }),
  ])
})

afterEach(async () => {
  if (registryRoot) await rm(registryRoot, { recursive: true, force: true })
})

describe("signed registry dist", () => {
  it("signs the exact emitted index bytes", async () => {
    const { publicKey, signingKey } = createSigningKey()

    await buildRegistryDist({
      registryRoot,
      generatedAt: GENERATED_AT,
      revision: REVISION,
      signingKey,
    })

    const indexBytes = await readFile(path.join(registryRoot, "dist", "index.json"))
    const signatureEnvelope = JSON.parse(
      await readFile(path.join(registryRoot, "dist", "index.sig.json"), "utf8"),
    )
    expect(signatureEnvelope).toMatchObject({
      schemaVersion: 1,
      algorithm: "Ed25519",
      keyId: KEY_ID,
    })
    expect(signatureEnvelope.signature).toMatch(/^[a-f0-9]{128}$/)
    expect(
      verify(null, indexBytes, publicKey, Buffer.from(signatureEnvelope.signature, "hex")),
    ).toBe(true)
  })

  it("rejects a private key that does not match the expected public key", async () => {
    const { signingKey } = createSigningKey()

    await expect(
      buildRegistryDist({
        registryRoot,
        generatedAt: GENERATED_AT,
        revision: REVISION,
        signingKey: {
          ...signingKey,
          expectedPublicKeyHex: "00".repeat(32),
        },
      }),
    ).rejects.toThrow("does not match the trusted public key")
  })

  it("rejects a non-Ed25519 private key", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })

    await expect(
      buildRegistryDist({
        registryRoot,
        generatedAt: GENERATED_AT,
        revision: REVISION,
        signingKey: {
          keyId: KEY_ID,
          privateKey,
          expectedPublicKeyHex: "00".repeat(32),
        },
      }),
    ).rejects.toThrow("must be an Ed25519 private key")
  })

  it("rejects malformed base64 private-key input", async () => {
    await expect(
      buildRegistryDist({
        registryRoot,
        generatedAt: GENERATED_AT,
        revision: REVISION,
        signingKey: {
          keyId: KEY_ID,
          privateKey: "not-base64",
          expectedPublicKeyHex: "00".repeat(32),
        },
      }),
    ).rejects.toThrow("must be base64 PKCS#8")
  })

  it("rejects a build without signing configuration", async () => {
    await expect(
      buildRegistryDist({
        registryRoot,
        generatedAt: GENERATED_AT,
        revision: REVISION,
      }),
    ).rejects.toThrow("Registry signing key is required")
  })
})

describe("registry publish workflow signing contract", () => {
  it("requires the production secret and signed build command", async () => {
    const workflow = await readFile(REGISTRY_WORKFLOW_PATH, "utf8")

    expect(workflow).toContain("REGISTRY_SIGNING_KEY_ID: ophel-registry-2026-07")
    expect(workflow).toContain(
      "REGISTRY_SIGNING_PRIVATE_KEY: ${{ secrets.REGISTRY_SIGNING_PRIVATE_KEY }}",
    )
    expect(workflow).toContain('if [ -z "$REGISTRY_SIGNING_PRIVATE_KEY" ]; then')
    expect(workflow).toContain('pnpm registry:build:signed --revision "$REVISION"')
    expect(workflow).not.toContain("pnpm registry:build:signed -- --revision")
  })

  it("publishes pre-merge revisions without outrunning squashed main", async () => {
    const workflow = await readFile(REGISTRY_WORKFLOW_PATH, "utf8")

    expect(workflow).toContain('branches: ["main", "feat/site-adapter-pluginization"]')
    expect(workflow).toContain("process.stdout.write(String(index.registryRevision + 1))")
    expect(workflow).toContain("REVISION=1")
    expect(workflow).toContain("revision-override:")
    expect(workflow).toContain('REVISION="$REVISION_OVERRIDE"')
  })
})
