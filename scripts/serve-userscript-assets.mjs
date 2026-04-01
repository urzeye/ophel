import http from "node:http"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve("build/userscript")

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0])
  const normalizedPath = path.normalize(requestPath).replace(/^([/\\])+/, "")
  const relativePath = normalizedPath || "ophel.user.js"
  const filePath = path.resolve(root, relativePath)

  if (!filePath.startsWith(root)) {
    res.writeHead(403)
    res.end("Forbidden")
    return
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404)
      res.end("Not Found")
      return
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    })
    res.end(data)
  })
})

server.listen(8123, "127.0.0.1", () => {
  console.log("Serving userscript assets at http://127.0.0.1:8123")
})
