/**
 * Fixed local-development registry signing material.
 *
 * Production builds never trust this key. The matching private key lives only in
 * registry/scripts/local-dev-signing.mjs for `pnpm registry:build` / `pnpm registry:serve`.
 */
import type { TrustedRegistrySigningKey } from "./remote-config-signature"

export const LOCAL_DEV_REGISTRY_SIGNING_KEY_ID = "ophel-registry-local-dev" as const

/** Raw Ed25519 public key hex for the fixed local-dev signing key. */
export const LOCAL_DEV_REGISTRY_PUBLIC_KEY_HEX =
  "27d673708114a4141392fec912d1c6d4dc54b49143c9f908b71e0f5d6205362a"

export const LOCAL_DEV_REGISTRY_TRUSTED_KEY: TrustedRegistrySigningKey = {
  keyId: LOCAL_DEV_REGISTRY_SIGNING_KEY_ID,
  publicKeyHex: LOCAL_DEV_REGISTRY_PUBLIC_KEY_HEX,
  minRegistryRevision: 1,
}

export const LOCAL_DEV_REGISTRY_DEFAULT_PORT = 8787
export const LOCAL_DEV_REGISTRY_DEFAULT_HOST = "127.0.0.1"

export const getLocalDevRegistryIndexUrl = (
  host = LOCAL_DEV_REGISTRY_DEFAULT_HOST,
  port = LOCAL_DEV_REGISTRY_DEFAULT_PORT,
): string => `http://${host}:${port}/index.json`

export const getLocalDevRegistryOriginPatterns = (
  host = LOCAL_DEV_REGISTRY_DEFAULT_HOST,
  port = LOCAL_DEV_REGISTRY_DEFAULT_PORT,
): string[] => {
  const normalizedPort = Number.isFinite(port) && port > 0 ? port : LOCAL_DEV_REGISTRY_DEFAULT_PORT
  return [`http://${host}:${normalizedPort}/*`]
}

/** True for loopback registry sources used only in local development. */
export const isLoopbackRegistrySourceUrl = (sourceUrl: string): boolean => {
  try {
    const url = new URL(sourceUrl)
    return (
      url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    )
  } catch {
    return false
  }
}

/**
 * Allow non-monotonic registryRevision when crossing the local/production boundary.
 * Production dual sources (CDN ↔ GitHub raw) stay strictly monotonic.
 */
export const shouldAllowRegistryRevisionReset = (
  previousSourceUrl: string | undefined,
  nextSourceUrl: string,
): boolean => {
  if (!previousSourceUrl) return false
  if (previousSourceUrl === nextSourceUrl) return false
  return (
    isLoopbackRegistrySourceUrl(previousSourceUrl) || isLoopbackRegistrySourceUrl(nextSourceUrl)
  )
}

/**
 * Relax revision/immutability guards for local development:
 * - always when the source being checked is loopback (rebuilds reuse git revisions)
 * - or when crossing local ↔ production sources
 *
 * Production dual-source failover stays strict.
 */
export const shouldRelaxRegistryRevisionGuards = (
  previousSourceUrl: string | undefined,
  nextSourceUrl: string,
): boolean => {
  if (isLoopbackRegistrySourceUrl(nextSourceUrl)) return true
  return shouldAllowRegistryRevisionReset(previousSourceUrl, nextSourceUrl)
}
