export function drainCleanupStack(tasks: Array<() => void>, context: string): void {
  while (tasks.length > 0) {
    const cleanup = tasks.pop()
    if (!cleanup) continue

    try {
      cleanup()
    } catch (error) {
      console.error(`[Ophel] ${context} cleanup failed:`, error)
    }
  }
}
