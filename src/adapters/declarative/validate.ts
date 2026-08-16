import type {
  BuiltinSiteConfig,
  SiteConfigOverride,
  SiteConfigPatch,
  SitePackCapability,
  SitePackManifest,
} from "./types"
import {
  isValidSitePackId,
  SITE_CONFIG_PATCH_SCHEMA_VERSION,
  SITE_PACK_SCHEMA_VERSION,
} from "./types"
import { SITE_PACK_CAPABILITIES as SITE_PACK_CAPABILITY_VALUES } from "../feature-capabilities"

export const SITE_PACK_MAX_BYTES = 64 * 1024
export const SITE_PACK_MAX_ARRAY_ITEMS = 50
export const SITE_PACK_MAX_MATCHES = 10
export const SITE_PACK_MAX_SELECTOR_LENGTH = 500
export const SITE_PACK_MAX_REGEX_LENGTH = 200
export const SITE_PACK_MAX_EXTRA_CSS_LENGTH = 2000

export type SitePackValidationErrorCode =
  | "invalid_type"
  | "missing_required"
  | "unknown_key"
  | "invalid_value"
  | "out_of_range"
  | "too_large"
  | "duplicate_value"
  | "invalid_pattern"
  | "unsafe_regex"
  | "unsafe_css"
  | "capability_requirement"

export interface SitePackValidationError {
  path: string
  code: SitePackValidationErrorCode
  message: string
}

export type SitePackValidationResult<T> =
  | { valid: true; value: T; errors: [] }
  | { valid: false; errors: SitePackValidationError[] }

export interface SitePackValidationOptions {
  regexSafetyCheck?: (pattern: string) => boolean
  /** Development-only: allow http:// match patterns for local debugging. */
  allowHttpMatches?: boolean
}

export interface SiteConfigValidationOptions extends SitePackValidationOptions {
  allowedPrivateSelectorKeys?: readonly string[]
  requiredPrivateSelectorKeys?: readonly string[]
  requiredCapabilities?: readonly SitePackCapability[]
}

type ValidationMode = "full" | "partial"

interface ValidationContext {
  errors: SitePackValidationError[]
  regexSafetyCheck?: (pattern: string) => boolean
  allowHttpMatches: boolean
}

const createValidationContext = (options: SitePackValidationOptions = {}): ValidationContext => ({
  errors: [],
  regexSafetyCheck: options.regexSafetyCheck,
  allowHttpMatches: options.allowHttpMatches === true,
})

interface StringValidationOptions {
  allowEmpty?: boolean
  maxLength?: number
}

interface StringArrayValidationOptions extends StringValidationOptions {
  minItems?: number
  maxItems?: number
  unique?: boolean
  itemValidator?: (value: string, path: string, context: ValidationContext) => void
}

interface SemanticVersion {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export const DANGEROUS_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"])

const SITE_PACK_CAPABILITIES = new Set<SitePackCapability>(SITE_PACK_CAPABILITY_VALUES)

const CONFIG_KEYS = [
  "theme",
  "capabilities",
  "selectors",
  "input",
  "conversation",
  "generating",
  "session",
  "networkMonitor",
  "modelSwitcher",
  "export",
  "zenMode",
  "cleanMode",
  "widthSelectors",
  "panelAvoidance",
  "mermaidSupport",
  "quickQuote",
  "supportsHostThemeSync",
  "scrollPinRelease",
  "themeSync",
] as const

const MANIFEST_KEYS = [
  "schemaVersion",
  "id",
  "version",
  "minAppVersion",
  "name",
  "nameI18n",
  "description",
  "descriptionI18n",
  "matches",
  ...CONFIG_KEYS,
] as const

const PATCH_KEYS = [
  "targetSiteId",
  "patchSchemaVersion",
  "patchVersion",
  "baseConfigVersion",
  "minAppVersion",
  "maxAppVersion",
  "config",
] as const

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const addError = (
  context: ValidationContext,
  path: string,
  code: SitePackValidationErrorCode,
  message: string,
): void => {
  context.errors.push({ path, code, message })
}

const finishValidation = <T>(
  input: unknown,
  context: ValidationContext,
): SitePackValidationResult<T> => {
  if (context.errors.length > 0) {
    return { valid: false, errors: context.errors }
  }
  return { valid: true, value: input as T, errors: [] }
}

const isDeletion = (value: unknown, mode: ValidationMode): value is null =>
  mode === "partial" && value === null

const validateSerializedSize = (value: unknown, path: string, context: ValidationContext): void => {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return
    const byteLength = new TextEncoder().encode(serialized).byteLength
    if (byteLength > SITE_PACK_MAX_BYTES) {
      addError(
        context,
        path,
        "too_large",
        `Serialized JSON must not exceed ${SITE_PACK_MAX_BYTES} bytes`,
      )
    }
  } catch {
    addError(context, path, "invalid_value", "Value must be JSON serializable")
  }
}

const validateObject = (
  value: unknown,
  path: string,
  context: ValidationContext,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  mode: ValidationMode,
): Record<string, unknown> | null => {
  if (isDeletion(value, mode)) return null
  if (!isPlainRecord(value)) {
    addError(context, path, "invalid_type", "Expected an object")
    return null
  }

  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(value)) {
    if (DANGEROUS_OBJECT_KEYS.has(key) || !allowed.has(key)) {
      addError(context, `${path}.${key}`, "unknown_key", `Unknown key: ${key}`)
      continue
    }
    if (value[key] === undefined) {
      addError(context, `${path}.${key}`, "invalid_type", "undefined is not valid JSON")
    }
  }

  if (mode === "full") {
    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        addError(context, `${path}.${key}`, "missing_required", `Missing required key: ${key}`)
      }
    }
  }

  return value
}

const validateString = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  options: StringValidationOptions = {},
): value is string => {
  if (isDeletion(value, mode)) return false
  if (typeof value !== "string") {
    addError(context, path, "invalid_type", "Expected a string")
    return false
  }
  if (!options.allowEmpty && value.length === 0) {
    addError(context, path, "invalid_value", "String must not be empty")
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    addError(context, path, "too_large", `String must not exceed ${options.maxLength} characters`)
  }
  return true
}

const validateBoolean = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  if (isDeletion(value, mode)) return
  if (typeof value !== "boolean") {
    addError(context, path, "invalid_type", "Expected a boolean")
  }
}

const validateFiniteNumber = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  options: { integer?: boolean; min?: number } = {},
): void => {
  if (isDeletion(value, mode)) return
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(context, path, "invalid_type", "Expected a finite number")
    return
  }
  if (options.integer && !Number.isInteger(value)) {
    addError(context, path, "invalid_value", "Expected an integer")
  }
  if (options.min !== undefined && value < options.min) {
    addError(context, path, "out_of_range", `Number must be at least ${options.min}`)
  }
}

