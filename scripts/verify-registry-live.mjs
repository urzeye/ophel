// 验证 jsDelivr / raw 上 index.json 与 index.sig.json 的签名自洽性
import {
  TRUSTED_REGISTRY_SIGNING_KEYS,
  verifyRegistryIndexSignature,
} from "../src/core/remote-config-signature.ts"

const sources = [
  "https://cdn.jsdelivr.net/gh/urzeye/ophel@registry-dist/index.json",
  "https://raw.githubusercontent.com/urzeye/ophel/registry-dist/index.json",
]

for (const indexUrl of sources) {
  const sigUrl = new URL("./index.sig.json", indexUrl).href
  try {
    const [indexRes, sigRes] = await Promise.all([fetch(indexUrl), fetch(sigUrl)])
    const indexBytes = new Uint8Array(await indexRes.arrayBuffer())
    const sigBytes = new Uint8Array(await sigRes.arrayBuffer())
    const index = JSON.parse(new TextDecoder().decode(indexBytes))
    const sig = JSON.parse(new TextDecoder().decode(sigBytes))
    try {
      const key = await verifyRegistryIndexSignature(
        indexBytes,
        sigBytes,
        TRUSTED_REGISTRY_SIGNING_KEYS,
      )
      console.log(
        `[OK]   ${indexUrl}\n       revision=${index.registryRevision} generatedAt=${index.generatedAt} key=${key.keyId}`,
      )
    } catch (error) {
      console.log(
        `[FAIL] ${indexUrl}\n       revision=${index.registryRevision} generatedAt=${index.generatedAt} sigKey=${sig.keyId}\n       ${error.message}`,
      )
    }
  } catch (error) {
    console.log(`[ERROR] ${indexUrl}: ${error.message}`)
  }
}
