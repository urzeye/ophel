import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  supportsSystem: false,
  supportsWindowFocus: true,
  notify: vi.fn(),
  focus: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("~utils/toast", () => ({ showToast: state.toast }))
vi.mock("~platform", () => ({
  platform: {
    hasCapability: (cap: string) =>
      cap === "windowFocus" ? state.supportsWindowFocus : state.supportsSystem,
    notify: state.notify,
    focusWindow: state.focus,
    getNotificationSoundUrl: () => "sound.mp3",
  },
}))
vi.mock("~utils/i18n", () => ({ t: (key: string) => key }))
vi.mock("~constants", () => ({ NOTIFICATION_SOUND_PRESETS: [{ id: "default" }] }))

class AudioMock {
  static instances: AudioMock[] = []
  src = ""
  volume = 1
  currentTime = 0
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor() {
    AudioMock.instances.push(this)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.focus.mockResolvedValue(undefined)
  state.supportsSystem = false
  state.supportsWindowFocus = true
  vi.useFakeTimers()
  AudioMock.instances = []
  vi.stubGlobal("Audio", AudioMock)
  vi.stubGlobal("window", { addEventListener: vi.fn(), clearTimeout, setTimeout })
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    hidden: true,
    hasFocus: () => false,
    visibilityState: "hidden",
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each([false, true])(
  "keeps repeated audio and focus when system notifications are %s",
  async (supportsSystem) => {
    state.supportsSystem = supportsSystem
    const { TabManager } = await import("~core/tab-manager")
    const manager = new TabManager(
      { getName: () => "Gemini" } as SiteAdapter,
      {
        showNotification: true,
        notificationSound: true,
        autoFocus: true,
        notificationRepeatCount: 2,
        notificationRepeatInterval: 1,
      } as Settings["tab"],
    )
    // 完成检测触发的同一个回调，验证通知能力限制不会连带关闭声音和窗口聚焦。
    const completion = manager as unknown as { sendCompletionNotification(): void }
    completion.sendCompletionNotification()
    expect(state.notify).toHaveBeenCalledTimes(supportsSystem ? 1 : 0)
    expect(state.focus).toHaveBeenCalledOnce()
    const audio = AudioMock.instances[0]
    expect(audio.play).toHaveBeenCalledOnce()
    audio.onended!()
    vi.advanceTimersByTime(1000)
    expect(audio.play).toHaveBeenCalledTimes(2)
  },
)

it("reports a rejected focus request in the page without interrupting completion reminders", async () => {
  const error = new Error("Browser did not focus window 1")
  state.focus.mockRejectedValueOnce(error)
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  const { TabManager } = await import("~core/tab-manager")
  const manager = new TabManager(
    { getName: () => "Gemini" } as SiteAdapter,
    {
      autoFocus: true,
      showNotification: true,
      notificationSound: true,
    } as Settings["tab"],
  )
  ;(manager as unknown as { sendCompletionNotification(): void }).sendCompletionNotification()
  await Promise.resolve()
  expect(log).toHaveBeenCalledWith(expect.stringContaining("Failed to focus"), error)
  expect(state.toast).toHaveBeenCalledWith("autoFocusFailed", 5000)
  expect(AudioMock.instances[0].play).toHaveBeenCalledOnce()
  log.mockRestore()
})

it("keeps Safari sound reminders without attempting unsupported focus from stored settings", async () => {
  state.supportsWindowFocus = false
  const { TabManager } = await import("~core/tab-manager")
  const settings = Object.freeze({
    autoFocus: true,
    showNotification: true,
    notificationSound: true,
  }) as Settings["tab"]
  const manager = new TabManager({ getName: () => "Gemini" } as SiteAdapter, settings)
  ;(manager as unknown as { sendCompletionNotification(): void }).sendCompletionNotification()
  expect(state.focus).not.toHaveBeenCalled()
  expect(state.notify).not.toHaveBeenCalled()
  expect(state.toast).not.toHaveBeenCalled()
  expect(AudioMock.instances[0].play).toHaveBeenCalledOnce()
  expect(settings.autoFocus).toBe(true)
})