const validateEnum = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  allowedValues: readonly string[],
): void => {
  if (isDeletion(value, mode)) return
  if (typeof value !== "string") {
    addError(context, path, "invalid_type", "Expected a string")
    return
  }
  if (!allowedValues.includes(value)) {
    addError(context, path, "invalid_value", `Expected one of: ${allowedValues.join(", ")}`)
  }
}

const validateStringArray = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  options: StringArrayValidationOptions = {},
): value is string[] => {
  if (isDeletion(value, mode)) return false
  if (!Array.isArray(value)) {
    addError(context, path, "invalid_type", "Expected an array")
    return false
  }

  const maxItems = options.maxItems ?? SITE_PACK_MAX_ARRAY_ITEMS
  if (value.length > maxItems) {
    addError(context, path, "too_large", `Array must not contain more than ${maxItems} items`)
  }
  if (options.minItems !== undefined && value.length < options.minItems) {
    addError(
      context,
      path,
      "out_of_range",
      `Array must contain at least ${options.minItems} item(s)`,
    )
  }

  const seen = new Set<string>()
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (
      validateString(item, itemPath, context, "full", {
        allowEmpty: options.allowEmpty,
        maxLength: options.maxLength,
      })
    ) {
      if (options.unique && seen.has(item)) {
        addError(context, itemPath, "duplicate_value", `Duplicate value: ${item}`)
      }
      seen.add(item)
      options.itemValidator?.(item, itemPath, context)
    }
  })

  return value.every((item) => typeof item === "string")
}

const validateSelectorString = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  validateString(value, path, context, mode, {
    maxLength: SITE_PACK_MAX_SELECTOR_LENGTH,
  })
}

const validateSelectorArray = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  minItems = 0,
): void => {
  validateStringArray(value, path, context, mode, {
    maxLength: SITE_PACK_MAX_SELECTOR_LENGTH,
    minItems,
  })
}

const validateRegex = (value: string, path: string, context: ValidationContext): void => {
  if (value.length > SITE_PACK_MAX_REGEX_LENGTH) {
    addError(
      context,
      path,
      "too_large",
      `Regular expression must not exceed ${SITE_PACK_MAX_REGEX_LENGTH} characters`,
    )
    return
  }
  try {
    new RegExp(value)
  } catch {
    addError(context, path, "invalid_pattern", "Regular expression could not be compiled")
    return
  }
  if (context.regexSafetyCheck) {
    try {
      if (!context.regexSafetyCheck(value)) {
        addError(
          context,
          path,
          "unsafe_regex",
          "Regular expression may cause excessive backtracking",
        )
      }
    } catch {
      addError(context, path, "unsafe_regex", "Regular expression could not be analyzed safely")
    }
  }
}

const validateRegexString = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  if (
    validateString(value, path, context, mode, {
      maxLength: SITE_PACK_MAX_REGEX_LENGTH,
    })
  ) {
    validateRegex(value, path, context)
  }
}

const validateRegexArray = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  validateStringArray(value, path, context, mode, {
    maxLength: SITE_PACK_MAX_REGEX_LENGTH,
    itemValidator: validateRegex,
  })
}

const decodeCssEscapes = (value: string): string =>
  value
    .replace(/\\(?:\r\n|[\n\r\f])/g, "")
    .replace(
      /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f0-9a-fA-F]))/g,
      (_match, hexadecimal: string | undefined, escaped: string | undefined) => {
        if (hexadecimal === undefined) return escaped ?? ""
        const codePoint = Number.parseInt(hexadecimal, 16)
        if (
          codePoint === 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return "�"
        }
        return String.fromCodePoint(codePoint)
      },
    )

export const normalizeCssForValidation = (value: string): string =>
  decodeCssEscapes(value)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

const validateSafeCss = (
  value: string,
  path: string,
  context: ValidationContext,
  maxLength: number,
): void => {
  if (value.length > maxLength) {
    addError(context, path, "too_large", `CSS must not exceed ${maxLength} characters`)
    return
  }

  const normalized = normalizeCssForValidation(value)
  const blockedPatterns = [
    { pattern: /url\s*\(/, label: "url(" },
    { pattern: /@import\b/, label: "@import" },
    { pattern: /expression\s*\(/, label: "expression(" },
    { pattern: /javascript\s*:/, label: "javascript:" },
  ]

  for (const blocked of blockedPatterns) {
    if (blocked.pattern.test(normalized)) {
      addError(context, path, "unsafe_css", `CSS contains blocked token: ${blocked.label}`)
      return
    }
  }
}

const validateCssString = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  maxLength: number,
): void => {
  if (validateString(value, path, context, mode, { allowEmpty: true, maxLength })) {
    validateSafeCss(value, path, context, maxLength)
  }
}

const validateSameOriginPath = (value: string, path: string, context: ValidationContext): void => {
  if (!value.startsWith("/") || value.startsWith("//")) {
    addError(
      context,
      path,
      "invalid_pattern",
      "Path must start with a single slash and remain on the current origin",
    )
  }
}

const parseSemanticVersion = (value: string): SemanticVersion | null => {
  const match = SEMANTIC_VERSION_PATTERN.exec(value)
  if (!match) return null

  const numericParts = match.slice(1, 4).map(Number)
  if (numericParts.some((part) => !Number.isSafeInteger(part))) return null

  const prerelease = match[4]?.split(".") ?? []
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) {
    return null
  }

  return {
    major: numericParts[0],
    minor: numericParts[1],
    patch: numericParts[2],
    prerelease,
  }
}

export const isValidSemanticVersion = (value: string): boolean =>
  parseSemanticVersion(value) !== null

export const compareSemanticVersions = (left: string, right: string): number | null => {
  const leftVersion = parseSemanticVersion(left)
  const rightVersion = parseSemanticVersion(right)
  if (!leftVersion || !rightVersion) return null

  for (const key of ["major", "minor", "patch"] as const) {
    if (leftVersion[key] !== rightVersion[key]) {
      return leftVersion[key] < rightVersion[key] ? -1 : 1
    }
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0
  if (leftVersion.prerelease.length === 0) return 1
  if (rightVersion.prerelease.length === 0) return -1

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index]
    const rightPart = rightVersion.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) {
      if (leftPart.length !== rightPart.length) {
        return leftPart.length < rightPart.length ? -1 : 1
      }
      return leftPart < rightPart ? -1 : 1
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart < rightPart ? -1 : 1
  }

  return 0
}

const validateSemanticVersion = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  if (validateString(value, path, context, mode) && !isValidSemanticVersion(value)) {
    addError(context, path, "invalid_pattern", "Expected a valid semantic version")
  }
}

