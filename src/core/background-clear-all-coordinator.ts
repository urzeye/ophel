import { PersistenceWriteBarrier } from "~stores/chrome-adapter"

export const BACKGROUND_CLEAR_TRANSACTION_KEY = "ophel:backgroundClearTransaction"
export const BACKGROUND_CLEAR_TRANSACTION_TTL_MS = 2 * 60 * 1000

interface BackgroundClearTransaction {
  id: string
  startedAt: number
}

export interface BackgroundSessionStorage {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

interface BackgroundClearAllCoordinatorOptions {
  now?: () => number
  ttlMs?: number
  warn?: (message: string, context: { transactionId: string }) => void
}

function parseTransaction(value: unknown): BackgroundClearTransaction | null {
  if (typeof value !== "object" || value === null) return null

  const transaction = value as Partial<BackgroundClearTransaction>
  if (typeof transaction.id !== "string" || typeof transaction.startedAt !== "number") {
    return null
  }
  return { id: transaction.id, startedAt: transaction.startedAt }
}

export class BackgroundClearAllCoordinator {
  private activeTransaction: BackgroundClearTransaction | null = null
  private initialization: Promise<void> | null = null
  private readonly now: () => number
  private readonly ttlMs: number
  private readonly warn: NonNullable<BackgroundClearAllCoordinatorOptions["warn"]>

  constructor(
    private readonly sessionStorage: BackgroundSessionStorage,
    private readonly writeBarrier = new PersistenceWriteBarrier(),
    options: BackgroundClearAllCoordinatorOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? BACKGROUND_CLEAR_TRANSACTION_TTL_MS
    this.warn =
      options.warn ??
      ((message, context) => {
        console.warn(message, context)
      })
  }

  async begin(transactionId: string): Promise<void> {
    await this.ensureInitialized()
    await this.expireStaleTransaction()
    if (this.activeTransaction) {
      throw new Error(`Clear-all transaction ${this.activeTransaction.id} is already active`)
    }

    this.activeTransaction = { id: transactionId, startedAt: this.now() }
    this.writeBarrier.suspend()
    try {
      await this.sessionStorage.set({
        [BACKGROUND_CLEAR_TRANSACTION_KEY]: this.activeTransaction,
      })
      await this.writeBarrier.drain()
    } catch (error) {
      try {
        await this.sessionStorage.remove(BACKGROUND_CLEAR_TRANSACTION_KEY)
      } catch (cleanupError) {
        console.error("[Ophel] Failed to remove background clear-all lock:", cleanupError)
      }
      this.activeTransaction = null
      this.writeBarrier.resume()
      throw error
    }
  }

  async release(transactionId: string): Promise<void> {
    await this.ensureInitialized()
    await this.expireStaleTransaction()
    if (this.activeTransaction?.id !== transactionId) {
      throw new Error("Clear-all transaction ownership does not match")
    }

    await this.sessionStorage.remove(BACKGROUND_CLEAR_TRANSACTION_KEY)
    this.activeTransaction = null
    this.writeBarrier.resume()
  }

  async runPersistenceWrite(write: () => Promise<void>): Promise<void> {
    await this.ensureInitialized()
    await this.expireStaleTransaction()
    if (this.activeTransaction || this.writeBarrier.isSuspended()) {
      throw new Error("Background persistence writes are suspended by a clear-all transaction")
    }
    await Promise.resolve(this.writeBarrier.track(write()))
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.sessionStorage
        .get(BACKGROUND_CLEAR_TRANSACTION_KEY)
        .then(async (result) => {
          this.activeTransaction = parseTransaction(result[BACKGROUND_CLEAR_TRANSACTION_KEY])
          if (this.activeTransaction) {
            this.writeBarrier.suspend()
            await this.expireStaleTransaction()
          }
        })
        .catch((error) => {
          this.initialization = null
          throw error
        })
    }
    return this.initialization
  }

  private async expireStaleTransaction(): Promise<void> {
    if (!this.activeTransaction || this.now() - this.activeTransaction.startedAt <= this.ttlMs) {
      return
    }

    this.warn("[Ophel] Releasing stale background clear-all transaction:", {
      transactionId: this.activeTransaction.id,
    })
    await this.sessionStorage.remove(BACKGROUND_CLEAR_TRANSACTION_KEY)
    this.activeTransaction = null
    this.writeBarrier.resume()
  }
}
