export interface DestroyableModuleInstances {
  assistantMermaidRenderer: { stop: () => void } | null
  themeManager: { stopThemeMonitoring: () => void } | null
  copyManager: { stop: () => void } | null
  layoutManager: { destroy: () => void } | null
  markdownFixer: { stop: () => void } | null
  tabManager: { destroy: () => void } | null
  watermarkRemover: { stop: () => void } | null
  readingHistoryManager: { destroy: () => void } | null
  modelLocker: { stop: () => void } | null
  scrollLockManager: { stop: () => void } | null
  userQueryMarkdownRenderer: { destroy: () => void } | null
  policyRetryManager: { destroy: () => void } | null
  usageCounterManager: { destroy: () => void } | null
}

export function destroyModuleInstances(modules: DestroyableModuleInstances): void {
  const cleanupSteps: Array<[name: string, cleanup: (() => void) | undefined]> = [
    [
      "assistantMermaidRenderer",
      modules.assistantMermaidRenderer?.stop.bind(modules.assistantMermaidRenderer),
    ],
    ["themeManager", modules.themeManager?.stopThemeMonitoring.bind(modules.themeManager)],
    ["copyManager", modules.copyManager?.stop.bind(modules.copyManager)],
    ["layoutManager", modules.layoutManager?.destroy.bind(modules.layoutManager)],
    ["markdownFixer", modules.markdownFixer?.stop.bind(modules.markdownFixer)],
    ["tabManager", modules.tabManager?.destroy.bind(modules.tabManager)],
    ["watermarkRemover", modules.watermarkRemover?.stop.bind(modules.watermarkRemover)],
    [
      "readingHistoryManager",
      modules.readingHistoryManager?.destroy.bind(modules.readingHistoryManager),
    ],
    ["modelLocker", modules.modelLocker?.stop.bind(modules.modelLocker)],
    ["scrollLockManager", modules.scrollLockManager?.stop.bind(modules.scrollLockManager)],
    [
      "userQueryMarkdownRenderer",
      modules.userQueryMarkdownRenderer?.destroy.bind(modules.userQueryMarkdownRenderer),
    ],
    ["policyRetryManager", modules.policyRetryManager?.destroy.bind(modules.policyRetryManager)],
    ["usageCounterManager", modules.usageCounterManager?.destroy.bind(modules.usageCounterManager)],
  ]

  for (const [name, cleanup] of cleanupSteps) {
    if (!cleanup) continue
    try {
      cleanup()
    } catch (error) {
      console.error(`[Ophel] Failed to destroy core module ${name}:`, error)
    }
  }
}