const validateI18nRecord = (value: unknown, path: string, context: ValidationContext): void => {
  if (!isPlainRecord(value)) {
    addError(context, path, "invalid_type", "Expected a locale-to-string object")
    return
  }

  for (const [locale, translation] of Object.entries(value)) {
    if (DANGEROUS_OBJECT_KEYS.has(locale)) {
      addError(context, `${path}.${locale}`, "unknown_key", `Unsafe locale key: ${locale}`)
      continue
    }
    if (locale.length === 0 || locale.length > 35) {
      addError(context, `${path}.${locale}`, "invalid_value", "Invalid locale key")
    }
    validateString(translation, `${path}.${locale}`, context, "full")
  }
}

const validateTheme = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const theme = validateObject(
    value,
    path,
    context,
    ["primary", "secondary"],
    ["primary", "secondary"],
    mode,
  )
  if (!theme) return

  for (const key of ["primary", "secondary"] as const) {
    const color = theme[key]
    if (color !== undefined) {
      const colorPath = `${path}.${key}`
      if (validateString(color, colorPath, context, mode) && !COLOR_PATTERN.test(color)) {
        addError(context, colorPath, "invalid_pattern", "Expected a hexadecimal color literal")
      }
    }
  }
}

const validateCapabilities = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  if (isDeletion(value, mode)) return
  if (!Array.isArray(value)) {
    addError(context, path, "invalid_type", "Expected an array")
    return
  }
  if (value.length > SITE_PACK_MAX_ARRAY_ITEMS) {
    addError(
      context,
      path,
      "too_large",
      `Array must not contain more than ${SITE_PACK_MAX_ARRAY_ITEMS} items`,
    )
  }

  const seen = new Set<string>()
  value.forEach((capability, index) => {
    const capabilityPath = `${path}[${index}]`
    if (typeof capability !== "string") {
      addError(context, capabilityPath, "invalid_type", "Expected a string")
      return
    }
    if (!SITE_PACK_CAPABILITIES.has(capability as SitePackCapability)) {
      addError(context, capabilityPath, "invalid_value", `Unknown capability: ${capability}`)
    }
    if (seen.has(capability)) {
      addError(context, capabilityPath, "duplicate_value", `Duplicate capability: ${capability}`)
    }
    seen.add(capability)
  })
}

const validateSelectors = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const selectorKeys = [
    "textarea",
    "submitButton",
    "responseContainer",
    "chatContent",
    "userQuery",
    "assistantResponse",
    "newChatButton",
    "stopButton",
    "scrollContainer",
    "sidebarScrollContainer",
    "outlineExclude",
  ] as const
  const selectors = validateObject(value, path, context, selectorKeys, [], mode)
  if (!selectors) return

  for (const key of [
    "textarea",
    "submitButton",
    "chatContent",
    "newChatButton",
    "stopButton",
    "scrollContainer",
    "outlineExclude",
  ] as const) {
    if (selectors[key] !== undefined) {
      validateSelectorArray(selectors[key], `${path}.${key}`, context, mode)
    }
  }
  for (const key of [
    "responseContainer",
    "userQuery",
    "assistantResponse",
    "sidebarScrollContainer",
  ] as const) {
    if (selectors[key] !== undefined) {
      validateSelectorString(selectors[key], `${path}.${key}`, context, mode)
    }
  }
}

const validateInput = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const input = validateObject(value, path, context, ["mode", "submitKey"], ["mode"], mode)
  if (!input) return
  if (input.mode !== undefined) {
    validateEnum(input.mode, `${path}.mode`, context, mode, ["textarea", "contenteditable"])
  }
  if (input.submitKey !== undefined) {
    validateEnum(input.submitKey, `${path}.submitKey`, context, mode, ["Enter", "Ctrl+Enter"])
  }
}

const validateConversation = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const conversation = validateObject(
    value,
    path,
    context,
    [
      "itemSelector",
      "idFrom",
      "titleSelector",
      "urlTemplate",
      "activeMatch",
      "navigationStrategy",
      "shadow",
    ],
    ["itemSelector", "idFrom", "urlTemplate"],
    mode,
  )
  if (!conversation) return

  if (conversation.itemSelector !== undefined) {
    validateSelectorString(conversation.itemSelector, `${path}.itemSelector`, context, mode)
  }
  if (conversation.idFrom !== undefined) {
    const idFrom = validateObject(
      conversation.idFrom,
      `${path}.idFrom`,
      context,
      ["attr", "regex"],
      ["regex"],
      mode,
    )
    if (idFrom?.attr !== undefined) {
      validateString(idFrom.attr, `${path}.idFrom.attr`, context, mode, { maxLength: 100 })
    }
    if (idFrom?.regex !== undefined) {
      validateRegexString(idFrom.regex, `${path}.idFrom.regex`, context, mode)
    }
  }
  if (conversation.titleSelector !== undefined) {
    validateSelectorString(conversation.titleSelector, `${path}.titleSelector`, context, mode)
  }
  if (conversation.urlTemplate !== undefined) {
    const urlPath = `${path}.urlTemplate`
    if (validateString(conversation.urlTemplate, urlPath, context, mode, { maxLength: 500 })) {
      validateSameOriginPath(conversation.urlTemplate, urlPath, context)
    }
  }
  if (conversation.activeMatch !== undefined) {
    validateSelectorString(conversation.activeMatch, `${path}.activeMatch`, context, mode)
  }
  if (conversation.navigationStrategy !== undefined) {
    validateEnum(conversation.navigationStrategy, `${path}.navigationStrategy`, context, mode, [
      "click-item",
      "location",
    ])
  }
  if (conversation.shadow !== undefined) {
    validateBoolean(conversation.shadow, `${path}.shadow`, context, mode)
  }
}

const validateGenerating = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const generating = validateObject(
    value,
    path,
    context,
    ["existsSelectors"],
    ["existsSelectors"],
    mode,
  )
  if (generating?.existsSelectors !== undefined) {
    validateSelectorArray(generating.existsSelectors, `${path}.existsSelectors`, context, mode, 1)
  }
}

const validateSession = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const session = validateObject(
    value,
    path,
    context,
    ["idFromPathRegex", "newConversationPathPatterns", "sharePathPrefix", "newTabPath"],
    [],
    mode,
  )
  if (!session) return

  if (session.idFromPathRegex !== undefined) {
    validateRegexString(session.idFromPathRegex, `${path}.idFromPathRegex`, context, mode)
  }
  if (session.newConversationPathPatterns !== undefined) {
    validateRegexArray(
      session.newConversationPathPatterns,
      `${path}.newConversationPathPatterns`,
      context,
      mode,
    )
  }
  if (session.sharePathPrefix !== undefined) {
    const sharePath = `${path}.sharePathPrefix`
    if (validateString(session.sharePathPrefix, sharePath, context, mode, { maxLength: 500 })) {
      validateSameOriginPath(session.sharePathPrefix, sharePath, context)
    }
  }
  if (session.newTabPath !== undefined) {
    const newTabPath = `${path}.newTabPath`
    if (validateString(session.newTabPath, newTabPath, context, mode, { maxLength: 500 })) {
      validateSameOriginPath(session.newTabPath, newTabPath, context)
    }
  }
}

