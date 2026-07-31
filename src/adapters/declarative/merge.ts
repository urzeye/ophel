import type {
  BuiltinSiteConfig,
  SiteConfigOverride,
  SiteConfigPatch,
  SitePackCapability,
} from "./types"
import {
  compareSemanticVersions,
  isValidSemanticVersion,
  type SitePackValidationError,
  validateBuiltinSiteConfig,
  validateSiteConfigOverride,
  validateSiteConfigPatch,
} from "./validate"

export type SiteConfigPatchSkipReason =
  | "target-site-mismatch"
  | "base-config-version-mismatch"
  | "below-min-app-version"
  | "above-max-app-version"

export type SiteConfigLayerStatus = "absent" | "applied" | "skipped" | "rejected"
export type SiteConfigLayerRejectionStage = "validation" | "merged-config"

export interface SiteConfigLayerOutcome {
  status: SiteConfigLayerStatus
  reason?: SiteConfigPatchSkipReason
  stage?: SiteConfigLayerRejectionStage
  errors?: SitePackValidationError[]
  patchVersion?: number
}

export interface ResolveSiteConfigOptions<T extends BuiltinSiteConfig> {
  siteId: string
  appVersion: string
  configVersion: number
  baseConfig: T
  remotePatch?: unknown
  userOverride?: unknown
}

export interface ResolveSiteConfigResult<T extends BuiltinSiteConfig> {
  /** 始终是最后一层通过完整校验的配置。 */
  config: T
  remotePatch: SiteConfigLayerOutcome
  userOverride: SiteConfigLayerOutcome
}

export interface MergedConfigReceiver<T extends BuiltinSiteConfig = BuiltinSiteConfig> {
  applyMergedConfig(config: T): void
}

export interface ConfigurableBuiltinAdapter<T extends BuiltinSiteConfig = BuiltinSiteConfig>
  extends MergedConfigReceiver<T> {
  getBuiltinConfig(): T
  getBuiltinConfigVersion(): number
}

export class SiteConfigResolutionError extends Error {
  readonly errors: SitePackValidationError[]

  constructor(message: string, errors: SitePackValidationError[]) {
    super(message)
    this.name = "SiteConfigResolutionError"
    this.errors = errors
  }
}

const DANGEROUS_MERGE_KEYS = new Set(["__proto__", "prototype", "constructor"])

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const cloneConfigValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cloneConfigValue)
  if (!isPlainRecord(value)) return value

  const clone: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    if (DANGEROUS_MERGE_KEYS.has(key)) {
      throw new TypeError(`Unsafe config key: ${key}`)
    }
    clone[key] = cloneConfigValue(nestedValue)
  }
  return clone
}

