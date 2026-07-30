import { execFileSync } from "node:child_process"
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { REMOTE_CONFIG_INDEX_SCHEMA_VERSION } from "../../src/core/remote-config-constants.ts"
import {
  REGISTRY_INDEX_SIGNATURE_ALGORITHM,
  REGISTRY_INDEX_SIGNATURE_FILE_NAME,
  REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION,
  TRUSTED_REGISTRY_SIGNING_KEYS,
  validateRegistryIndexSignature,
} from "../../src/core/remote-config-signature.ts"
import { validateRemoteConfigRegistryIndex } from "../../src/core/remote-config-types.ts"

import { DEFAULT_REGISTRY_ROOT, loadValidatedRegistrySources } from "./validate.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..")

const parsePositiveInteger = (value, label) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${label} must be a positive safe integer`)
  }
  return parsed
}

const parseUnixMilliseconds = (value, label) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1_000_000_000_000) {
    throw new TypeError(`${label} must be a Unix millisecond timestamp`)
  }
  return parsed
}

export const parseRegistryBuildArguments = (args) => {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${argument}`)
    }
    if (argument === "--revision") options.revision = parsePositiveInteger(value, argument)
    else if (argument === "--generated-at") {
      options.generatedAt = parseUnixMilliseconds(value, argument)
    } else if (argument === "--registry-root") options.registryRoot = path.resolve(value)
    else if (argument === "--output-dir") options.outputDirectory = path.resolve(value)
    else if (argument === "--previous-dir") options.previousDirectory = path.resolve(value)
    else if (argument === "--signing-key-id") options.signingKeyId = value
    else throw new TypeError(`Unknown argument: ${argument}`)
    index += 1
  }
  return options
}

const resolveRevision = (explicitRevision) => {
  if (explicitRevision !== undefined) return explicitRevision
  if (process.env.REGISTRY_REVISION) {
    return parsePositiveInteger(process.env.REGISTRY_REVISION, "REGISTRY_REVISION")
  }
  const commitCount = execFileSync("git", ["rev-list", "--count", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  }).trim()
  return parsePositiveInteger(commitCount, "git commit count")
}

const resolveGeneratedAt = (explicitGeneratedAt) => {
  if (explicitGeneratedAt !== undefined) return explicitGeneratedAt
  if (process.env.REGISTRY_GENERATED_AT) {
    return parseUnixMilliseconds(process.env.REGISTRY_GENERATED_AT, "REGISTRY_GENERATED_AT")
  }
  return Date.now()
}