const validateThemeSync = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const themeSync = validateObject(
    value,
    path,
    context,
    ["storageKey", "valuePath", "valueFormat", "values", "darkClass", "lightClass"],
    ["storageKey", "values"],
    mode,
  )
  if (!themeSync) return

  if (themeSync.storageKey !== undefined) {
    validateString(themeSync.storageKey, `${path}.storageKey`, context, mode, { maxLength: 200 })
  }

  if (themeSync.valuePath !== undefined) {
    const valuePathPath = `${path}.valuePath`
    if (validateString(themeSync.valuePath, valuePathPath, context, mode, { maxLength: 200 })) {
      // 点分隔路径逐段校验，拒绝原型污染风险段
      for (const segment of themeSync.valuePath.split(".")) {
        if (segment.length === 0) {
          addError(context, valuePathPath, "invalid_value", "Path segments must not be empty")
          break
        }
        if (DANGEROUS_OBJECT_KEYS.has(segment)) {
          addError(
            context,
            valuePathPath,
            "invalid_value",
            `Path segment "${segment}" is not allowed`,
          )
          break
        }
      }
    }
    // 嵌套存储时值总是以裸字符串写入对象，valueFormat 无意义
    if (themeSync.valueFormat !== undefined) {
      addError(
        context,
        `${path}.valueFormat`,
        "invalid_value",
        "valueFormat is not supported together with valuePath",
      )
    }
  } else if (themeSync.valueFormat !== undefined) {
    validateEnum(themeSync.valueFormat, `${path}.valueFormat`, context, mode, ["raw", "json"])
  }

  if (themeSync.values !== undefined) {
    const values = validateObject(
      themeSync.values,
      `${path}.values`,
      context,
      ["dark", "light", "system"],
      ["dark", "light"],
      mode,
    )
    if (values) {
      if (values.dark !== undefined) {
        validateString(values.dark, `${path}.values.dark`, context, mode, { maxLength: 100 })
      }
      if (values.light !== undefined) {
        validateString(values.light, `${path}.values.light`, context, mode, { maxLength: 100 })
      }
      if (values.system !== undefined) {
        validateString(values.system, `${path}.values.system`, context, mode, { maxLength: 100 })
      }
    }
  }

  if (themeSync.darkClass !== undefined) {
    validateString(themeSync.darkClass, `${path}.darkClass`, context, mode, { maxLength: 100 })
  }
  if (themeSync.lightClass !== undefined) {
    const lightClassOk = validateString(themeSync.lightClass, `${path}.lightClass`, context, mode, {
      maxLength: 100,
    })
    if (lightClassOk && themeSync.lightClass === themeSync.darkClass) {
      addError(
        context,
        `${path}.lightClass`,
        "invalid_value",
        "lightClass must differ from darkClass",
      )
    }
  }
}

const validateNetworkMonitor = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const monitor = validateObject(
    value,
    path,
    context,
    ["urlPatterns", "urlPathEndsWith", "silenceThreshold", "requestBodyRules"],
    ["urlPatterns", "silenceThreshold"],
    mode,
  )
  if (!monitor) return

  if (monitor.urlPatterns !== undefined) {
    validateStringArray(monitor.urlPatterns, `${path}.urlPatterns`, context, mode, {
      minItems: 1,
      maxLength: 500,
    })
  }
  if (monitor.urlPathEndsWith !== undefined) {
    validateStringArray(monitor.urlPathEndsWith, `${path}.urlPathEndsWith`, context, mode, {
      maxLength: 500,
    })
  }
  if (monitor.silenceThreshold !== undefined) {
    validateFiniteNumber(monitor.silenceThreshold, `${path}.silenceThreshold`, context, mode, {
      min: 0,
    })
  }
  if (monitor.requestBodyRules !== undefined) {
    if (isDeletion(monitor.requestBodyRules, mode)) return
    if (!Array.isArray(monitor.requestBodyRules)) {
      addError(context, `${path}.requestBodyRules`, "invalid_type", "Expected an array")
      return
    }
    if (monitor.requestBodyRules.length > SITE_PACK_MAX_ARRAY_ITEMS) {
      addError(
        context,
        `${path}.requestBodyRules`,
        "too_large",
        `Array must not contain more than ${SITE_PACK_MAX_ARRAY_ITEMS} items`,
      )
    }
    monitor.requestBodyRules.forEach((rule, index) => {
      const rulePath = `${path}.requestBodyRules[${index}]`
      const ruleRecord = validateObject(
        rule,
        rulePath,
        context,
        ["type", "field", "metadata"],
        ["type", "field", "metadata"],
        "full",
      )
      if (!ruleRecord) return
      if (ruleRecord.type !== undefined) {
        validateEnum(ruleRecord.type, `${rulePath}.type`, context, "full", ["json-field-exists"])
      }
      if (ruleRecord.field !== undefined) {
        validateString(ruleRecord.field, `${rulePath}.field`, context, "full", { maxLength: 200 })
      }
      if (ruleRecord.metadata !== undefined) {
        const metadata = ruleRecord.metadata
        if (!isPlainRecord(metadata)) {
          addError(context, `${rulePath}.metadata`, "invalid_type", "Expected an object")
        } else {
          for (const [key, metadataValue] of Object.entries(metadata)) {
            if (DANGEROUS_OBJECT_KEYS.has(key)) {
              addError(context, `${rulePath}.metadata.${key}`, "unknown_key", `Unsafe key: ${key}`)
              continue
            }
            if (
              metadataValue !== null &&
              typeof metadataValue !== "string" &&
              typeof metadataValue !== "number" &&
              typeof metadataValue !== "boolean"
            ) {
              addError(
                context,
                `${rulePath}.metadata.${key}`,
                "invalid_type",
                "Metadata values must be string, number, boolean, or null",
              )
            }
          }
        }
      }
    })
  }
}