const mergeConfigRecords = (
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> => {
  const result = cloneConfigValue(base) as Record<string, unknown>

  for (const [key, overrideValue] of Object.entries(override)) {
    if (DANGEROUS_MERGE_KEYS.has(key)) {
      throw new TypeError(`Unsafe config key: ${key}`)
    }
    if (overrideValue === undefined) {
      throw new TypeError(`Config override must be JSON-compatible: ${key} is undefined`)
    }
    if (overrideValue === null) {
      delete result[key]
      continue
    }
    if (Array.isArray(overrideValue)) {
      result[key] = overrideValue.map(cloneConfigValue)
      continue
    }
    if (isPlainRecord(overrideValue)) {
      const currentValue = result[key]
      const baseValue: Record<string, unknown> = isPlainRecord(currentValue) ? currentValue : {}
      result[key] = mergeConfigRecords(baseValue, overrideValue)
      continue
    }
    result[key] = overrideValue
  }

  return result
}

/**
 * 合并 JSON 配置：对象递归合并、数组整体替换、null 删除键。
 * 调用方应先使用 validateSiteConfigOverride 校验覆盖层。
 */
export function deepMergeSiteConfig<T extends BuiltinSiteConfig>(
  baseConfig: T,
  override: SiteConfigOverride,
): T {
  return mergeConfigRecords(
    baseConfig as unknown as Record<string, unknown>,
    override as unknown as Record<string, unknown>,
  ) as unknown as T
}

const getPrivateSelectorKeys = (config: BuiltinSiteConfig): string[] =>
  Object.keys(config.sitePrivateSelectors ?? {})

const validateBaseConfigShape = (
  baseValue: unknown,
  candidateValue: unknown,
  path = "$",
): SitePackValidationError[] => {
  if (baseValue === null) return []

  if (Array.isArray(baseValue)) {
    return Array.isArray(candidateValue)
      ? []
      : [{ path, code: "invalid_type", message: "Expected an array from the built-in config" }]
  }

  if (isPlainRecord(baseValue)) {
    if (!isPlainRecord(candidateValue)) {
      return [
        { path, code: "invalid_type", message: "Expected an object from the built-in config" },
      ]
    }

    const errors: SitePackValidationError[] = []
    for (const [key, nestedBaseValue] of Object.entries(baseValue)) {
      if (nestedBaseValue === null) continue

      const nestedPath = `${path}.${key}`
      if (!Object.hasOwn(candidateValue, key)) {
        errors.push({
          path: nestedPath,
          code: "missing_required",
          message: "Built-in config field cannot be removed",
        })
        continue
      }
      errors.push(...validateBaseConfigShape(nestedBaseValue, candidateValue[key], nestedPath))
    }
    return errors
  }

  return typeof candidateValue === typeof baseValue
    ? []
    : [
        {
          path,
          code: "invalid_type",
          message: `Expected ${typeof baseValue} from the built-in config`,
        },
      ]
}

const getPatchSkipReason = (
  patch: SiteConfigPatch,
  siteId: string,
  appVersion: string,
  configVersion: number,
): SiteConfigPatchSkipReason | null => {
  if (patch.targetSiteId !== siteId) return "target-site-mismatch"
  if (patch.baseConfigVersion !== configVersion) return "base-config-version-mismatch"

  const minComparison = compareSemanticVersions(appVersion, patch.minAppVersion)
  if (minComparison === -1) return "below-min-app-version"

  if (patch.maxAppVersion) {
    const maxComparison = compareSemanticVersions(appVersion, patch.maxAppVersion)
    if (maxComparison === 1) return "above-max-app-version"
  }

  return null
}

const applyValidatedOverride = <T extends BuiltinSiteConfig>(
  currentConfig: T,
  baseConfig: T,
  override: SiteConfigOverride,
  allowedPrivateSelectorKeys: readonly string[],
  requiredCapabilities: readonly SitePackCapability[],
): { config: T; outcome: SiteConfigLayerOutcome } => {
  const candidate = deepMergeSiteConfig(currentConfig, override)
  const mergedValidation = validateBuiltinSiteConfig(candidate, {
    allowedPrivateSelectorKeys,
    requiredPrivateSelectorKeys: allowedPrivateSelectorKeys,
    requiredCapabilities,
  })
  if (!mergedValidation.valid) {
    return {
      config: currentConfig,
      outcome: {
        status: "rejected",
        stage: "merged-config",
        errors: mergedValidation.errors,
      },
    }
  }

  const shapeErrors = validateBaseConfigShape(baseConfig, candidate)
  if (shapeErrors.length > 0) {
    return {
      config: currentConfig,
      outcome: {
        status: "rejected",
        stage: "merged-config",
        errors: shapeErrors,
      },
    }
  }

  return { config: candidate, outcome: { status: "applied" } }
}

/**
 * 依次解析内置默认值、远端 patch、用户覆盖。非法层不会覆盖上一份有效配置，
 * 但会通过 outcome 显式暴露拒绝阶段与结构化错误。
 */
export function resolveSiteConfig<T extends BuiltinSiteConfig>(
  options: ResolveSiteConfigOptions<T>,
): ResolveSiteConfigResult<T> {
  if (!isValidSemanticVersion(options.appVersion)) {
    throw new TypeError(`Invalid appVersion: ${options.appVersion}`)
  }
  if (!Number.isInteger(options.configVersion) || options.configVersion < 1) {
    throw new TypeError(`configVersion must be a positive integer: ${options.configVersion}`)
  }

  const allowedPrivateSelectorKeys = getPrivateSelectorKeys(options.baseConfig)
  const requiredCapabilities = [...options.baseConfig.capabilities]
  const baseValidation = validateBuiltinSiteConfig(options.baseConfig, {
    allowedPrivateSelectorKeys,
    requiredPrivateSelectorKeys: allowedPrivateSelectorKeys,
    requiredCapabilities,
  })
  if (!baseValidation.valid) {
    throw new SiteConfigResolutionError("Built-in site config is invalid", baseValidation.errors)
  }

  let currentConfig = cloneConfigValue(options.baseConfig) as T
  let remotePatchOutcome: SiteConfigLayerOutcome = { status: "absent" }
  let userOverrideOutcome: SiteConfigLayerOutcome = { status: "absent" }

  if (options.remotePatch !== undefined && options.remotePatch !== null) {
    const patchValidation = validateSiteConfigPatch(options.remotePatch, {
      allowedPrivateSelectorKeys,
    })
    if (!patchValidation.valid) {
      remotePatchOutcome = {
        status: "rejected",
        stage: "validation",
        errors: patchValidation.errors,
      }
    } else {
      const patch = patchValidation.value
      const skipReason = getPatchSkipReason(
        patch,
        options.siteId,
        options.appVersion,
        options.configVersion,
      )
      if (skipReason) {
        remotePatchOutcome = {
          status: "skipped",
          reason: skipReason,
          patchVersion: patch.patchVersion,
        }
      } else {
        const applied = applyValidatedOverride(
          currentConfig,
          options.baseConfig,
          patch.config,
          allowedPrivateSelectorKeys,
          requiredCapabilities,
        )
        currentConfig = applied.config
        remotePatchOutcome = {
          ...applied.outcome,
          patchVersion: patch.patchVersion,
        }
      }
    }
  }

  if (options.userOverride !== undefined) {
    const overrideValidation = validateSiteConfigOverride(options.userOverride, {
      allowedPrivateSelectorKeys,
    })
    if (!overrideValidation.valid) {
      userOverrideOutcome = {
        status: "rejected",
        stage: "validation",
        errors: overrideValidation.errors,
      }
    } else {
      const applied = applyValidatedOverride(
        currentConfig,
        options.baseConfig,
        overrideValidation.value,
        allowedPrivateSelectorKeys,
        requiredCapabilities,
      )
      currentConfig = applied.config
      userOverrideOutcome = applied.outcome
    }
  }

  return {
    config: currentConfig,
    remotePatch: remotePatchOutcome,
    userOverride: userOverrideOutcome,
  }
}

export const supportsMergedConfig = (
  adapter: unknown,
): adapter is MergedConfigReceiver<BuiltinSiteConfig> =>
  adapter !== null &&
  (typeof adapter === "object" || typeof adapter === "function") &&
  typeof (adapter as { applyMergedConfig?: unknown }).applyMergedConfig === "function"

export const supportsBuiltinSiteConfig = (
  adapter: unknown,
): adapter is ConfigurableBuiltinAdapter<BuiltinSiteConfig> =>
  supportsMergedConfig(adapter) &&
  typeof (adapter as { getBuiltinConfig?: unknown }).getBuiltinConfig === "function" &&
  typeof (adapter as { getBuiltinConfigVersion?: unknown }).getBuiltinConfigVersion === "function"

/** 向已配置化的内置适配器注入解析后的配置；未配置化实例返回 false。 */
export function applyMergedConfig(adapter: unknown, config: BuiltinSiteConfig): boolean {
  if (!supportsMergedConfig(adapter)) return false
  adapter.applyMergedConfig(config)
  return true
}
