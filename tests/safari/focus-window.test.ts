import { afterEach, expect, it, vi } from "vitest"

afterEach(() => vi.unstubAllGlobals())

it("propagates background focus failures to the caller", async () => {
  const sendMessage = vi.fn()
  vi.stubGlobal("chrome", { runtime: { sendMessage } })
  const { platform } = await import("~platform/extension")

  sendMessage.mockResolvedValueOnce({ success: true })
  await expect(platform.focusWindow()).resolves.toBeUndefined()
  expect(sendMessage).toHaveBeenCalledWith({ type: "FOCUS_TAB" })

  sendMessage.mockResolvedValueOnce({ success: false, error: "Focus denied" })
  await expect(platform.focusWindow()).rejects.toThrow("Focus denied")

  sendMessage.mockResolvedValueOnce(undefined)
  await expect(platform.focusWindow()).rejects.toThrow("Window focus request failed")

  sendMessage.mockRejectedValueOnce(new Error("Message channel closed"))
  await expect(platform.focusWindow()).rejects.toThrow("Message channel closed")
})
