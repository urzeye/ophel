import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import Ajv from "ajv"
import safeRegex from "safe-regex2"

import { siteMatchPatternsOverlap } from "../../src/adapters/declarative/match-pattern.ts"
import { resolveSiteConfig } from "../../src/adapters/declarative/merge.ts"
import {
  compareSemanticVersions,
  DANGEROUS_OBJECT_KEYS,
  validateSiteConfigPatch,
  validateSitePackManifest,
} from "../../src/adapters/declarative/validate.ts"
import { SITE_IDS, SUPPORTED_AI_PLATFORMS } from "../../src/constants/defaults.ts"
import { resolveBuiltinConfig } from "../../src/core/builtin-config-registry.ts"

export { siteMatchPatternsOverlap as matchPatternsOverlap }

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_REGISTRY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..")

const APP_VERSION = JSON.parse(
  await readFile(path.resolve(SCRIPT_DIRECTORY, "..", "..", "package.json"), "utf8"),
).version

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

// CI 用 base 代码校验候选 registry 数据：schema 来自候选 PR，而运行时校验器的
// 硬编码白名单来自 base，新字段 + pack 同 PR 时会被误判为未知键。schema 每一层
// additionalProperties: false 已经逐层拒绝未声明的键；只要 Ajv 校验通过，runtime
// 报出的任何 unknown_key 必然是 schema 已声明、base 白名单尚未收录的字段，可一并放行。
const getToleratedSchemaDeclaredUnknownKey = (error) => {
  if (error.code !== "unknown_key") return null

  const segments = error.path.split(".").slice(1)
  if (segments.some((segment) => DANGEROUS_OBJECT_KEYS.has(segment.replace(/\[\d+\]$/, "")))) {
    return null
  }
  return segments
}

// 被放宽的新字段只有更新版本的应用才认识，要求 minAppVersion 不低于当前
// package.json 版本，保证加载该 pack 的版本一定包含字段支持。
const checkForwardCompatibleKeys = (sourcePath, keyLabels, minAppVersion) => {
  const comparison = compareSemanticVersions(minAppVersion, APP_VERSION)
  if (comparison !== null && comparison >= 0) return null
  return formatIssue(
    sourcePath,
    "$.minAppVersion",
    "min_app_version_too_low",
    `Field(s) ${keyLabels.join(", ")} are not supported by app ${APP_VERSION}; set minAppVersion to ${APP_VERSION} or later so only releases with support load this pack`,
  )
}

// 按点分段路径递归删除候选 input 中 schema 已声明但 base 白名单尚未认识的字段，
// 使后续重试校验能返回类型化 manifest 供注册策略检查使用。
const deleteNestedPath = (target, segments) => {
  if (segments.length === 0) return
  const [head, ...rest] = segments
  const match = /^([^\[]+)(?:\[(\d+)\])?$/.exec(head)
  if (!match) return

  const key = match[1]
  const index = match[2]
  if (rest.length === 0) {
    if (index !== undefined && Array.isArray(target[key])) {
      target[key].splice(Number(index), 1)
    } else if (isPlainRecordValue(target)) {
      delete target[key]
    }
    return
  }

  const next = target[key]
  if (index !== undefined && Array.isArray(next)) {
    deleteNestedPath(next[Number(index)], rest)
  } else if (isPlainRecordValue(next)) {
    deleteNestedPath(next, rest)
  }
}

const isPlainRecordValue = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)

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
  let manifest = runtimeResult.valid ? runtimeResult.value : null
  let runtimeErrors = runtimeResult.valid ? [] : runtimeResult.errors
  if (!runtimeResult.valid) {
    const toleratedPaths = []
    const blockingErrors = []
    for (const error of runtimeResult.errors) {
      // schema 已逐层 additionalProperties: false 把关：Ajv 不接受就不放行，
      // runtime 报出的 unknown_key 必然是 schema 已声明、base 白名单尚未认识的字段。
      // schema 拒绝的字段 runtime 也会报 unknown_key，但 schema 错误已先拦截，
      // tolerate 这些噪音避免 message 里同时出现两份等价错误。
      const toleratedPath = getToleratedSchemaDeclaredUnknownKey(error)
      if (toleratedPath !== null) {
        toleratedPaths.push(toleratedPath)
        continue
      }
      blockingErrors.push(error)
    }
    if (toleratedPaths.length > 0 && blockingErrors.length === 0) {
      // 剔除 schema 已声明但 base 白名单尚未认识的字段后重新校验，拿到类型化 manifest
      const strippedInput = structuredClone(input)
      for (const segments of toleratedPaths) deleteNestedPath(strippedInput, segments)
      const retryResult = validateSitePackManifest(strippedInput, regexValidationOptions)
      if (retryResult.valid) {
        manifest = retryResult.value
        runtimeErrors = []
        const keyLabels = toleratedPaths.map((segments) => segments.join("."))
        console.warn(
          `[registry] ${sourcePath}: accepted schema-declared field(s) pending app support: ${keyLabels.join(", ")}`,
        )
        const guardError = checkForwardCompatibleKeys(
          sourcePath,
          keyLabels,
          retryResult.value.minAppVersion,
        )
        if (guardError) errors.push(guardError)
      }
    }
  }
  if (runtimeErrors.length > 0) {
    errors.push(formatValidationErrors(sourcePath, runtimeErrors))
  }
  if (errors.length > 0) {
    throw new Error(errors.filter(Boolean).join("\n"))
  }
  return manifest
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
