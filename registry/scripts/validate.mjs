import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { resolveSiteConfig } from "../../src/adapters/declarative/merge.ts"
import {
  validateSiteConfigPatch,
  validateSitePackManifest,
} from "../../src/adapters/declarative/validate.ts"
import { resolveBuiltinConfig } from "../../src/core/builtin-config-registry.ts"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_REGISTRY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..")

const formatValidationErrors = (sourcePath, errors) =>
  errors.map((error) => `  ${sourcePath}:${error.path} [${error.code}] ${error.message}`).join("\n")

const parseJsonFile = async (sourcePath) => {
  const sourceText = await readFile(sourcePath, "utf8")
  try {
    return JSON.parse(sourceText)
  } catch (error) {
    throw new Error(`${sourcePath}: invalid JSON: ${error.message}`, { cause: error })
  }
}

const readSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => ({
      sourcePath: path.join(directory, entry.name),
      disabled: entry.name.endsWith(".disabled.json"),
    }))
}

const validatePackSource = async ({ sourcePath, disabled }) => {
  const input = await parseJsonFile(sourcePath)
  const result = validateSitePackManifest(input)
  if (!result.valid) {
    throw new Error(
      `SitePack validation failed:\n${formatValidationErrors(sourcePath, result.errors)}`,
    )
  }
  return { sourcePath, disabled, manifest: result.value }
}

const validatePatchSource = async ({ sourcePath, disabled }) => {
  const input = await parseJsonFile(sourcePath)
  const targetSiteId =
    input !== null && typeof input === "object" && typeof input.targetSiteId === "string"
      ? input.targetSiteId
      : ""
  const descriptor = targetSiteId ? await resolveBuiltinConfig(targetSiteId) : null
  const allowedPrivateSelectorKeys = descriptor
    ? Object.keys(descriptor.baseConfig.sitePrivateSelectors ?? {})
    : []
  const result = validateSiteConfigPatch(input, { allowedPrivateSelectorKeys })
  if (!result.valid) {
    throw new Error(
      `Patch validation failed:\n${formatValidationErrors(sourcePath, result.errors)}`,
    )
  }
  if (!descriptor) {
    throw new Error(
      `${sourcePath}: no configurable built-in adapter is registered for ${result.value.targetSiteId}`,
    )
  }

  const resolved = resolveSiteConfig({
    siteId: descriptor.siteId,
    appVersion: result.value.minAppVersion,
    configVersion: descriptor.configVersion,
    baseConfig: descriptor.baseConfig,
    remotePatch: result.value,
  })
  if (resolved.remotePatch.status !== "applied") {
    const details = resolved.remotePatch.errors
      ? `\n${formatValidationErrors(sourcePath, resolved.remotePatch.errors)}`
      : `: ${resolved.remotePatch.reason ?? resolved.remotePatch.status}`
    throw new Error(
      `${sourcePath}: patch cannot be applied to the current built-in config${details}`,
    )
  }

  return { sourcePath, disabled, patch: result.value }
}

const assertUniqueSources = (packs, patches) => {
  const packIds = new Map()
  for (const source of packs) {
    const previous = packIds.get(source.manifest.id)
    if (previous) {
      throw new Error(
        `Duplicate SitePack id ${source.manifest.id}: ${previous} and ${source.sourcePath}`,
      )
    }
    packIds.set(source.manifest.id, source.sourcePath)
  }

  const patchTargets = new Map()
  for (const source of patches) {
    const previous = patchTargets.get(source.patch.targetSiteId)
    if (previous) {
      throw new Error(
        `Duplicate patch target ${source.patch.targetSiteId}: ${previous} and ${source.sourcePath}`,
      )
    }
    patchTargets.set(source.patch.targetSiteId, source.sourcePath)
  }
}

export async function loadValidatedRegistrySources({ registryRoot = DEFAULT_REGISTRY_ROOT } = {}) {
  const sitesDirectory = path.join(registryRoot, "sites")
  const patchesDirectory = path.join(registryRoot, "patches")
  const [packFiles, patchFiles] = await Promise.all([
    readSourceFiles(sitesDirectory),
    readSourceFiles(patchesDirectory),
  ])
  const [packs, patches] = await Promise.all([
    Promise.all(packFiles.map(validatePackSource)),
    Promise.all(patchFiles.map(validatePatchSource)),
  ])

  packs.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id))
  patches.sort((left, right) => left.patch.targetSiteId.localeCompare(right.patch.targetSiteId))
  assertUniqueSources(packs, patches)
  return { packs, patches }
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  loadValidatedRegistrySources()
    .then(({ packs, patches }) => {
      console.warn(
        `[registry] validated ${packs.length} SitePack(s) and ${patches.length} patch(es)`,
      )
    })
    .catch((error) => {
      console.error("[registry] validation failed:", error)
      process.exitCode = 1
    })
}
