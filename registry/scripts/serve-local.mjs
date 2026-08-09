import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { buildLocalRegistryDist } from "./build-dist-local.mjs"
import { LOCAL_DEV_REGISTRY_SIGNING_KEY_ID } from "./local-dev-signing.mjs"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PORT = 8787
const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_OUTPUT = path.resolve(SCRIPT_DIRECTORY, "../dist")

const mimeTypes = {
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
}

const parseArgs = (args) => {
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    outputDirectory: DEFAULT_OUTPUT,
    skipBuild: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--skip-build") {
      options.skipBuild = true
      continue
    }
    const value = args[index + 1]
    if (!value || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${argument}`)
    }
    if (argument === "--port") options.port = Number(value)
    else if (argument === "--host") options.host = value
    else if (argument === "--output-dir") options.outputDirectory = path.resolve(value)
    else throw new TypeError(`Unknown argument: ${argument}`)
    index += 1
  }
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new TypeError(`Invalid port: ${options.port}`)
  }
  if (options.host !== "127.0.0.1" && options.host !== "localhost") {
    throw new TypeError("Local registry serve only accepts 127.0.0.1 or localhost")
  }
  return options
}

const createServer = (root) =>
  http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0])
    const normalizedPath = path.normalize(requestPath).replace(/^([/\\])+/, "")
    const relativePath = normalizedPath || "index.json"
    const filePath = path.resolve(root, relativePath)

    if (!filePath.startsWith(root)) {
      res.writeHead(403, { "Access-Control-Allow-Origin": "*" })
      res.end("Forbidden")
      return
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { "Access-Control-Allow-Origin": "*" })
        res.end("Not Found")
        return
      }
      res.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      })
      res.end(data)
    })
  })

export async function serveLocalRegistry(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  if (!options.skipBuild) {
    // Use the normal local build revision resolver (git count / env). Do not stamp
    // Date.now()-based revisions: those poison client state and block switching back
    // to production sources even after source-aware reset logic.
    await buildLocalRegistryDist(["--output-dir", options.outputDirectory])
  }

  const root = path.resolve(options.outputDirectory)
  if (!fs.existsSync(path.join(root, "index.json"))) {
    throw new Error(`Missing index.json in ${root}; run without --skip-build first`)
  }

  const server = createServer(root)
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, options.host, () => {
      server.off("error", reject)
      resolve(undefined)
    })
  })

  const indexUrl = `http://${options.host}:${options.port}/index.json`
  console.warn(`[registry] serving local dist at ${indexUrl}`)
  console.warn(
    `[registry] signed with ${LOCAL_DEV_REGISTRY_SIGNING_KEY_ID}; development build → SitePacks → Updates → "Use local registry"`,
  )
  console.warn(
    `[registry] local rebuilds with the same revision are accepted; to leave local mode use Restore defaults`,
  )
  return { server, indexUrl, root }
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMainModule) {
  serveLocalRegistry().catch((error) => {
    console.error("[registry] serve failed:", error)
    process.exitCode = 1
  })
}
