import { afterEach, describe, expect, it, vi } from "vitest"

import { DeepSeekAdapter } from "~adapters/deepseek"

// base.ts 在模块顶层实例化 DOMToolkit（依赖 document）；node 环境下打桩
vi.mock("~utils/dom-toolkit", () => ({
  DOMToolkit: {
    query: vi.fn(),
  },
}))

type AdapterInternals = {
  resolveSignedImageUrl: (signedPath: string) => string
  extractShareUserAttachments: (
    fragment: Record<string, unknown>,
  ) => { kind: string; name: string; source: string }[]
}

const resolve = (adapter: DeepSeekAdapter, signedPath: string) =>
  (adapter as unknown as AdapterInternals).resolveSignedImageUrl(signedPath)

const SIGNED_PATH = "/file?file_id=abc-123&state=a%2Bb%2Fc%3D"

describe("DeepSeekAdapter.resolveSignedImageUrl", () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    globalThis.window = originalWindow
  })

  const stubWindow = () => {
    globalThis.window = {
      location: {
        origin: "https://chat.deepseek.com",
        href: "https://chat.deepseek.com/a/chat/s/session-1",
      },
    } as unknown as Window & typeof globalThis
  }

  it("rewrites relative signed_path to the real file host with ty=p for images", () => {
    stubWindow()
    const adapter = new DeepSeekAdapter()

    const result = new URL(resolve(adapter, SIGNED_PATH))

    expect(result.origin).toBe("https://files.deepseeksvc.com")
    expect(result.pathname).toBe("/api/file")
    expect(result.searchParams.get("file_id")).toBe("abc-123")
    // state 含特殊字符，解码-重编码后语义必须不变
    expect(result.searchParams.get("state")).toBe("a+b/c=")
    expect(result.searchParams.get("ty")).toBe("p")
  })

  it("accepts absolute signed_path on the chat host", () => {
    stubWindow()
    const adapter = new DeepSeekAdapter()

    const result = new URL(resolve(adapter, `https://chat.deepseek.com${SIGNED_PATH}`))
    expect(result.origin).toBe("https://files.deepseeksvc.com")
  })

  it("falls back to plain resolution for unknown shapes", () => {
    stubWindow()
    const adapter = new DeepSeekAdapter()

    expect(resolve(adapter, "/other/path?x=1")).toBe("https://chat.deepseek.com/other/path?x=1")
    expect(resolve(adapter, "/file?file_id=abc-123")).toBe(
      "https://chat.deepseek.com/file?file_id=abc-123",
    )
  })
})

describe("DeepSeekAdapter.extractShareUserAttachments", () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    globalThis.window = originalWindow
  })

  const extract = (adapter: DeepSeekAdapter, isImage: boolean) =>
    (adapter as unknown as AdapterInternals).extractShareUserAttachments({
      type: "FILE",
      files: [
        {
          file_name: isImage ? "image.png" : "prompt.json",
          file_size: 1024,
          is_image: isImage,
          signed_path: SIGNED_PATH,
        },
      ],
    })

  it("gives image attachments a downloadable files.deepseeksvc.com url", () => {
    globalThis.window = {
      location: {
        origin: "https://chat.deepseek.com",
        href: "https://chat.deepseek.com/a/chat/s/session-1",
      },
    } as unknown as Window & typeof globalThis
    const adapter = new DeepSeekAdapter()

    const [attachment] = extract(adapter, true)
    expect(attachment.kind).toBe("image")
    expect(attachment.source).toContain("https://files.deepseeksvc.com/api/file?")
    expect(attachment.source).toContain("ty=p")
  })

  it("leaves non-image attachments without a download url (label only)", () => {
    const adapter = new DeepSeekAdapter()

    const [attachment] = extract(adapter, false)
    expect(attachment.kind).toBe("file")
    expect(attachment.source).toBe("")
  })
})
