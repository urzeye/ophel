import { verifyAsync } from "@noble/ed25519"

export const REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION = 1 as const
export const REGISTRY_INDEX_SIGNATURE_ALGORITHM = "Ed25519" as const
export const REGISTRY_INDEX_SIGNATURE_FILE_NAME = "index.sig.json"

export interface RegistryIndexSignature {
  schemaVersion: typeof REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION
  algorithm: typeof REGISTRY_INDEX_SIGNATURE_ALGORITHM
  keyId: string
  signature: string
}

export interface TrustedRegistrySigningKey {
  keyId: string
  publicKeyHex: string
  minRegistryRevision: number
  maxRegistryRevision?: number
}

export const TRUSTED_REGISTRY_SIGNING_KEYS: readonly TrustedRegistrySigningKey[] = [
  {
    keyId: "ophel-registry-2026-07",
    publicKeyHex: "0cd6f101298bc5ef27b950225fb209e348d61b7b66c8631593536675a4ec6505",
    minRegistryRevision: 1,
  },
]

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/
const PUBLIC_KEY_PATTERN = /^[a-f0-9]{64}$/
const SIGNATURE_PATTERN = /^[a-f0-9]{128}$/

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const hexToBytes = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16)
  }
  return bytes
}

const decodeSignatureJson = (bytes: Uint8Array): unknown => {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch (error) {
    throw new SyntaxError(
      `Invalid UTF-8 in registry index signature: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new SyntaxError(
      `Invalid registry index signature JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const assertTrustedKeyShape = (key: TrustedRegistrySigningKey): void => {
  if (!KEY_ID_PATTERN.test(key.keyId)) {
    throw new TypeError(`Invalid trusted registry signing key ID: ${key.keyId}`)
  }
  if (!PUBLIC_KEY_PATTERN.test(key.publicKeyHex)) {
    throw new TypeError(`Invalid public key for registry signing key: ${key.keyId}`)
  }
  if (!Number.isSafeInteger(key.minRegistryRevision) || key.minRegistryRevision < 1) {
    throw new TypeError(`Invalid minimum revision for registry signing key: ${key.keyId}`)
  }
  if (
    key.maxRegistryRevision !== undefined &&
    (!Number.isSafeInteger(key.maxRegistryRevision) ||
      key.maxRegistryRevision < key.minRegistryRevision)
  ) {
    throw new TypeError(`Invalid maximum revision for registry signing key: ${key.keyId}`)
  }
}

export const validateRegistryIndexSignature = (input: unknown): RegistryIndexSignature => {
  if (!isPlainRecord(input)) {
    throw new TypeError("Registry index signature must be an object")
  }
  const allowedKeys = new Set(["schemaVersion", "algorithm", "keyId", "signature"])
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`Unknown key in registry index signature: ${key}`)
    }
  }
  if (input.schemaVersion !== REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION) {
    throw new TypeError(
      `Registry index signature schemaVersion must be ${REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION}`,
    )
  }
  if (input.algorithm !== REGISTRY_INDEX_SIGNATURE_ALGORITHM) {
    throw new TypeError(
      `Registry index signature algorithm must be ${REGISTRY_INDEX_SIGNATURE_ALGORITHM}`,
    )
  }
  if (typeof input.keyId !== "string" || !KEY_ID_PATTERN.test(input.keyId)) {
    throw new TypeError("Registry index signature keyId is invalid")
  }
  if (typeof input.signature !== "string" || !SIGNATURE_PATTERN.test(input.signature)) {
    throw new TypeError("Registry index signature must be 128 lowercase hexadecimal characters")
  }
  return {
    schemaVersion: REGISTRY_INDEX_SIGNATURE_SCHEMA_VERSION,
    algorithm: REGISTRY_INDEX_SIGNATURE_ALGORITHM,
    keyId: input.keyId,
    signature: input.signature,
  }
}

export const verifyRegistryIndexSignature = async (
  indexBytes: Uint8Array,
  signatureBytes: Uint8Array,
  trustedKeys: readonly TrustedRegistrySigningKey[] = TRUSTED_REGISTRY_SIGNING_KEYS,
): Promise<TrustedRegistrySigningKey> => {
  const envelope = validateRegistryIndexSignature(decodeSignatureJson(signatureBytes))
  const trustedKey = trustedKeys.find((key) => key.keyId === envelope.keyId)
  if (!trustedKey) {
    throw new Error(`Unknown registry signing key: ${envelope.keyId}`)
  }
  assertTrustedKeyShape(trustedKey)

  let valid: boolean
  try {
    valid = await verifyAsync(
      hexToBytes(envelope.signature),
      indexBytes,
      hexToBytes(trustedKey.publicKeyHex),
      { zip215: false },
    )
  } catch (error) {
    throw new Error(
      `Registry Ed25519 verification failed for key ${trustedKey.keyId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  if (!valid) {
    throw new Error(`Invalid Ed25519 signature for registry index: ${trustedKey.keyId}`)
  }
  return trustedKey
}

export const assertRegistrySigningKeyAllowsRevision = (
  key: TrustedRegistrySigningKey,
  registryRevision: number,
): void => {
  assertTrustedKeyShape(key)
  if (
    !Number.isSafeInteger(registryRevision) ||
    registryRevision < key.minRegistryRevision ||
    (key.maxRegistryRevision !== undefined && registryRevision > key.maxRegistryRevision)
  ) {
    throw new Error(
      `Registry signing key ${key.keyId} is not valid for registry revision ${registryRevision}`,
    )
  }
}
