import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import Ajv from "ajv"
import safeRegex from "safe-regex2"

import { siteMatchPatternsOverlap } from "../../src/adapters/declarative/match-pattern.ts"
import { resolveSiteConfig } from "../../src/adapters/declarative/merge.ts"
import {
  validateSiteConfigPatch,
  validateSitePackManifest,
} from "../../src/adapters/declarative/validate.ts"
import { SITE_IDS, SUPPORTED_AI_PLATFORMS } from "../../src/constants/defaults.ts"
import { resolveBuiltinConfig } from "../../src/core/builtin-config-registry.ts"

export { siteMatchPatternsOverlap as matchPatternsOverlap }

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_REGISTRY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..")

const SITE_PACK_SCHEMA_PATH = path.join("schema", "site-pack.schema.json")
const SITE_PACK_EXAMPLE_PATH = path.join("examples", "site-pack.example.json")
const regexValidationOptions = { regexSafetyCheck: safeRegex }
const builtinSiteIds = new Set(Object.values(SITE_IDS))
const builtinMetadataIds = SUPPORTED_AI_PLATFORMS.map((platform) => platform.id)
const builtinMatches = SUPPORTED_AI_PLATFORMS.flatMap(({ id: siteId, matchPatterns }) =>
  matchPatterns.map((pattern) => ({ siteId, pattern })),
)

if (new Set(builtinMetadataIds).size !== builtinMetadataIds.length) {
  throw new Error("Duplicate built-in site metadata")
}
const missingBuiltinSiteMetadata = [...builtinSiteIds].filter(
  (siteId) => !builtinMetadataIds.includes(siteId),
)
if (missingBuiltinSiteMetadata.length > 0) {
  throw new Error(`Missing built-in site metadata: ${missingBuiltinSiteMetadata.join(", ")}`)
}

const formatIssue = (sourcePath, fieldPath, code, message) =>
  `${sourcePath}:${fieldPath} [${code}] ${message}`

const formatValidationErrors = (sourcePath, errors) =>
  errors.map((error) => formatIssue(sourcePath, error.path, error.code, error.message)).join("\n")

const escapeJsonPointerSegment = (value) => value.replaceAll("~", "~0").replaceAll("/", "~1")

const getSchemaErrorPath = (error) => {
  let instancePath = error.instancePath ?? ""
  const property =
    error.keyword === "required"
      ? error.params.missingProperty
      : error.keyword === "additionalProperties"
        ? error.params.additionalProperty
        : error.keyword === "propertyNames"
          ? error.params.propertyName
          : undefined
  if (typeof property === "string") {
    instancePath += `/${escapeJsonPointerSegment(property)}`
  }
  return instancePath ? `$${instancePath}` : "$"
}

const formatSchemaValidationErrors = (sourcePath, errors = []) =>
  errors
    .map((error) =>
      formatIssue(
        sourcePath,
        getSchemaErrorPath(error),
        `schema_${error.keyword}`,
        error.message ?? "JSON Schema validation failed",
      ),
    )
    .join("\n")

const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error))

