import { describe, expect, it, vi } from "vitest"

import { destroyModuleInstances, type DestroyableModuleInstances } from "~core/module-lifecycle"

describe("core module lifecycle", () => {
  it("destroys every registered module once", () => {
    const lifecycleCalls = Array.from({ length: 13 }, () => vi.fn())
    const modules: DestroyableModuleInstances = {
      assistantMermaidRenderer: { stop: lifecycleCalls[0] },
      themeManager: { stopThemeMonitoring: lifecycleCalls[1] },
      copyManager: { stop: lifecycleCalls[2] },
      layoutManager: { destroy: lifecycleCalls[3] },
      markdownFixer: { stop: lifecycleCalls[4] },
      tabManager: { destroy: lifecycleCalls[5] },
      watermarkRemover: { stop: lifecycleCalls[6] },
      readingHistoryManager: { destroy: lifecycleCalls[7] },
      modelLocker: { stop: lifecycleCalls[8] },
      scrollLockManager: { stop: lifecycleCalls[9] },
      userQueryMarkdownRenderer: { destroy: lifecycleCalls[10] },
      policyRetryManager: { destroy: lifecycleCalls[11] },
      usageCounterManager: { destroy: lifecycleCalls[12] },
    }

    destroyModuleInstances(modules)

    for (const lifecycleCall of lifecycleCalls) {
      expect(lifecycleCall).toHaveBeenCalledOnce()
    }
  })

  it("accepts an empty registry", () => {
    const emptyModules = Object.fromEntries(
      [
        "assistantMermaidRenderer",
        "themeManager",
        "copyManager",
        "layoutManager",
        "markdownFixer",
        "tabManager",
        "watermarkRemover",
        "readingHistoryManager",
        "modelLocker",
        "scrollLockManager",
        "userQueryMarkdownRenderer",
        "policyRetryManager",
        "usageCounterManager",
      ].map((key) => [key, null]),
    ) as unknown as DestroyableModuleInstances

    expect(() => destroyModuleInstances(emptyModules)).not.toThrow()
  })

  it("continues destroying modules after one cleanup fails", () => {
    const error = new Error("cleanup failure")
    const firstCleanup = vi.fn(() => {
      throw error
    })
    const laterCleanup = vi.fn()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const modules: DestroyableModuleInstances = {
      assistantMermaidRenderer: { stop: firstCleanup },
      themeManager: { stopThemeMonitoring: laterCleanup },
      copyManager: null,
      layoutManager: null,
      markdownFixer: null,
      tabManager: null,
      watermarkRemover: null,
      readingHistoryManager: null,
      modelLocker: null,
      scrollLockManager: null,
      userQueryMarkdownRenderer: null,
      policyRetryManager: null,
      usageCounterManager: null,
    }

    expect(() => destroyModuleInstances(modules)).not.toThrow()
    expect(firstCleanup).toHaveBeenCalledOnce()
    expect(laterCleanup).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      "[Ophel] Failed to destroy core module assistantMermaidRenderer:",
      error,
    )
  })
})
