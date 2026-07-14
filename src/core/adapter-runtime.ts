import type { SiteAdapter } from "~adapters/base"

const ADAPTER_RUNTIME_CHANGE_EVENT = "ophel:adapter-runtime-change"

export function getAdapterRuntime(): SiteAdapter | null {
  return window.__ophelAdapterRuntime ?? null
}

export function setAdapterRuntime(adapter: SiteAdapter): void {
  if (window.__ophelAdapterRuntime === adapter) return

  window.__ophelAdapterRuntime = adapter
  window.dispatchEvent(new Event(ADAPTER_RUNTIME_CHANGE_EVENT))
}

export function clearAdapterRuntime(expectedAdapter?: SiteAdapter): void {
  if (!window.__ophelAdapterRuntime) return
  if (expectedAdapter && window.__ophelAdapterRuntime !== expectedAdapter) return

  window.__ophelAdapterRuntime = undefined
  window.dispatchEvent(new Event(ADAPTER_RUNTIME_CHANGE_EVENT))
}

export function subscribeAdapterRuntime(listener: () => void): () => void {
  window.addEventListener(ADAPTER_RUNTIME_CHANGE_EVENT, listener)
  return () => window.removeEventListener(ADAPTER_RUNTIME_CHANGE_EVENT, listener)
}