const validateModelSwitcher = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const modelSwitcher = validateObject(
    value,
    path,
    context,
    [
      "selectorButtonSelectors",
      "menuItemSelector",
      "checkInterval",
      "maxAttempts",
      "menuRenderDelay",
      "subMenuTriggers",
      "subMenuSelector",
    ],
    ["selectorButtonSelectors", "menuItemSelector"],
    mode,
  )
  if (!modelSwitcher) return

  if (modelSwitcher.selectorButtonSelectors !== undefined) {
    validateSelectorArray(
      modelSwitcher.selectorButtonSelectors,
      `${path}.selectorButtonSelectors`,
      context,
      mode,
      1,
    )
  }
  if (modelSwitcher.menuItemSelector !== undefined) {
    validateSelectorString(
      modelSwitcher.menuItemSelector,
      `${path}.menuItemSelector`,
      context,
      mode,
    )
  }
  for (const key of ["checkInterval", "maxAttempts", "menuRenderDelay"] as const) {
    if (modelSwitcher[key] !== undefined) {
      validateFiniteNumber(modelSwitcher[key], `${path}.${key}`, context, mode, {
        integer: true,
        min: key === "menuRenderDelay" ? 0 : 1,
      })
    }
  }
  if (modelSwitcher.subMenuTriggers !== undefined) {
    validateStringArray(modelSwitcher.subMenuTriggers, `${path}.subMenuTriggers`, context, mode, {
      maxLength: 200,
    })
  }
  if (modelSwitcher.subMenuSelector !== undefined) {
    validateSelectorString(modelSwitcher.subMenuSelector, `${path}.subMenuSelector`, context, mode)
  }
}

const validateExport = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const exportConfig = validateObject(
    value,
    path,
    context,
    ["userQuerySelector", "assistantResponseSelector", "turnSelector", "useShadowDOM"],
    ["userQuerySelector", "assistantResponseSelector", "turnSelector", "useShadowDOM"],
    mode,
  )
  if (!exportConfig) return

  for (const key of ["userQuerySelector", "assistantResponseSelector"] as const) {
    if (exportConfig[key] !== undefined) {
      validateSelectorString(exportConfig[key], `${path}.${key}`, context, mode)
    }
  }
  if (exportConfig.turnSelector !== undefined) {
    if (exportConfig.turnSelector !== null) {
      validateSelectorString(exportConfig.turnSelector, `${path}.turnSelector`, context, mode)
    }
  }
  if (exportConfig.useShadowDOM !== undefined) {
    validateBoolean(exportConfig.useShadowDOM, `${path}.useShadowDOM`, context, mode)
  }
}

const validateZenRootClass = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const rootClass = validateObject(
    value,
    path,
    context,
    ["selector", "className"],
    ["selector", "className"],
    mode,
  )
  if (!rootClass) return
  if (rootClass.selector !== undefined) {
    validateSelectorString(rootClass.selector, `${path}.selector`, context, mode)
  }
  if (rootClass.className !== undefined) {
    validateString(rootClass.className, `${path}.className`, context, mode, { maxLength: 200 })
  }
}

const validateZenStyle = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const style = validateObject(
    value,
    path,
    context,
    ["selector", "property", "value", "globalSelector", "extraCss"],
    ["selector", "property", "value"],
    mode,
  )
  if (!style) return
  if (style.selector !== undefined) {
    validateSelectorString(style.selector, `${path}.selector`, context, mode)
  }
  if (style.property !== undefined) {
    validateString(style.property, `${path}.property`, context, mode, { maxLength: 100 })
  }
  if (style.value !== undefined) {
    validateCssString(style.value, `${path}.value`, context, mode, SITE_PACK_MAX_EXTRA_CSS_LENGTH)
  }
  if (style.globalSelector !== undefined) {
    validateSelectorString(style.globalSelector, `${path}.globalSelector`, context, mode)
  }
  if (style.extraCss !== undefined) {
    validateCssString(
      style.extraCss,
      `${path}.extraCss`,
      context,
      mode,
      SITE_PACK_MAX_EXTRA_CSS_LENGTH,
    )
  }
}

const validateZenMode = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const zenMode = validateObject(value, path, context, ["hide", "rootClass", "styles"], [], mode)
  if (!zenMode) return
  if (zenMode.hide !== undefined) {
    validateSelectorArray(zenMode.hide, `${path}.hide`, context, mode)
  }
  if (zenMode.rootClass !== undefined) {
    validateZenRootClass(zenMode.rootClass, `${path}.rootClass`, context, mode)
  }
  if (zenMode.styles !== undefined) {
    if (isDeletion(zenMode.styles, mode)) return
    if (!Array.isArray(zenMode.styles)) {
      addError(context, `${path}.styles`, "invalid_type", "Expected an array")
      return
    }
    if (zenMode.styles.length > SITE_PACK_MAX_ARRAY_ITEMS) {
      addError(
        context,
        `${path}.styles`,
        "too_large",
        `Array must not contain more than ${SITE_PACK_MAX_ARRAY_ITEMS} items`,
      )
    }
    zenMode.styles.forEach((style, index) =>
      validateZenStyle(style, `${path}.styles[${index}]`, context, "full"),
    )
  }
}

const validateWidthSelector = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const widthSelector = validateObject(
    value,
    path,
    context,
    ["selector", "property", "globalSelector", "value", "extraCss", "noCenter"],
    ["selector", "property"],
    mode,
  )
  if (!widthSelector) return
  if (widthSelector.selector !== undefined) {
    validateSelectorString(widthSelector.selector, `${path}.selector`, context, mode)
  }
  if (widthSelector.property !== undefined) {
    validateString(widthSelector.property, `${path}.property`, context, mode, { maxLength: 100 })
  }
  if (widthSelector.globalSelector !== undefined) {
    validateSelectorString(widthSelector.globalSelector, `${path}.globalSelector`, context, mode)
  }
  if (widthSelector.value !== undefined) {
    validateCssString(
      widthSelector.value,
      `${path}.value`,
      context,
      mode,
      SITE_PACK_MAX_EXTRA_CSS_LENGTH,
    )
  }
  if (widthSelector.extraCss !== undefined) {
    validateCssString(
      widthSelector.extraCss,
      `${path}.extraCss`,
      context,
      mode,
      SITE_PACK_MAX_EXTRA_CSS_LENGTH,
    )
  }
  if (widthSelector.noCenter !== undefined) {
    validateBoolean(widthSelector.noCenter, `${path}.noCenter`, context, mode)
  }
}

const validateWidthSelectors = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  if (isDeletion(value, mode)) return
  if (!Array.isArray(value)) {
    addError(context, path, "invalid_type", "Expected an array")
    return
  }
  if (value.length > SITE_PACK_MAX_ARRAY_ITEMS) {
    addError(
      context,
      path,
      "too_large",
      `Array must not contain more than ${SITE_PACK_MAX_ARRAY_ITEMS} items`,
    )
  }
  value.forEach((selector, index) =>
    validateWidthSelector(selector, `${path}[${index}]`, context, "full"),
  )
}

