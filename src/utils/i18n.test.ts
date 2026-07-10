import { afterEach, describe, expect, it, vi } from "vitest"

import { getAllLocalizedTexts, setLanguage, subscribeI18nChanges, t } from "./i18n"

describe("i18n", () => {
  afterEach(async () => {
    await setLanguage("en")
  })

  it("loads a selected locale on demand and notifies subscribers", async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeI18nChanges(listener)

    await setLanguage("zh-CN")

    expect(t("untitledConversation")).toBe("未命名会话")
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it("keeps the small cross-locale title compatibility list", () => {
    expect(getAllLocalizedTexts("untitledConversation")).toContain("Untitled conversation")
    expect(getAllLocalizedTexts("untitledConversation")).toContain("未命名會話")
  })
})