const parseArguments = (args) => {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    // `pnpm run <script> -- <args>` 会把分隔符原样传给脚本，跳过后再解析实际参数
    if (argument === "--") continue
    const value = args[index + 1]
    if (!value || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${argument}`)
    }
    if (argument === "--registry-root") options.registryRoot = path.resolve(value)
    else throw new TypeError(`Unknown argument: ${argument}`)
    index += 1
  }
  return options
}

const parseJsonFile = async ({ sourcePath, displayPath }) => {
  const sourceText = await readFile(sourcePath, "utf8")
  try {
    return JSON.parse(sourceText)
  } catch (error) {
    throw new Error(formatIssue(displayPath, "$", "invalid_json", getErrorMessage(error)), {
      cause: error,
    })
  }
}

const parseRequiredJsonFile = async (source) => {
  const stats = await lstat(source.sourcePath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      formatIssue(source.displayPath, "$", "invalid_source", "Expected a regular JSON file"),
    )
  }
  return parseJsonFile(source)
}

const loadSitePackSchemaValidator = async (registryRoot) => {
  const source = {
    sourcePath: path.join(registryRoot, SITE_PACK_SCHEMA_PATH),
    displayPath: SITE_PACK_SCHEMA_PATH.replaceAll(path.sep, "/"),
  }
  const schema = await parseRequiredJsonFile(source)
  try {
    const ajv = new Ajv({
      allErrors: true,
      strict: true,
      // Conditional dependencies refer to types/properties declared by root definitions.
      strictTypes: false,
      strictRequired: false,
      allowUnionTypes: true,
    })
    return ajv.compile(schema)
  } catch (error) {
    throw new Error(
      formatIssue(source.displayPath, "$", "invalid_schema", getErrorMessage(error)),
      { cause: error },
    )
  }
}

const validateSitePackInput = (input, sourcePath, schemaValidator) => {
  const schemaValid = schemaValidator(input)
  const runtimeResult = validateSitePackManifest(input, regexValidationOptions)
  const errors = []
  if (!schemaValid) {
    errors.push(formatSchemaValidationErrors(sourcePath, schemaValidator.errors))
  }
  if (!runtimeResult.valid) {
    errors.push(formatValidationErrors(sourcePath, runtimeResult.errors))
  }
  if (errors.length > 0) {
    throw new Error(errors.filter(Boolean).join("\n"))
  }
  return runtimeResult.value
}

const validateSitePackExample = async (registryRoot, schemaValidator) => {
  const source = {
    sourcePath: path.join(registryRoot, SITE_PACK_EXAMPLE_PATH),
    displayPath: SITE_PACK_EXAMPLE_PATH.replaceAll(path.sep, "/"),
  }
  const input = await parseRequiredJsonFile(source)
  validateSitePackInput(input, source.displayPath, schemaValidator)
}

const readSourceFiles = async (directory) => {
  const directoryStats = await lstat(directory)
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(`${directory}: registry source path must be a real directory`)
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const sources = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.endsWith(".json")) continue
    const displayPath = `${path.basename(directory)}/${entry.name}`
    if (!entry.isFile()) {
      throw new Error(
        formatIssue(displayPath, "$", "invalid_source", "Registry JSON must be a regular file"),
      )
    }
    sources.push({
      sourcePath: path.join(directory, entry.name),
      displayPath,
      disabled: entry.name.endsWith(".disabled.json"),
    })
  }
  return sources
}

const validatePackSource = async (source, schemaValidator) => {
  const input = await parseJsonFile(source)
  const manifest = validateSitePackInput(input, source.displayPath, schemaValidator)
  return { ...source, manifest }
}

const validatePatchSource = async (source) => {
  const input = await parseJsonFile(source)
  const targetSiteId =
    input !== null && typeof input === "object" && typeof input.targetSiteId === "string"
      ? input.targetSiteId
      : ""
  const descriptor = targetSiteId ? await resolveBuiltinConfig(targetSiteId) : null
  const allowedPrivateSelectorKeys = descriptor
    ? Object.keys(descriptor.baseConfig.sitePrivateSelectors ?? {})
    : []
  const result = validateSiteConfigPatch(input, {
    allowedPrivateSelectorKeys,
    ...regexValidationOptions,
  })
  if (!result.valid) {
    throw new Error(formatValidationErrors(source.displayPath, result.errors))
  }
  if (!descriptor) {
    throw new Error(
      formatIssue(
        source.displayPath,
        "$.targetSiteId",
        "unknown_builtin_site",
        `No configurable built-in adapter is registered for ${result.value.targetSiteId}`,
      ),
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
    if (resolved.remotePatch.errors) {
      throw new Error(formatValidationErrors(source.displayPath, resolved.remotePatch.errors))
    }
    throw new Error(
      formatIssue(
        source.displayPath,
        "$",
        "patch_not_applicable",
        resolved.remotePatch.reason ?? resolved.remotePatch.status,
      ),
    )
  }

  return { ...source, patch: result.value }
}

const validateSources = async (sources, validator) => {
  const settled = await Promise.allSettled(sources.map(validator))
  const values = []
  const errors = []
  for (const result of settled) {
    if (result.status === "fulfilled") values.push(result.value)
    else errors.push(getErrorMessage(result.reason))
  }
  return { values, errors }
}

const collectRegistryPolicyErrors = (packs, patches) => {
  const errors = []
  const packIds = new Map()
  for (const source of packs) {
    const { id, matches } = source.manifest
    const previous = packIds.get(id)
    if (previous) {
      errors.push(
        formatIssue(
          source.displayPath,
          "$.id",
          "duplicate_id",
          `SitePack id ${id} is already declared by ${previous}`,
        ),
      )
    } else {
      packIds.set(id, source.displayPath)
    }
    if (builtinSiteIds.has(id)) {
      errors.push(
        formatIssue(
          source.displayPath,
          "$.id",
          "builtin_id_conflict",
          `SitePack id ${id} conflicts with an internal SITE_IDS value`,
        ),
      )
    }

    matches.forEach((pattern, matchIndex) => {
      for (const builtin of builtinMatches) {
        if (!siteMatchPatternsOverlap(pattern, builtin.pattern)) continue
        errors.push(
          formatIssue(
            source.displayPath,
            `$.matches[${matchIndex}]`,
            "builtin_match_conflict",
            `Match ${pattern} overlaps built-in site ${builtin.siteId} (${builtin.pattern})`,
          ),
        )
        break
      }
    })
  }

  for (let leftIndex = 0; leftIndex < packs.length; leftIndex += 1) {
    const left = packs[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < packs.length; rightIndex += 1) {
      const right = packs[rightIndex]
      for (let matchIndex = 0; matchIndex < right.manifest.matches.length; matchIndex += 1) {
        const rightPattern = right.manifest.matches[matchIndex]
        const leftPattern = left.manifest.matches.find((pattern) =>
          siteMatchPatternsOverlap(pattern, rightPattern),
        )
        if (!leftPattern) continue
        errors.push(
          formatIssue(
            right.displayPath,
            `$.matches[${matchIndex}]`,
            "registry_match_conflict",
            `Match ${rightPattern} overlaps ${left.displayPath} (${leftPattern})`,
          ),
        )
      }
    }
  }

  const patchTargets = new Map()
  for (const source of patches) {
    const target = source.patch.targetSiteId
    const previous = patchTargets.get(target)
    if (previous) {
      errors.push(
        formatIssue(
          source.displayPath,
          "$.targetSiteId",
          "duplicate_patch_target",
          `Patch target ${target} is already declared by ${previous}`,
        ),
      )
    } else {
      patchTargets.set(target, source.displayPath)
    }
  }

  return errors
}

export async function loadValidatedRegistrySources({ registryRoot = DEFAULT_REGISTRY_ROOT } = {}) {
  const resolvedRegistryRoot = path.resolve(registryRoot)
  const sitesDirectory = path.join(resolvedRegistryRoot, "sites")
  const patchesDirectory = path.join(resolvedRegistryRoot, "patches")
  const sitePackSchemaValidator = await loadSitePackSchemaValidator(resolvedRegistryRoot)
  await validateSitePackExample(resolvedRegistryRoot, sitePackSchemaValidator)
  const [packFiles, patchFiles] = await Promise.all([
    readSourceFiles(sitesDirectory),
    readSourceFiles(patchesDirectory),
  ])
  const [packResults, patchResults] = await Promise.all([
    validateSources(packFiles, (source) => validatePackSource(source, sitePackSchemaValidator)),
    validateSources(patchFiles, validatePatchSource),
  ])

  const packs = packResults.values.sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  )
  const patches = patchResults.values.sort((left, right) =>
    left.patch.targetSiteId.localeCompare(right.patch.targetSiteId),
  )
  const errors = [
    ...packResults.errors,
    ...patchResults.errors,
    ...collectRegistryPolicyErrors(packs, patches),
  ]
  if (errors.length > 0) {
    throw new Error(`Registry validation failed:\n${errors.join("\n")}`)
  }
  return { packs, patches }
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  const options = parseArguments(process.argv.slice(2))
  loadValidatedRegistrySources(options)
    .then(({ packs, patches }) => {
      console.warn(
        `[registry] validated schema example, ${packs.length} SitePack(s), and ${patches.length} patch(es)`,
      )
    })
    .catch((error) => {
      console.error(`[registry] validation failed\n${getErrorMessage(error)}`)
      process.exitCode = 1
    })
}
