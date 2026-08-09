/**
 * Fixed Ed25519 keypair for local registry builds/serve only.
 * Must stay in sync with src/core/remote-config-local-dev.ts.
 */
export const LOCAL_DEV_REGISTRY_SIGNING_KEY_ID = "ophel-registry-local-dev"
export const LOCAL_DEV_REGISTRY_PUBLIC_KEY_HEX =
  "27d673708114a4141392fec912d1c6d4dc54b49143c9f908b71e0f5d6205362a"
/** PKCS#8 base64 private key. Never use for production publishing. */
export const LOCAL_DEV_REGISTRY_PRIVATE_KEY_BASE64 =
  "MC4CAQAwBQYDK2VwBCIEIKG95Wx66k7RtSpDcjDigGXndVqsTiV/bOPSDW2KhBgN"
