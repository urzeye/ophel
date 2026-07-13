import { afterEach, describe, expect, it, vi } from "vitest"

import { resources } from "~locales/resources"
import {
  sendToBackground,
  type GetLocaleMessagesMessage,
  type GetLocaleMessagesResponse,
} from "~utils/messaging"

vi.mock("~utils/messaging", () => ({
  MSG_GET_LOCALE_MESSAGES: "GET_LOCALE_MESSAGES",
  sendToBackground: vi.fn(async ({ locale }: { locale: keyof typeof resources }) => ({
    success: true,
    messages: resources[locale],
  })),
}))

import {
  getAllLocalizedTexts,
  getCurrentLang,
  I18N_LANGUAGE_CHANGE_EVENT,
  setLanguage,
  subscribeI18nChanges,
  t,
} from "./i18n"

const sendLocaleMessage = vi.mocked(
  sendToBackground as (message: GetLocaleMessagesMessage) => Promise<GetLocaleMessagesResponse>,
)

describe("i18n", () => {
  afterEach(async () => {
    sendLocaleMessage.mockImplementation(
      async ({ locale }: { locale: keyof typeof resources }) => ({
        success: true,
        messages: resources[locale],
      }),
    )
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

  it("broadcasts the selected language through the shared window runtime", async () => {
    const runtimeListener = vi.fn()
    window.addEventListener(I18N_LANGUAGE_CHANGE_EVENT, runtimeListener)

    await setLanguage("zh-TW")

    expect(window.__ophelLanguageRuntime).toBe("zh-TW")
    expect(runtimeListener).toHaveBeenCalledOnce()
    window.removeEventListener(I18N_LANGUAGE_CHANGE_EVENT, runtimeListener)
  })

  it("loads language changes broadcast by another content-script bundle", async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeI18nChanges(listener)

    window.__ophelLanguageRuntime = "ja"
    window.__ophelLanguageRuntimeVersion = (window.__ophelLanguageRuntimeVersion ?? 0) + 1
    window.dispatchEvent(new Event(I18N_LANGUAGE_CHANGE_EVENT))

    await vi.waitFor(() => {
      expect(getCurrentLang()).toBe("ja")
      expect(t("untitledConversation")).toBe("無題の会話")
    })
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it("ignores language events that do not update the isolated-world runtime", async () => {
    await setLanguage("en")

    window.dispatchEvent(
      new CustomEvent(I18N_LANGUAGE_CHANGE_EVENT, {
        detail: { language: "zh-CN" },
      }),
    )

    expect(getCurrentLang()).toBe("en")
  })

  it("keeps the latest language when an earlier locale request finishes later", async () => {
    let resolveKorean: ((value: { success: true; messages: typeof resources.ko }) => void) | null =
      null
    sendLocaleMessage.mockImplementation(({ locale }: { locale: keyof typeof resources }) => {
      if (locale === "ko") {
        return new Promise((resolve) => {
          resolveKorean = resolve
        })
      }

      return Promise.resolve({ success: true, messages: resources[locale] })
    })

    const koreanRequest = setLanguage("ko")
    await setLanguage("it")
    resolveKorean?.({ success: true, messages: resources.ko })
    await koreanRequest

    expect(getCurrentLang()).toBe("it")
    expect(t("untitledConversation")).toBe("Conversazione senza titolo")
  })

  it("reports locale load failures and uses the English fallback", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    sendLocaleMessage.mockResolvedValueOnce({
      success: false,
      error: "locale unavailable",
    })

    await expect(setLanguage("ru")).resolves.toBeUndefined()

    expect(getCurrentLang()).toBe("en")
    expect(t("untitledConversation")).toBe("Untitled conversation")
    expect(consoleError).toHaveBeenCalledWith(
      '[Ophel] Failed to load locale "ru"; using English instead.',
      expect.any(Error),
    )
  })

  it("keeps the small cross-locale title compatibility list", () => {
    expect(getAllLocalizedTexts("untitledConversation")).toContain("Untitled conversation")
    expect(getAllLocalizedTexts("untitledConversation")).toContain("未命名會話")
  })
})
