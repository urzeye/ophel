export class PersistWriteGate {
  private suppressedWrites = 0

  runWithoutPersist<T>(callback: () => T): T {
    this.suppressedWrites += 1
    try {
      return callback()
    } finally {
      this.suppressedWrites = Math.max(0, this.suppressedWrites - 1)
    }
  }

  shouldSkipWrite(): boolean {
    return this.suppressedWrites > 0
  }
}
