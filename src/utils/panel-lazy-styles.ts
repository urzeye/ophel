export const PANEL_LAZY_STYLE_IDS = ["settings", "release-notes"] as const

export type PanelLazyStyleId = (typeof PANEL_LAZY_STYLE_IDS)[number]

type PanelLazyStyleTarget = Element | ShadowRoot | null

const styleUrls: Partial<Record<PanelLazyStyleId, string>> = {}

export function registerPanelLazyStyles(urls: Partial<Record<PanelLazyStyleId, string>>): void {
  Object.assign(styleUrls, urls)
}

function resolveShadowRoot(target: PanelLazyStyleTarget): ShadowRoot | null {
  if (!target) return null
  if (target instanceof ShadowRoot) return target

  const root = target.getRootNode()
  return root instanceof ShadowRoot ? root : null
}

function injectPanelLazyStyle(shadowRoot: ShadowRoot, id: PanelLazyStyleId): void {
  const url = styleUrls[id]
  if (!url || shadowRoot.querySelector(`link[data-ophel-lazy-style="${id}"]`)) return

  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = url
  link.dataset.ophelLazyStyle = id
  link.addEventListener(
    "error",
    () => {
      console.error(`[Ophel] Failed to load lazy panel style: ${id}`, url)
      link.remove()
    },
    { once: true },
  )

  // 主题变量必须保持最后注入；懒样式统一插到主题 style 之前。
  const themeStyle = shadowRoot.querySelector("#gh-theme-vars")
  if (themeStyle) {
    shadowRoot.insertBefore(link, themeStyle)
  } else {
    shadowRoot.append(link)
  }
}

export function ensurePanelLazyStyles(
  target: PanelLazyStyleTarget,
  ids: readonly PanelLazyStyleId[] = PANEL_LAZY_STYLE_IDS,
): void {
  const shadowRoot = resolveShadowRoot(target)
  if (!shadowRoot) return

  for (const id of ids) {
    injectPanelLazyStyle(shadowRoot, id)
  }
}

export function schedulePanelLazyStyles(
  target: PanelLazyStyleTarget,
  ids: readonly PanelLazyStyleId[] = PANEL_LAZY_STYLE_IDS,
): () => void {
  if (!PANEL_LAZY_STYLE_IDS.some((id) => styleUrls[id])) {
    return () => {}
  }

  const run = () => ensurePanelLazyStyles(target, ids)
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 1500 })
    return () => window.cancelIdleCallback(handle)
  }

  const handle = window.setTimeout(run, 300)
  return () => window.clearTimeout(handle)
}
