import { drainPersistenceWrites, suspendPersistenceWrites } from "~stores/chrome-adapter"
import { dispatchClearAllDataEvent } from "~utils/clear-all-event"

export async function prepareUserscriptRuntimeForClearAll(): Promise<void> {
  suspendPersistenceWrites()
  await Promise.all([drainPersistenceWrites(), dispatchClearAllDataEvent()])
}