const validatePanelAvoidanceInset = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const inset = validateObject(
    value,
    path,
    context,
    [
      "selector",
      "scopeSelector",
      "obstacleSelectors",
      "applySide",
      "insetMode",
      "leftProperty",
      "rightProperty",
      "extraCss",
    ],
    ["selector"],
    mode,
  )
  if (!inset) return
  if (inset.selector !== undefined) {
    validateSelectorString(inset.selector, `${path}.selector`, context, mode)
  }
  if (inset.scopeSelector !== undefined) {
    validateSelectorString(inset.scopeSelector, `${path}.scopeSelector`, context, mode)
  }
  if (inset.obstacleSelectors !== undefined) {
    validateSelectorArray(inset.obstacleSelectors, `${path}.obstacleSelectors`, context, mode)
  }
  if (inset.applySide !== undefined) {
    validateEnum(inset.applySide, `${path}.applySide`, context, mode, ["both", "left", "right"])
  }
  if (inset.insetMode !== undefined) {
    validateEnum(inset.insetMode, `${path}.insetMode`, context, mode, ["centered", "edge"])
  }
  if (inset.leftProperty !== undefined) {
    validateString(inset.leftProperty, `${path}.leftProperty`, context, mode, { maxLength: 100 })
  }
  if (inset.rightProperty !== undefined) {
    validateString(inset.rightProperty, `${path}.rightProperty`, context, mode, { maxLength: 100 })
  }
  if (inset.extraCss !== undefined) {
    validateCssString(
      inset.extraCss,
      `${path}.extraCss`,
      context,
      mode,
      SITE_PACK_MAX_EXTRA_CSS_LENGTH,
    )
  }
}

const validatePanelAvoidance = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  const avoidance = validateObject(
    value,
    path,
    context,
    [
      "scopeSelector",
      "obstacleSelectors",
      "widthSelectors",
      "insetSelectors",
      "defaultWidth",
      "gap",
      "minVisiblePanelWidth",
      "minSafeWidth",
      "minViewportWidth",
    ],
    ["widthSelectors"],
    mode,
  )
  if (!avoidance) return
  if (avoidance.scopeSelector !== undefined) {
    validateSelectorString(avoidance.scopeSelector, `${path}.scopeSelector`, context, mode)
  }
  if (avoidance.obstacleSelectors !== undefined) {
    validateSelectorArray(avoidance.obstacleSelectors, `${path}.obstacleSelectors`, context, mode)
  }
  if (avoidance.widthSelectors !== undefined) {
    validateWidthSelectors(avoidance.widthSelectors, `${path}.widthSelectors`, context, mode)
  }
  if (avoidance.insetSelectors !== undefined) {
    if (isDeletion(avoidance.insetSelectors, mode)) return
    if (!Array.isArray(avoidance.insetSelectors)) {
      addError(context, `${path}.insetSelectors`, "invalid_type", "Expected an array")
      return
    }
    if (avoidance.insetSelectors.length > SITE_PACK_MAX_ARRAY_ITEMS) {
      addError(
        context,
        `${path}.insetSelectors`,
        "too_large",
        `Array must not contain more than ${SITE_PACK_MAX_ARRAY_ITEMS} items`,
      )
    }
    avoidance.insetSelectors.forEach((inset, index) =>
      validatePanelAvoidanceInset(inset, `${path}.insetSelectors[${index}]`, context, "full"),
    )
  }
  if (avoidance.defaultWidth !== undefined) {
    validateCssString(
      avoidance.defaultWidth,
      `${path}.defaultWidth`,
      context,
      mode,
      SITE_PACK_MAX_EXTRA_CSS_LENGTH,
    )
  }
  for (const key of ["gap", "minVisiblePanelWidth", "minSafeWidth", "minViewportWidth"] as const) {
    if (avoidance[key] !== undefined) {
      validateFiniteNumber(avoidance[key], `${path}.${key}`, context, mode, { min: 0 })
    }
  }
}

const validatePrivateSelectors = (
  value: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  allowedKeys: ReadonlySet<string>,
  requiredKeys: ReadonlySet<string>,
): void => {
  if (isDeletion(value, mode)) return
  if (!isPlainRecord(value)) {
    addError(context, path, "invalid_type", "Expected an object")
    return
  }

  if (mode === "full") {
    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        addError(
          context,
          `${path}.${key}`,
          "missing_required",
          `Missing required private selector: ${key}`,
        )
      }
    }
  }

  for (const [key, selector] of Object.entries(value)) {
    const selectorPath = `${path}.${key}`
    if (DANGEROUS_OBJECT_KEYS.has(key) || !allowedKeys.has(key)) {
      addError(context, selectorPath, "unknown_key", `Private selector key is not allowed: ${key}`)
      continue
    }
    if (isDeletion(selector, mode)) continue
    if (typeof selector === "string") {
      validateSelectorString(selector, selectorPath, context, "full")
    } else {
      validateSelectorArray(selector, selectorPath, context, "full", 1)
    }
  }
}

const hasNonEmptyStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.some((item) => typeof item === "string" && item.length > 0)

const validateCapabilityRequirements = (
  config: Record<string, unknown>,
  path: string,
  context: ValidationContext,
): void => {
  if (!Array.isArray(config.capabilities)) return
  const capabilities = new Set(
    config.capabilities.filter(
      (capability): capability is SitePackCapability =>
        typeof capability === "string" &&
        SITE_PACK_CAPABILITIES.has(capability as SitePackCapability),
    ),
  )
  const selectors = isPlainRecord(config.selectors) ? config.selectors : {}

  const requireField = (
    capability: SitePackCapability,
    present: boolean,
    fieldPath: string,
  ): void => {
    if (capabilities.has(capability) && !present) {
      addError(
        context,
        fieldPath,
        "capability_requirement",
        `Capability ${capability} requires this field`,
      )
    }
  }

  requireField(
    "outline",
    typeof selectors.responseContainer === "string",
    `${path}.selectors.responseContainer`,
  )
  requireField("conversation-list", isPlainRecord(config.conversation), `${path}.conversation`)
  requireField("export-basic", isPlainRecord(config.export), `${path}.export`)
  requireField("model-lock", isPlainRecord(config.modelSwitcher), `${path}.modelSwitcher`)
  requireField(
    "generation-detect",
    isPlainRecord(config.generating) || isPlainRecord(config.networkMonitor),
    `${path}.generating`,
  )
  requireField(
    "new-chat",
    hasNonEmptyStringArray(selectors.newChatButton),
    `${path}.selectors.newChatButton`,
  )
  requireField(
    "stop-generation",
    hasNonEmptyStringArray(selectors.stopButton),
    `${path}.selectors.stopButton`,
  )
  requireField(
    "width",
    Array.isArray(config.widthSelectors) && config.widthSelectors.length > 0,
    `${path}.widthSelectors`,
  )
  requireField("panel-avoidance", isPlainRecord(config.panelAvoidance), `${path}.panelAvoidance`)
  requireField("zen", isPlainRecord(config.zenMode), `${path}.zenMode`)
  requireField("clean", isPlainRecord(config.cleanMode), `${path}.cleanMode`)
  requireField(
    "prompt-insert",
    hasNonEmptyStringArray(selectors.textarea),
    `${path}.selectors.textarea`,
  )
  requireField("prompt-insert", isPlainRecord(config.input), `${path}.input`)
  requireField(
    "reading-history",
    hasNonEmptyStringArray(selectors.chatContent),
    `${path}.selectors.chatContent`,
  )
  requireField(
    "outline-user-queries",
    typeof selectors.userQuery === "string",
    `${path}.selectors.userQuery`,
  )

  if (capabilities.has("outline-user-queries") && !capabilities.has("outline")) {
    addError(
      context,
      `${path}.capabilities`,
      "capability_requirement",
      "Capability outline-user-queries also requires outline",
    )
  }
}

