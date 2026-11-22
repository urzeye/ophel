import { createServer } from "node:http"
import { expect, it, vi } from "vitest"

import { fetchWebDAV } from "~platform/extension/webdav"

vi.mock("~utils/config", () => ({ APP_NAME: "ophel" }))
vi.mock("~platform", () => ({ platform: { type: "extension", storage: {} } }))

import { WebDAVBackupService } from "~core/webdav-backup"
import { DEFAULT_WEBDAV_CONFIG } from "~core/webdav-sync"
import type { PlatformStorage } from "~platform/types"

it("backs up and manually restores against a real HTTP WebDAV endpoint", async () => {
  const remote = new Map<string, string>()
  const methods: string[] = []
  const server = createServer(async (request, response) => {
    methods.push(request.method!)
    expect(request.headers.authorization).toBe(
      `Basic ${Buffer.from("user:password").toString("base64")}`,
    )
    if (request.method === "MKCOL") {
      response.writeHead(405).end()
      return
    }
    if (request.method === "PUT") {
      let body = ""
      for await (const chunk of request) body += chunk
      remote.set(request.url!, body)
      response.writeHead(201).end()
      return
    }
    if (request.method === "PROPFIND") {
      response
        .writeHead(207, { "Content-Type": "application/xml" })
        .end(
          `<d:multistatus xmlns:d="DAV:">${[...remote.keys()].map((path) => `<d:response><d:href>${path}</d:href><d:propstat><d:prop><d:getlastmodified>${new Date().toUTCString()}</d:getlastmodified></d:prop></d:propstat></d:response>`).join("")}</d:multistatus>`,
        )
      return
    }
    if (request.method === "GET" && remote.has(request.url!)) {
      response.writeHead(200).end(remote.get(request.url!))
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address() as { port: number }
    const config = {
      ...DEFAULT_WEBDAV_CONFIG,
      enabled: true,
      syncMode: "auto" as const,
      syncInterval: 60,
      url: `http://127.0.0.1:${address.port}/`,
      username: "user",
      password: "password",
    }
    const history = JSON.stringify({ state: { history: { chat: { top: 5, ts: 1 } } }, version: 1 })
    const values = new Map<string, unknown>([
      [
        "settings",
        JSON.stringify({ state: { settings: { language: "en", webdav: config } }, version: 0 }),
      ],
      [
        "prompts",
        JSON.stringify({
          state: { prompts: [{ id: "one", content: "saved prompt" }] },
          version: 0,
        }),
      ],
      ["readingHistory", history],
    ])
    const storage: PlatformStorage = {
      get: async <T>(key: string) => values.get(key) as T | undefined,
      set: async (key, value) => {
        values.set(key, value)
      },
      remove: async (key) => {
        values.delete(key)
      },
      watch: () => () => {},
    }
    let now = 1_000_000
    const service = new WebDAVBackupService({
      storage,
      request: fetchWebDAV,
      now: () => now,
      createDeviceId: () => "local-test",
    })
    await service.getNextBackupAt()
    now += 60 * 60_000
    expect((await service.runScheduled())?.success).toBe(true)
    const [path, body] = [...remote.entries()][0]
    expect(JSON.parse(body).data).not.toHaveProperty("readingHistory")
    values.set("prompts", JSON.stringify({ state: { prompts: [] }, version: 0 }))
    expect((await service.runManual("download", config, path.split("/").pop())).success).toBe(true)
    expect(JSON.parse(values.get("prompts") as string).state.prompts[0].content).toBe(
      "saved prompt",
    )
    expect(values.get("readingHistory")).toBe(history)
    expect(methods).toEqual(["MKCOL", "PUT", "PROPFIND", "GET"])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
