export interface ClearAllTransactionSteps {
  prepare: () => void | Promise<void>
  clear: () => void | Promise<void>
  commit: () => void | Promise<void>
  abort: () => void | Promise<void>
}

/**
 * Stops writers before clearing storage and resumes them if any transaction step fails.
 */
export async function runClearAllTransaction({
  prepare,
  clear,
  commit,
  abort,
}: ClearAllTransactionSteps): Promise<void> {
  try {
    await prepare()
    await clear()
    await commit()
  } catch (error) {
    try {
      await abort()
    } catch (abortError) {
      console.error("[Ophel] Failed to resume runtimes after clear-all failure:", abortError)
    }

    throw error
  }
}
