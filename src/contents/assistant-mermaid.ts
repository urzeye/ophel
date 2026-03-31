import type { PlasmoCSConfig } from "plasmo"

import { getAssistantMermaidAdapterForHostname } from "~adapters/base"
import { AssistantMermaidRenderer } from "~core/assistant-mermaid-renderer"
import { getSettingsState, subscribeSettings, useSettingsStore } from "~stores/settings-store"
import type { Settings } from "~utils/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://gemini.google.com/*"],
  run_at: "document_idle",
}

function isEnabled(settings: Settings): boolean {
  return settings.content?.assistantMermaid ?? true
}

async function waitForSettingsHydration(): Promise<void> {
  if (useSettingsStore.getState()._hasHydrated) {
    return
  }

  await new Promise<void>((resolve) => {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (!state._hasHydrated) return
      unsubscribe()
      resolve()
    })
  })
}

if (!window.__ophelAssistantMermaidEntryInitialized) {
  window.__ophelAssistantMermaidEntryInitialized = true

  const adapter = getAssistantMermaidAdapterForHostname()

  if (adapter?.getAssistantMermaidSupportMode() === "fallback") {
    ;(async () => {
      await waitForSettingsHydration()

      let renderer: AssistantMermaidRenderer | null = null

      const applySettings = (settings: Settings) => {
        const enabled = isEnabled(settings)

        if (!enabled) {
          renderer?.updateSettings(false)
          return
        }

        if (renderer) {
          renderer.updateSettings(true)
          return
        }

        renderer = new AssistantMermaidRenderer(adapter, true)
      }

      applySettings(getSettingsState())

      const unsubscribe = subscribeSettings((settings) => {
        applySettings(settings)
      })

      window.addEventListener(
        "pagehide",
        () => {
          unsubscribe()
          renderer?.stop()
        },
        { once: true },
      )
    })().catch((error) => {
      console.error("[Ophel] Assistant Mermaid entry init failed:", error)
    })
  }
}