const assertSafeOutputDirectory = (registryRoot, outputDirectory) => {
  const relative = path.relative(registryRoot, outputDirectory)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Output directory must be a child of registry root: ${outputDirectory}`)
  }
}

const serializeJson = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
const sha256 = (content) => createHash("sha256").update(content).digest("hex")
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const PUBLIC_KEY_PATTERN = /^[a-f0-9]{64}$/

const importSigningPrivateKey = (value) => {
  if (typeof value !== "string") return value
  const encoded = value.trim()
  if (!encoded || encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
    throw new TypeError("Registry signing private key must be base64 PKCS#8")
  }
  try {
    return createPrivateKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "pkcs8",
    })
  } catch (error) {
    throw new TypeError("Registry signing private key must be base64 PKCS#8", { cause: error })
  }
}

export const exportRawEd25519PublicKeyHex = (privateKey) => {
  const publicKey = createPublicKey(privateKey)
  const spki = publicKey.export({ format: "der", type: "spki" })
  if (
    spki.length !== ED25519_SPKI_PREFIX.length + 32 ||
    !spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    throw new TypeError("Registry signing key must use Ed25519")
  }
  return spki.subarray(ED25519_SPKI_PREFIX.length).toString("hex")
}

const resolveSigningKey = (signingKey) => {
  if (!signingKey) throw new TypeError("Registry signing key is required")
  const { keyId, expectedPublicKeyHex } = signingKey
  validateRegistryIndexSignature({
    schemaVersion: REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION,
    algorithm: REGISTRY_INDEX_SIGNATURE_ALGORITHM,
    keyId,
    signature: "00".repeat(64),
  })
  if (typeof expectedPublicKeyHex !== "string" || !PUBLIC_KEY_PATTERN.test(expectedPublicKeyHex)) {
    throw new TypeError(`Invalid trusted public key for registry signing key: ${keyId}`)
  }
  const privateKey = importSigningPrivateKey(signingKey.privateKey)
  if (!privateKey || privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Registry signing key must be an Ed25519 private key")
  }
  const actualPublicKeyHex = exportRawEd25519PublicKeyHex(privateKey)
  if (actualPublicKeyHex !== expectedPublicKeyHex) {
    throw new Error(`Registry signing key ${keyId} does not match the trusted public key`)
  }
  return { keyId, privateKey }
}

const resolveCliSigningKey = (keyId) => {
  if (!keyId) throw new TypeError("REGISTRY_SIGNING_KEY_ID or --signing-key-id is required")
  const trustedKey = TRUSTED_REGISTRY_SIGNING_KEYS.find((key) => key.keyId === keyId)
  if (!trustedKey) throw new TypeError(`Unknown registry signing key: ${keyId}`)
  const privateKey = process.env.REGISTRY_SIGNING_PRIVATE_KEY
  if (!privateKey) throw new TypeError("REGISTRY_SIGNING_PRIVATE_KEY is required")
  return {
    keyId,
    privateKey,
    expectedPublicKeyHex: trustedKey.publicKeyHex,
  }
}

const readPreviousIndex = async (previousDirectory) => {
  if (!previousDirectory) return null
  try {
    const source = await readFile(path.join(previousDirectory, "index.json"), "utf8")
    return validateRemoteConfigRegistryIndex(JSON.parse(source))
  } catch (error) {
    throw new Error(`Failed to read previous registry index from ${previousDirectory}`, {
      cause: error,
    })
  }
}

const assertIndexProgression = (previousIndex, nextIndex) => {
  if (!previousIndex) return
  if (nextIndex.registryRevision < previousIndex.registryRevision) {
    throw new Error(
      `registryRevision regressed: ${nextIndex.registryRevision} < ${previousIndex.registryRevision}`,
    )
  }
  if (nextIndex.registryRevision === previousIndex.registryRevision) {
    if (JSON.stringify(nextIndex) !== JSON.stringify(previousIndex)) {
      throw new Error(
        `registryRevision ${nextIndex.registryRevision} was reused with different index data`,
      )
    }
    return
  }
}

const readHighestPublishedVersion = async (previousDirectory, relativeDirectory) => {
  if (!previousDirectory) return null
  let entries
  try {
    entries = await readdir(path.join(previousDirectory, relativeDirectory), {
      withFileTypes: true,
    })
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null
    throw error
  }

  const versions = entries
    .filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name))
    .map((entry) => Number(entry.name.slice(0, -".json".length)))
    .filter((version) => Number.isSafeInteger(version) && version > 0)
  return versions.length > 0 ? Math.max(...versions) : null
}

const assertPublishedVersionProgression = async (previousDirectory, packs, patches) => {
  for (const source of packs) {
    const { id, version } = source.manifest
    const previousVersion = await readHighestPublishedVersion(previousDirectory, `packs/${id}`)
    if (previousVersion !== null && version < previousVersion) {
      throw new Error(`SitePack version regressed for ${id}: ${version} < ${previousVersion}`)
    }
  }

  for (const source of patches) {
    const { targetSiteId, patchVersion } = source.patch
    const previousVersion = await readHighestPublishedVersion(
      previousDirectory,
      `patches/${targetSiteId}`,
    )
    if (previousVersion !== null && patchVersion < previousVersion) {
      throw new Error(
        `Patch version regressed for ${targetSiteId}: ${patchVersion} < ${previousVersion}`,
      )
    }
  }
}

const assertImmutableArtifact = async (previousDirectory, relativePath, content) => {
  if (!previousDirectory) return
  try {
    const previousContent = await readFile(path.join(previousDirectory, relativePath))
    if (!previousContent.equals(content)) {
      throw new Error(`Immutable registry artifact changed: ${relativePath}`)
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return
    throw error
  }
}

const writeArtifact = async ({ outputDirectory, previousDirectory, relativePath, value }) => {
  const content = serializeJson(value)
  await assertImmutableArtifact(previousDirectory, relativePath, content)
  const outputPath = path.join(outputDirectory, relativePath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, content)
  return sha256(content)
}

export async function buildRegistryDist({
  registryRoot = DEFAULT_REGISTRY_ROOT,
  outputDirectory,
  previousDirectory,
  revision,
  generatedAt,
  signingKey,
} = {}) {
  const resolvedRegistryRoot = path.resolve(registryRoot)
  const resolvedOutputDirectory = path.resolve(
    outputDirectory ?? path.join(resolvedRegistryRoot, "dist"),
  )
  const resolvedPreviousDirectory = previousDirectory ? path.resolve(previousDirectory) : undefined
  assertSafeOutputDirectory(resolvedRegistryRoot, resolvedOutputDirectory)
  if (resolvedPreviousDirectory && resolvedPreviousDirectory === resolvedOutputDirectory) {
    throw new Error("Previous dist and output directory must be different")
  }
  const resolvedSigningKey = resolveSigningKey(signingKey)

  const [{ packs, patches }, previousIndex] = await Promise.all([
    loadValidatedRegistrySources({ registryRoot: resolvedRegistryRoot }),
    readPreviousIndex(resolvedPreviousDirectory),
  ])
  const registryRevision = resolveRevision(revision)
  const index = {
    generatedAt: resolveGeneratedAt(generatedAt),
    schemaVersion: REMOTE_CONFIG_INDEX_SCHEMA_VERSION,
    registryRevision,
    packs: [],
    patches: [],
  }

  await assertPublishedVersionProgression(resolvedPreviousDirectory, packs, patches)
  await rm(resolvedOutputDirectory, { recursive: true, force: true })
  await mkdir(resolvedOutputDirectory, { recursive: true })

  for (const source of packs) {
    const { manifest } = source
    const relativePath = `packs/${manifest.id}/${manifest.version}.json`
    const digest = await writeArtifact({
      outputDirectory: resolvedOutputDirectory,
      previousDirectory: resolvedPreviousDirectory,
      relativePath,
      value: manifest,
    })
    index.packs.push({
      id: manifest.id,
      version: manifest.version,
      minAppVersion: manifest.minAppVersion,
      matches: manifest.matches,
      file: relativePath,
      sha256: digest,
      disabled: source.disabled,
    })
  }

  for (const source of patches) {
    const { patch } = source
    const relativePath = `patches/${patch.targetSiteId}/${patch.patchVersion}.json`
    const digest = await writeArtifact({
      outputDirectory: resolvedOutputDirectory,
      previousDirectory: resolvedPreviousDirectory,
      relativePath,
      value: patch,
    })
    index.patches.push({
      targetSiteId: patch.targetSiteId,
      patchVersion: patch.patchVersion,
      baseConfigVersion: patch.baseConfigVersion,
      minAppVersion: patch.minAppVersion,
      ...(patch.maxAppVersion ? { maxAppVersion: patch.maxAppVersion } : {}),
      file: relativePath,
      sha256: digest,
      disabled: source.disabled,
    })
  }

  const validatedIndex = validateRemoteConfigRegistryIndex(index)
  assertIndexProgression(previousIndex, validatedIndex)
  const indexContent = serializeJson(validatedIndex)
  const signatureEnvelope = validateRegistryIndexSignature({
    schemaVersion: REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION,
    algorithm: REGISTRY_INDEX_SIGNATURE_ALGORITHM,
    keyId: resolvedSigningKey.keyId,
    signature: sign(null, indexContent, resolvedSigningKey.privateKey).toString("hex"),
  })
  await writeFile(path.join(resolvedOutputDirectory, "index.json"), indexContent)
  await writeFile(
    path.join(resolvedOutputDirectory, REGISTRY_INDEX_SIGNATURE_FILE_NAME),
    serializeJson(signatureEnvelope),
  )
  return validatedIndex
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  const options = parseRegistryBuildArguments(process.argv.slice(2))
  const { signingKeyId, ...buildOptions } = options
  buildRegistryDist({
    ...buildOptions,
    signingKey: resolveCliSigningKey(signingKeyId ?? process.env.REGISTRY_SIGNING_KEY_ID),
  })
    .then((index) => {
      console.warn(
        `[registry] built revision ${index.registryRevision} with ${index.packs.length} SitePack(s) and ${index.patches.length} patch(es)`,
      )
    })
    .catch((error) => {
      console.error("[registry] build failed:", error)
      process.exitCode = 1
    })
}
