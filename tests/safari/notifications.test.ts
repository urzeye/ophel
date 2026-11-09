import type { SiteAdapter } from "~adapters/base"
import type { Settings } from "~utils/storage"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ supportsSystem: false, notify: vi.fn(), focus: vi.fn() }))
vi.mock("~platform", () => ({
  platform: {
    hasCapability: () => state.supportsSystem,
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
