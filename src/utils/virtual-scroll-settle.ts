/**
 * DeepSeek / Claude 虚拟列表的滚动落点确认。
 * scrollTop 写上之后，列表要过一拍才会把对应消息挂进视口。
 * 其他站点不使用这里的判断。
 */

const SETTLE_TIMEOUT_MS = 1600
const SETTLE_INTERVAL_MS = 100
const SCROLL_TOLERANCE_PX = 80

export async function settleVirtualScroll(
  readContainer: () => HTMLElement | null,
  isSettled: (container: HTMLElement) => boolean,
  align: (container: HTMLElement) => void,
  signal?: AbortSignal,
  options?: { timeoutMs?: number },
): Promise<boolean> {
  const deadline = Date.now() + (options?.timeoutMs ?? SETTLE_TIMEOUT_MS)
  let stablePasses = 0

  while (Date.now() <= deadline) {
    if (signal?.aborted) return false
    const container = readContainer()
    if (container) {
      align(container)
      if (isSettled(container)) {
        stablePasses += 1
        if (stablePasses >= 2) return true
      } else {
        stablePasses = 0
      }
    } else {
      stablePasses = 0
    }

    const continued = await delay(SETTLE_INTERVAL_MS, signal)
    if (!continued) return false
  }

  return false
}

/**
 * 等容器自己的滚动安静下来（站点加载完成后的自动滚动可能持续数秒）。
 * 连续 quietMs 无滚动变化才返回 true；超时返回 false。
 */
export async function waitForVirtualScrollQuiet(
  readContainer: () => HTMLElement | null,
  signal?: AbortSignal,
  options?: { quietMs?: number; timeoutMs?: number },
): Promise<boolean> {
  const quietMs = options?.quietMs ?? 600
  const deadline = Date.now() + (options?.timeoutMs ?? 8000)
  let lastTop: number | null = null
  let quietStart = 0

  while (Date.now() <= deadline) {
    if (signal?.aborted) return false
    const container = readContainer()
    if (container) {
      const top = container.scrollTop
      if (lastTop === null || Math.abs(top - lastTop) > 2) {
        lastTop = top
        quietStart = Date.now()
      } else if (Date.now() - quietStart >= quietMs) {
        return true
      }
    }

    const continued = await delay(SETTLE_INTERVAL_MS, signal)
    if (!continued) return false
  }

  return false
}

export function alignScrollTop(container: HTMLElement, top: number): void {
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
  const next = Math.min(maxScroll, Math.max(0, top))
  if (Math.abs(container.scrollTop - next) <= 2) return
  container.scrollTop = next
  container.dispatchEvent(new Event("scroll", { bubbles: true }))
}

export function isClaudeVirtualEdgeSettled(container: HTMLElement, edge: "start" | "end"): boolean {
  if (edge === "start") {
    if (container.scrollTop > 40) return false
    const head = container.querySelector('[data-rs-index="0"]')
    if (!hasClientRect(head)) return false
    if (leadingClaudeSpacerHeight(container) > SCROLL_TOLERANCE_PX) return false
    return elementIntersectsTop(container, head, 240)
  }

  const last = container.querySelector("[data-testid='transcript-row'][data-last-message='true']")
  if (!hasClientRect(last)) return false
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
  if (maxScroll > 40 && container.scrollTop < maxScroll - SCROLL_TOLERANCE_PX) return false
  return elementIntersectsViewport(container, last)
}

export function isDeepSeekVirtualEdgeSettled(
  container: HTMLElement,
  edge: "start" | "end",
): boolean {
  const windowEl = deepSeekVisibleWindow(container)
  if (!windowEl) return true

  const translateY = readTranslateY(windowEl)
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
  if (edge === "start") {
    return container.scrollTop <= 40 && translateY <= SCROLL_TOLERANCE_PX
  }

  return (
    maxScroll <= 40 ||
    (container.scrollTop >= maxScroll - SCROLL_TOLERANCE_PX &&
      Math.abs(translateY - container.scrollTop) <= 200 &&
      deepSeekViewportHasRow(container))
  )
}

function deepSeekVisibleWindow(container: ParentNode): HTMLElement | null {
  const windowEl = container.querySelector(".ds-virtual-list-visible-items")
  if (!windowEl || !("style" in windowEl)) return null
  return windowEl as HTMLElement
}

function readTranslateY(element: HTMLElement): number {
  const match = /translateY\(\s*([-\d.]+)px\s*\)/.exec(element.style.transform || "")
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) ? value : 0
}

function leadingClaudeSpacerHeight(container: ParentNode): number {
  const sizer = container.querySelector("[data-testid='transcript-sizer']")
  const spacer = sizer?.querySelector("[data-testid='transcript-spacer']")
  if (!hasClientRect(spacer)) return 0
  const height = spacer.getBoundingClientRect().height
  return Number.isFinite(height) ? height : 0
}

function deepSeekViewportHasRow(container: HTMLElement): boolean {
  return someRowIntersects(container, "[data-virtual-list-item-key]")
}

function someRowIntersects(container: HTMLElement, selector: string): boolean {
  const rows = container.querySelectorAll(selector)
  for (const row of rows) {
    if (hasClientRect(row) && elementIntersectsViewport(container, row)) return true
  }
  return false
}

function hasClientRect(element: Element | null): element is HTMLElement {
  return !!element && typeof element.getBoundingClientRect === "function"
}

function elementIntersectsTop(container: HTMLElement, element: HTMLElement, band: number): boolean {
  const containerRect = container.getBoundingClientRect()
  const rowRect = element.getBoundingClientRect()
  return rowRect.bottom > containerRect.top && rowRect.top < containerRect.top + band
}

function elementIntersectsViewport(container: HTMLElement, element: HTMLElement): boolean {
  const containerRect = container.getBoundingClientRect()
  const rowRect = element.getBoundingClientRect()
  return rowRect.bottom > containerRect.top + 1 && rowRect.top < containerRect.bottom - 1
}

function delay(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve(true)
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}
