import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { dirname, extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const snapshot = resolve(process.argv[2] ?? resolve(root, "notebooklm.html"))
const port = Number(process.argv[3] ?? 8791)
// SingleFile restricts scripts to inline/data. Relax only the served fixture copy
// so it can load the local verification bundle and locale assets.
const html = (await readFile(snapshot, "utf8")).replace(
  /<meta\b[^>]*http-equiv\s*=\s*(?:"content-security-policy"|'content-security-policy'|content-security-policy)[^>]*>/gi,
  "",
)
const bootstrap = await readFile(resolve(root, "scripts/fixtures/notebook-bootstrap.js"), "utf8")
const built = await build({
  configFile: false,
  root,
  resolve: { alias: [{ find: /^~/, replacement: `${root.replaceAll("\\", "/")}/src/` }] },
  define: {
    __PLATFORM__: JSON.stringify("extension"),
    __OPHEL_APP_VERSION__: JSON.stringify("1.3.1"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  esbuild: { jsx: "automatic" },
  build: {
    write: false,
    minify: false,
    target: "es2022",
    lib: {
      entry: resolve(root, "scripts/fixtures/notebook.tsx"),
      name: "NotebookFixture",
      formats: ["iife"],
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
const output = (Array.isArray(built) ? built[0] : built).output
const bundle = output.find((item) => item.type === "chunk" && item.isEntry)?.code
if (!bundle) throw new Error("Notebook fixture bundle was not emitted")

const contentTypes = {
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
}
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname
  if (path === "/favicon.ico") {
    response.writeHead(204).end()
    return
  }
  if (path === "/bootstrap.js" || path === "/fixture.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" })
    response.end(path === "/bootstrap.js" ? bootstrap : bundle)
    return
  }
  if (path.startsWith("/assets/")) {
    const asset = resolve(root, `.${decodeURIComponent(path)}`)
    if (!asset.startsWith(`${resolve(root, "assets")}${sep}`)) {
      response.writeHead(403).end()
      return
    }
    try {
      const data = await readFile(asset)
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(asset)] ?? "application/octet-stream",
      })
      response.end(data)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      response.writeHead(404).end()
    }
    return
  }
  if (path === "/notebook/offline-fixture") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    const scripts = '<script src="/bootstrap.js"></script><script src="/fixture.js"></script>'
    response.end(
      /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${scripts}</body>`) : html + scripts,
    )
    return
  }
  response.writeHead(404).end()
})
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Notebook offline fixture: http://127.0.0.1:${port}/notebook/offline-fixture\n`,
  )
  process.stdout.write(
    "Run await notebookVerification.run() in the browser console. No online Notebook access is used.\n",
  )
})