const validateRequiredCapabilities = (
  config: Record<string, unknown>,
  path: string,
  context: ValidationContext,
  requiredCapabilities: readonly SitePackCapability[],
): void => {
  if (!Array.isArray(config.capabilities)) return
  const declared = new Set(
    config.capabilities.filter((value): value is string => typeof value === "string"),
  )
  for (const capability of requiredCapabilities) {
    if (!declared.has(capability)) {
      addError(
        context,
        `${path}.capabilities`,
        "capability_requirement",
        `Built-in capability cannot be removed: ${capability}`,
      )
    }
  }
}

const validateConfigFields = (
  config: Record<string, unknown>,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
): void => {
  if (config.theme !== undefined) validateTheme(config.theme, `${path}.theme`, context, mode)
  if (config.capabilities !== undefined) {
    validateCapabilities(config.capabilities, `${path}.capabilities`, context, mode)
  }
  if (config.selectors !== undefined) {
    validateSelectors(config.selectors, `${path}.selectors`, context, mode)
  }
  if (config.input !== undefined) validateInput(config.input, `${path}.input`, context, mode)
  if (config.conversation !== undefined) {
    validateConversation(config.conversation, `${path}.conversation`, context, mode)
  }
  if (config.generating !== undefined) {
    validateGenerating(config.generating, `${path}.generating`, context, mode)
  }
  if (config.session !== undefined)
    validateSession(config.session, `${path}.session`, context, mode)
  if (config.networkMonitor !== undefined) {
    validateNetworkMonitor(config.networkMonitor, `${path}.networkMonitor`, context, mode)
  }
  if (config.modelSwitcher !== undefined) {
    validateModelSwitcher(config.modelSwitcher, `${path}.modelSwitcher`, context, mode)
  }
  if (config.export !== undefined) validateExport(config.export, `${path}.export`, context, mode)
  if (config.zenMode !== undefined)
    validateZenMode(config.zenMode, `${path}.zenMode`, context, mode)
  if (config.cleanMode !== undefined) {
    validateZenMode(config.cleanMode, `${path}.cleanMode`, context, mode)
  }
  if (config.widthSelectors !== undefined) {
    validateWidthSelectors(config.widthSelectors, `${path}.widthSelectors`, context, mode)
  }
  if (config.panelAvoidance !== undefined) {
    validatePanelAvoidance(config.panelAvoidance, `${path}.panelAvoidance`, context, mode)
  }
  if (config.mermaidSupport !== undefined) {
    validateEnum(config.mermaidSupport, `${path}.mermaidSupport`, context, mode, [
      "native",
      "fallback",
    ])
  }
  if (config.quickQuote !== undefined) {
    validateEnum(config.quickQuote, `${path}.quickQuote`, context, mode, [
      "enabled",
      "native",
      "disabled",
    ])
  }
  if (config.supportsHostThemeSync !== undefined) {
    validateBoolean(config.supportsHostThemeSync, `${path}.supportsHostThemeSync`, context, mode)
  }
  if (config.scrollPinRelease !== undefined) {
    validateBoolean(config.scrollPinRelease, `${path}.scrollPinRelease`, context, mode)
  }
  if (config.themeSync !== undefined) {
    validateThemeSync(config.themeSync, `${path}.themeSync`, context, mode)
  }
  if (config.themeSync !== undefined && config.supportsHostThemeSync === false) {
    addError(
      context,
      `${path}.themeSync`,
      "invalid_value",
      "themeSync conflicts with supportsHostThemeSync: false",
    )
  }

  if (mode === "full") validateCapabilityRequirements(config, path, context)
}

const validateMatchPattern = (value: string, path: string, context: ValidationContext): void => {
  if (value === "<all_urls>" || value === "https://*/*" || value === "http://*/*") {
    addError(context, path, "invalid_pattern", "Global match patterns are not allowed")
    return
  }

  const match = /^(https?):\/\/([^/]+)(\/.*)$/i.exec(value)
  if (!match) {
    addError(
      context,
      path,
      "invalid_pattern",
      context.allowHttpMatches
        ? "Match pattern must use http:// or https://"
        : "Match pattern must use https://",
    )
    return
  }

  const scheme = match[1].toLowerCase() as "http" | "https"
  if (scheme === "http" && !context.allowHttpMatches) {
    addError(context, path, "invalid_pattern", "Match pattern must use https://")
    return
  }

  const host = match[2]
  if (host === "*" || (host.includes("*") && !/^\*\.[^*]+$/.test(host))) {
    addError(
      context,
      path,
      "invalid_pattern",
      "Top-level or malformed host wildcards are not allowed",
    )
    return
  }
  const concreteHost = host.startsWith("*.") ? host.slice(2) : host
  if (
    !/^(?:\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)(?::\d{1,5})?$/.test(concreteHost)
  ) {
    addError(context, path, "invalid_pattern", "Match pattern contains an invalid host")
    return
  }
  try {
    new URL(`${scheme}://${concreteHost}/`)
  } catch {
    addError(context, path, "invalid_pattern", "Match pattern contains an invalid host")
  }
}

