import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  LOCAL_DEV_REGISTRY_PRIVATE_KEY_BASE64,
  LOCAL_DEV_REGISTRY_PUBLIC_KEY_HEX,
  LOCAL_DEV_REGISTRY_SIGNING_KEY_ID,
} from "./local-dev-signing.mjs"
import { buildRegistryDist, parseRegistryBuildArguments } from "./build-dist.mjs"

export async function buildLocalRegistryDist(args = process.argv.slice(2)) {
  const options = parseRegistryBuildArguments(args)
  if (options.signingKeyId) {
    throw new TypeError("--signing-key-id is only supported by registry:build:signed")
  }
  return buildRegistryDist({
    ...options,
    signingKey: {
      keyId: LOCAL_DEV_REGISTRY_SIGNING_KEY_ID,
      privateKey: LOCAL_DEV_REGISTRY_PRIVATE_KEY_BASE64,
      expectedPublicKeyHex: LOCAL_DEV_REGISTRY_PUBLIC_KEY_HEX,
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
        `[registry] built local revision ${index.registryRevision} with fixed local-dev key ${LOCAL_DEV_REGISTRY_SIGNING_KEY_ID}; output is not publishable`,
      )
    })
    .catch((error) => {
      console.error("[registry] local build failed:", error)
      process.exitCode = 1
    })
}
