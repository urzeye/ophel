import { generateKeyPairSync } from "node:crypto"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  buildRegistryDist,
  exportRawEd25519PublicKeyHex,
  parseRegistryBuildArguments,
} from "./build-dist.mjs"

const LOCAL_SIGNING_KEY_ID = "ophel-registry-local"

export async function buildLocalRegistryDist(args = process.argv.slice(2)) {
  const options = parseRegistryBuildArguments(args)
  if (options.signingKeyId) {
    throw new TypeError("--signing-key-id is only supported by registry:build:signed")
  }
  const { privateKey } = generateKeyPairSync("ed25519")
  return buildRegistryDist({
    ...options,
    signingKey: {
      keyId: LOCAL_SIGNING_KEY_ID,
      privateKey,
      expectedPublicKeyHex: exportRawEd25519PublicKeyHex(privateKey),
    },
  })
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  buildLocalRegistryDist()
    .then((index) => {
      console.warn(
        `[registry] built local revision ${index.registryRevision} with an ephemeral signing key; output is not publishable`,
      )
    })
    .catch((error) => {
      console.error("[registry] local build failed:", error)
      process.exitCode = 1
    })
}
