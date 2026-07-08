export interface PollingTaskOptions {
  /** Stable task name used for idempotent start/stop. */
  name: string
  /** Polling interval in milliseconds. */
  intervalMs: number
  /** Called on each interval tick. Async work is intentionally fire-and-forget, matching setInterval semantics. */
  run: () => void | Promise<void>
  /** When false, ticks are skipped while document.hidden is true. Defaults to true for behavior parity. */
  runWhenHidden?: boolean
}

interface RegisteredPollingTask extends PollingTaskOptions {
  intervalId: ReturnType<typeof setInterval>
  runWhenHidden: boolean
}

export class PollingTaskRegistry {
  private tasks = new Map<string, RegisteredPollingTask>()

  start(options: PollingTaskOptions): void {
    if (this.tasks.has(options.name)) return

    const task: RegisteredPollingTask = {
      ...options,
      runWhenHidden: options.runWhenHidden ?? true,
      intervalId: setInterval(() => {
        if (!task.runWhenHidden && typeof document !== "undefined" && document.hidden) {
          return
        }

        void task.run()
      }, options.intervalMs),
    }

    this.tasks.set(options.name, task)
  }

  stop(name: string): void {
    const task = this.tasks.get(name)
    if (!task) return

    clearInterval(task.intervalId)
    this.tasks.delete(name)
  }

  isRunning(name: string): boolean {
    return this.tasks.has(name)
  }

  stopAll(): void {
    Array.from(this.tasks.keys()).forEach((name) => this.stop(name))
  }
}
