import { afterEach, vi } from "vitest"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
