import { afterEach, expect, it, vi } from "vitest"

vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
afterEach(() => vi.unstubAllGlobals())

it("preserves actual userscript capabilities, GM notification and storage behavior", async () => {
  const notification = vi.fn()
  const values = new Map<string, unknown>()
  vi.stubGlobal("GM_notification", notification)
  vi.stubGlobal(
    "GM_getValue",
    (key: string, defaultValue: unknown) => values.get(key) ?? defaultValue,
  )
  vi.stubGlobal("GM_setValue", (key: string, value: unknown) => values.set(key, value))
  const { platform } = await import("~platform/userscript")

  for (const capability of [
    "cookies",
    "permissions",
    "tabs",
    "commands",
    "declarativeNetRequest",
  ] as const) {
    expect(platform.hasCapability(capability)).toBe(false)
  }
  expect(platform.hasCapability("watermarkRemoval")).toBe(true)
  expect(platform.hasCapability("notifications")).toBe(true)
  platform.notify({ title: "Done", message: "Ready" })
  expect(notification).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Done", text: "Ready" }),
  )
  await platform.storage.set("test", { enabled: true })
  expect(await platform.storage.get("test")).toEqual({ enabled: true })
})