export function validateSitePackManifest(
  input: unknown,
  options: SitePackValidationOptions = {},
): SitePackValidationResult<SitePackManifest> {
  const context = createValidationContext(options)
  validateSerializedSize(input, "$", context)
  const manifest = validateObject(
    input,
    "$",
    context,
    MANIFEST_KEYS,
    [
      "schemaVersion",
      "id",
      "version",
      "minAppVersion",
      "name",
      "matches",
      "capabilities",
      "selectors",
    ],
    "full",
  )
  if (!manifest) return finishValidation(input, context)

  if (manifest.schemaVersion !== undefined) {
    validateFiniteNumber(manifest.schemaVersion, "$.schemaVersion", context, "full", {
      integer: true,
      min: 1,
    })
    if (manifest.schemaVersion !== SITE_PACK_SCHEMA_VERSION) {
      addError(
        context,
        "$.schemaVersion",
        "invalid_value",
        `Unsupported schemaVersion: ${String(manifest.schemaVersion)}`,
      )
    }
  }
  if (manifest.id !== undefined) {
    if (validateString(manifest.id, "$.id", context, "full") && !isValidSitePackId(manifest.id)) {
      addError(context, "$.id", "invalid_pattern", "id must match ^[a-z0-9-]{2,40}$")
    }
  }
  if (manifest.version !== undefined) {
    validateFiniteNumber(manifest.version, "$.version", context, "full", { integer: true, min: 1 })
  }
  if (manifest.minAppVersion !== undefined) {
    validateSemanticVersion(manifest.minAppVersion, "$.minAppVersion", context, "full")
  }
  if (manifest.name !== undefined) {
    validateString(manifest.name, "$.name", context, "full", { maxLength: 200 })
  }
  if (manifest.nameI18n !== undefined) {
    validateI18nRecord(manifest.nameI18n, "$.nameI18n", context)
  }
  if (manifest.description !== undefined) {
    validateString(manifest.description, "$.description", context, "full", {
      allowEmpty: true,
      maxLength: 4000,
    })
  }
  if (manifest.descriptionI18n !== undefined) {
    validateI18nRecord(manifest.descriptionI18n, "$.descriptionI18n", context)
  }
  if (manifest.matches !== undefined) {
    validateStringArray(manifest.matches, "$.matches", context, "full", {
      maxItems: SITE_PACK_MAX_MATCHES,
      maxLength: 500,
      unique: true,
      itemValidator: validateMatchPattern,
    })
  }

  validateConfigFields(manifest, "$", context, "full")
  return finishValidation(input, context)
}

const getAllowedPrivateSelectorKeys = (options: SiteConfigValidationOptions): ReadonlySet<string> =>
  new Set(options.allowedPrivateSelectorKeys ?? [])

const getRequiredPrivateSelectorKeys = (
  options: SiteConfigValidationOptions,
): ReadonlySet<string> => new Set(options.requiredPrivateSelectorKeys ?? [])

const validateBuiltinConfigInto = (
  input: unknown,
  path: string,
  context: ValidationContext,
  mode: ValidationMode,
  options: SiteConfigValidationOptions,
): void => {
  const requiredPrivateSelectorKeys = getRequiredPrivateSelectorKeys(options)
  const requiredConfigKeys =
    mode === "full"
      ? [
          "capabilities",
          "selectors",
          ...(requiredPrivateSelectorKeys.size > 0 ? ["sitePrivateSelectors"] : []),
        ]
      : []
  const config = validateObject(
    input,
    path,
    context,
    [...CONFIG_KEYS, "sitePrivateSelectors"],
    requiredConfigKeys,
    "full",
  )
  if (!config) return
  validateConfigFields(config, path, context, mode)
  if (mode === "full") {
    validateRequiredCapabilities(config, path, context, options.requiredCapabilities ?? [])
  }
  if (config.sitePrivateSelectors !== undefined) {
    validatePrivateSelectors(
      config.sitePrivateSelectors,
      `${path}.sitePrivateSelectors`,
      context,
      mode,
      getAllowedPrivateSelectorKeys(options),
      requiredPrivateSelectorKeys,
    )
  }
}

export function validateBuiltinSiteConfig(
  input: unknown,
  options: SiteConfigValidationOptions = {},
): SitePackValidationResult<BuiltinSiteConfig> {
  const context = createValidationContext(options)
  validateBuiltinConfigInto(input, "$", context, "full", options)
  return finishValidation(input, context)
}

export function validateSiteConfigOverride(
  input: unknown,
  options: SiteConfigValidationOptions = {},
): SitePackValidationResult<SiteConfigOverride> {
  const context = createValidationContext(options)
  validateSerializedSize(input, "$", context)
  validateBuiltinConfigInto(input, "$", context, "partial", options)
  return finishValidation(input, context)
}

export function validateSiteConfigPatch(
  input: unknown,
  options: SiteConfigValidationOptions = {},
): SitePackValidationResult<SiteConfigPatch> {
  const context = createValidationContext(options)
  validateSerializedSize(input, "$", context)
  const patch = validateObject(
    input,
    "$",
    context,
    PATCH_KEYS,
    PATCH_KEYS.filter((key) => key !== "maxAppVersion"),
    "full",
  )
  if (!patch) return finishValidation(input, context)

  if (patch.targetSiteId !== undefined) {
    if (
      validateString(patch.targetSiteId, "$.targetSiteId", context, "full") &&
      !isValidSitePackId(patch.targetSiteId)
    ) {
      addError(
        context,
        "$.targetSiteId",
        "invalid_pattern",
        "targetSiteId must match ^[a-z0-9-]{2,40}$",
      )
    }
  }
  if (patch.patchSchemaVersion !== undefined) {
    validateFiniteNumber(patch.patchSchemaVersion, "$.patchSchemaVersion", context, "full", {
      integer: true,
      min: 1,
    })
    if (patch.patchSchemaVersion !== SITE_CONFIG_PATCH_SCHEMA_VERSION) {
      addError(
        context,
        "$.patchSchemaVersion",
        "invalid_value",
        `Unsupported patchSchemaVersion: ${String(patch.patchSchemaVersion)}`,
      )
    }
  }
  if (patch.patchVersion !== undefined) {
    validateFiniteNumber(patch.patchVersion, "$.patchVersion", context, "full", {
      integer: true,
      min: 1,
    })
  }
  if (patch.baseConfigVersion !== undefined) {
    validateFiniteNumber(patch.baseConfigVersion, "$.baseConfigVersion", context, "full", {
      integer: true,
      min: 1,
    })
  }
  if (patch.minAppVersion !== undefined) {
    validateSemanticVersion(patch.minAppVersion, "$.minAppVersion", context, "full")
  }
  if (patch.maxAppVersion !== undefined) {
    validateSemanticVersion(patch.maxAppVersion, "$.maxAppVersion", context, "full")
  }
  if (
    typeof patch.minAppVersion === "string" &&
    typeof patch.maxAppVersion === "string" &&
    compareSemanticVersions(patch.minAppVersion, patch.maxAppVersion) === 1
  ) {
    addError(
      context,
      "$.maxAppVersion",
      "out_of_range",
      "maxAppVersion must be greater than or equal to minAppVersion",
    )
  }
  if (patch.config !== undefined) {
    validateBuiltinConfigInto(patch.config, "$.config", context, "partial", options)
  }

  return finishValidation(input, context)
}
