import { isValidSitePackId } from "~adapters/declarative/types"

export { SITE_PACK_ORIGIN_BINDINGS_STORAGE_KEY } from "./site-pack-storage-constants"
export const SITE_PACK_ORIGIN_BINDINGS_STORAGE_SCHEMA_VERSION = 1 as const

const EXACT_HTTPS_ORIGIN_INPUT_PATTERN = /^https:\/\/[^/?#\\]+\/?$/i

export interface ExplicitSitePackOriginBinding {
  mode: "explicit"
  packId: string
}

export interface DetectSitePackOriginBinding {
  mode: "detect"
}

export type SitePackOriginBinding = ExplicitSitePackOriginBinding | DetectSitePackOriginBinding

export interface SitePackOriginBindingsState {
  storageSchemaVersion: typeof SITE_PACK_ORIGIN_BINDINGS_STORAGE_SCHEMA_VERSION
  bindings: Record<string, SitePackOriginBinding>
}

export type SitePackOriginBindingsErrorCode =
  | "invalid-origin"
  | "storage-invalid"
  | "storage-schema-unsupported"
  | "binding-invalid"

export class SitePackOriginBindingsError extends Error {
  readonly code: SitePackOriginBindingsErrorCode

  constructor(code: SitePackOriginBindingsErrorCode, message: string) {
    super(message)
    this.name = "SitePackOriginBindingsError"
    this.code = code
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const assertKnownKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  code: SitePackOriginBindingsErrorCode,
): void => {
  const allowed = new Set(allowedKeys)
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknownKeys.length > 0) {
    throw new SitePackOriginBindingsError(
      code,
      `${path} contains unknown keys: ${unknownKeys.join(", ")}`,
    )
  }
}

export const canonicalizeSitePackBindingOrigin = (value: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /\s/.test(value) ||
    !EXACT_HTTPS_ORIGIN_INPUT_PATTERN.test(value)
  ) {
    throw new SitePackOriginBindingsError(
      "invalid-origin",
      "SitePack binding origin must contain only an HTTPS scheme and exact authority",
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SitePackOriginBindingsError(
      "invalid-origin",
      `SitePack binding origin is not a valid URL: ${value}`,
    )
  }

  if (url.protocol !== "https:") {
    throw new SitePackOriginBindingsError(
      "invalid-origin",
      `SitePack binding origin must use HTTPS: ${value}`,
    )
  }
  if (url.username || url.password) {
    throw new SitePackOriginBindingsError(
      "invalid-origin",
      `SitePack binding origin must not contain credentials: ${value}`,
    )
  }
  if (url.hostname.includes("*")) {
    throw new SitePackOriginBindingsError(
      "invalid-origin",
      `SitePack binding origin must not contain a wildcard: ${value}`,
    )
  }
  if (url.pathname !== "/" || value.includes("?") || value.includes("#")) {
    throw new SitePackOriginBindingsError(
      "invalid-origin",
      `SitePack binding origin must not contain a path, query, or hash: ${value}`,
    )
  }

  return url.origin
}

export const cloneSitePackOriginBinding = (
  binding: SitePackOriginBinding,
): SitePackOriginBinding =>
  binding.mode === "explicit" ? { mode: "explicit", packId: binding.packId } : { mode: "detect" }

export const parseSitePackOriginBinding = (
  value: unknown,
  path = "SitePack origin binding",
): SitePackOriginBinding => {
  if (!isPlainRecord(value)) {
    throw new SitePackOriginBindingsError("binding-invalid", `${path} must be an object`)
  }

  if (value.mode === "explicit") {
    assertKnownKeys(value, ["mode", "packId"], path, "binding-invalid")
    if (!isValidSitePackId(value.packId)) {
      throw new SitePackOriginBindingsError(
        "binding-invalid",
        `${path}.packId must match ^[a-z0-9-]{2,40}$`,
      )
    }
    return { mode: "explicit", packId: value.packId }
  }

  if (value.mode === "detect") {
    assertKnownKeys(value, ["mode"], path, "binding-invalid")
    return { mode: "detect" }
  }

  throw new SitePackOriginBindingsError(
    "binding-invalid",
    `${path}.mode must be explicit or detect`,
  )
}

const cloneBindings = (
  bindings: Readonly<Record<string, SitePackOriginBinding>>,
): Record<string, SitePackOriginBinding> =>
  Object.fromEntries(
    Object.entries(bindings)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([origin, binding]) => [origin, cloneSitePackOriginBinding(binding)]),
  )

export const createEmptySitePackOriginBindingsState = (): SitePackOriginBindingsState => ({
  storageSchemaVersion: SITE_PACK_ORIGIN_BINDINGS_STORAGE_SCHEMA_VERSION,
  bindings: {},
})

export const createSitePackOriginBindingsState = (
  bindings: Readonly<Record<string, unknown>>,
): SitePackOriginBindingsState => {
  const parsedBindings: Record<string, SitePackOriginBinding> = {}
  for (const [origin, binding] of Object.entries(bindings)) {
    const canonicalOrigin = canonicalizeSitePackBindingOrigin(origin)
    if (origin !== canonicalOrigin) {
      throw new SitePackOriginBindingsError(
        "invalid-origin",
        `SitePack binding origin key must be canonical: ${origin} (expected ${canonicalOrigin})`,
      )
    }
    parsedBindings[origin] = parseSitePackOriginBinding(binding, `bindings[${origin}]`)
  }

  return {
    storageSchemaVersion: SITE_PACK_ORIGIN_BINDINGS_STORAGE_SCHEMA_VERSION,
    bindings: cloneBindings(parsedBindings),
  }
}

export const parseSitePackOriginBindingsState = (value: unknown): SitePackOriginBindingsState => {
  if (value === undefined) return createEmptySitePackOriginBindingsState()
  if (!isPlainRecord(value)) {
    throw new SitePackOriginBindingsError(
      "storage-invalid",
      "SitePack origin bindings state must be an object",
    )
  }

  assertKnownKeys(
    value,
    ["storageSchemaVersion", "bindings"],
    "SitePack origin bindings state",
    "storage-invalid",
  )
  if (value.storageSchemaVersion !== SITE_PACK_ORIGIN_BINDINGS_STORAGE_SCHEMA_VERSION) {
    throw new SitePackOriginBindingsError(
      "storage-schema-unsupported",
      `Unsupported SitePack origin bindings schema: ${String(value.storageSchemaVersion)}`,
    )
  }
  if (!isPlainRecord(value.bindings)) {
    throw new SitePackOriginBindingsError(
      "storage-invalid",
      "SitePack origin bindings map must be an object",
    )
  }

  return createSitePackOriginBindingsState(value.bindings)
}

export const sameSitePackOriginBinding = (
  left: SitePackOriginBinding,
  right: SitePackOriginBinding,
): boolean =>
  left.mode === right.mode &&
  (left.mode === "detect" || (right.mode === "explicit" && left.packId === right.packId))
