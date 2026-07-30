import { generateKeyPairSync, sign } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  assertRegistrySigningKeyAllowsRevision,
  validateRegistryIndexSignature,
  verifyRegistryIndexSignature,
  type TrustedRegistrySigningKey,
} from "~core/remote-config-signature"

const KEY_ID = "ophel-registry-test"
const INDEX_BYTES = new TextEncoder().encode('{"registryRevision":10}')

const encodeJson = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value))

const exportRawPublicKeyHex = (
  publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"],
): string => {
  const spki = publicKey.export({ format: "der", type: "spki" })
  return spki.subarray(-32).toString("hex")
}

const createFixture = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const signature = sign(null, INDEX_BYTES, privateKey).toString("hex")
  const trustedKey: TrustedRegistrySigningKey = {
    keyId: KEY_ID,
    publicKeyHex: exportRawPublicKeyHex(publicKey),
    minRegistryRevision: 1,
  }
  return {
    signature,
    trustedKey,
    envelope: {
      schemaVersion: 1,
      algorithm: "Ed25519",
      keyId: KEY_ID,
      signature,
    },
  }
}

describe("registry index signature envelope", () => {
  it("accepts the strict Ed25519 envelope", () => {
    const { envelope } = createFixture()

    expect(validateRegistryIndexSignature(envelope)).toEqual(envelope)
  })

  it.each([
    ["unknown key", { extra: true }, "Unknown key"],
    ["schema version", { schemaVersion: 2 }, "schemaVersion"],
    ["algorithm", { algorithm: "ECDSA" }, "algorithm"],
    ["key id", { keyId: "BAD KEY" }, "keyId"],
    ["signature encoding", { signature: "z".repeat(128) }, "signature"],
    ["signature length", { signature: "00" }, "signature"],
  ])("rejects an invalid %s", (_label, override, expectedMessage) => {
    const { envelope } = createFixture()

    expect(() => validateRegistryIndexSignature({ ...envelope, ...override })).toThrow(
      expectedMessage,
    )
  })
})

describe("registry index Ed25519 verification", () => {
  it("accepts the exact signed bytes", async () => {
    const { envelope, trustedKey } = createFixture()

    await expect(
      verifyRegistryIndexSignature(INDEX_BYTES, encodeJson(envelope), [trustedKey]),
    ).resolves.toEqual(trustedKey)
  })

  it("rejects tampered index bytes", async () => {
    const { envelope, trustedKey } = createFixture()
    const tamperedBytes = INDEX_BYTES.slice()
    tamperedBytes[tamperedBytes.length - 1] ^= 1

    await expect(
      verifyRegistryIndexSignature(tamperedBytes, encodeJson(envelope), [trustedKey]),
    ).rejects.toThrow("Invalid Ed25519 signature")
  })

  it("rejects an unknown signing key", async () => {
    const { envelope } = createFixture()

    await expect(
      verifyRegistryIndexSignature(INDEX_BYTES, encodeJson(envelope), []),
    ).rejects.toThrow(`Unknown registry signing key: ${KEY_ID}`)
  })

  it("enforces the trusted key revision window", () => {
    const { trustedKey } = createFixture()
    const boundedKey: TrustedRegistrySigningKey = {
      ...trustedKey,
      minRegistryRevision: 10,
      maxRegistryRevision: 20,
    }

    expect(() => assertRegistrySigningKeyAllowsRevision(boundedKey, 9)).toThrow(
      "is not valid for registry revision 9",
    )
    expect(() => assertRegistrySigningKeyAllowsRevision(boundedKey, 10)).not.toThrow()
    expect(() => assertRegistrySigningKeyAllowsRevision(boundedKey, 20)).not.toThrow()
    expect(() => assertRegistrySigningKeyAllowsRevision(boundedKey, 21)).toThrow(
      "is not valid for registry revision 21",
    )
  })
})
