import MarkdownIt from "markdown-it"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ toast: vi.fn(), proxyFetch: vi.fn() }))
vi.mock("~platform", () => ({ platform: { fetch: state.proxyFetch } }))
vi.mock("~utils/toast", () => ({ showToast: state.toast }))
vi.mock("~utils/i18n", () => ({
  getCurrentLang: () => "en",
  getCurrentLocale: () => "en-US",
  t: (key: string, values?: { count?: string }) => (values?.count ? `${key}:${values.count}` : key),
}))
vi.mock("~utils/markdown", () => ({ createMarkdownIt: () => new MarkdownIt() }))

let downloadedBlob: Blob | undefined
beforeEach(() => {
  vi.clearAllMocks()
  downloadedBlob = undefined
  vi.stubGlobal("document", {
    querySelectorAll: () => [],
    createElement: () => ({ click: vi.fn() }),
  })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })))
  state.proxyFetch.mockRejectedValue(new Error("Permission denied"))
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    downloadedBlob = blob as Blob
    return "blob:download"
  })
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const metadata = {
  title: "中文对话",
  url: "https://example.com/chat",
  exportTime: "2026-11-09",
  source: "Example",
}
const messages = [
  { role: "user", content: "问题" },
  { role: "assistant", content: "回答\n\n```js\nconst answer = 42\n```" },
]

// 读取标准 ZIP local headers，核对真实输出而不是只检查返回值。
async function readZip(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const files = new Map<string, string>()
  let offset = 0
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const contentStart = nameStart + nameLength + extraLength
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength))
    files.set(name, new TextDecoder().decode(bytes.subarray(contentStart, contentStart + size)))
    offset = contentStart + size
  }
  return files
}

it("exports text and readable assets while reporting failed credentialed attachments", async () => {
  const { downloadExportPackage } = await import("~utils/exporter")
  const result = await downloadExportPackage({
    markdownFilename: "conversation.md",
    markdownContent: "# 中文对话\n\n完整回答",
    packageFilename: "conversation.zip",
    metadata,
    assets: [
      { name: "readable.txt", content: "附件正文" },
      { name: "private.png", sourceUrl: "https://example.com/private.png" },
    ],
  })
  expect(result).toBe(true)
  const files = await readZip(downloadedBlob!)
  expect(files.get("conversation.md")).toContain("完整回答")
  const manifest = JSON.parse(files.get("manifest.json")!)
  expect(manifest.assets[0].included).toBe(true)
  expect(files.get(manifest.assets[0].path)).toBe("附件正文")
  expect(manifest.assets[1]).toMatchObject({
    included: false,
    sourceUrl: "https://example.com/private.png",
  })
  expect(manifest.assets[1].error).toContain("Permission denied")
  expect(state.toast).toHaveBeenCalledWith("exportPartialSuccess:1", 5000)
  expect(state.toast).not.toHaveBeenCalledWith("exportSuccess", expect.anything())
})

it("keeps the ordinary success result for complete packages", async () => {
  const { downloadExportPackage } = await import("~utils/exporter")
  expect(
    await downloadExportPackage({
      markdownFilename: "chat.md",
      markdownContent: "回答",
      packageFilename: "chat.zip",
      metadata,
      assets: [],
    }),
  ).toBe(true)
  expect(state.toast).toHaveBeenCalledWith("exportSuccess", 2000)
})

it("preserves Unicode text and code in the four existing export formats", async () => {
  const { formatToMarkdown, formatToTXT, formatToJSON, formatToHTML } = await import(
    "~utils/exporter"
  )
  for (const format of [formatToMarkdown, formatToTXT, formatToJSON, formatToHTML]) {
    const content = format(metadata, messages)
    expect(content).toContain("中文对话")
    expect(content).toContain("问题")
    expect(content).toContain("回答")
    expect(content).toContain("42")
  }
  expect(JSON.parse(formatToJSON(metadata, messages)).messages).toEqual(messages)
})
