import {
  GEMINI_NATIVE_TAB_TITLE_ATTR,
  GEMINI_NATIVE_TAB_TITLE_PATH_ATTR,
  MANAGED_TAB_TITLE_ATTR,
} from "~utils/conversation-title"

declare const unsafeWindow: Window | undefined

let installed = false
let titleObserver: MutationObserver | null = null
let isApplyingManagedTitle = false

function getPageWindow(): typeof globalThis {
  if (typeof unsafeWindow !== "undefined" && unsafeWindow !== window) {
    return unsafeWindow as unknown as typeof globalThis
  }
  return window
}

function isGeminiStandardHost(): boolean {
  return getPageWindow().location.hostname === "gemini.google.com"
}

function getManagedTitle(): string | null {
  const title = getPageWindow()
    .document.documentElement?.getAttribute(MANAGED_TAB_TITLE_ATTR)
    ?.trim()
  return title || null
}

function rememberNativeTitle(title: string): void {
  const normalizedTitle = title.trim()
  if (!normalizedTitle) return

  const pageWindow = getPageWindow()
  const root = pageWindow.document.documentElement
  root?.setAttribute(GEMINI_NATIVE_TAB_TITLE_ATTR, normalizedTitle)
  root?.setAttribute(GEMINI_NATIVE_TAB_TITLE_PATH_ATTR, pageWindow.location.pathname)
}

function applyManagedTitle(): void {
  if (isApplyingManagedTitle) return

  const pageWindow = getPageWindow()
  const pageDocument = pageWindow.document
  const managedTitle = getManagedTitle()
  if (!managedTitle || pageDocument.title === managedTitle) return

  rememberNativeTitle(pageDocument.title)
  isApplyingManagedTitle = true
  pageDocument.title = managedTitle
  pageWindow.queueMicrotask(() => {
    isApplyingManagedTitle = false
  })
}

function installDocumentTitleSetterGuard(): void {
  const pageWindow = getPageWindow()
  const descriptorOwner =
    [pageWindow.Document.prototype, pageWindow.HTMLDocument.prototype].find((prototype) =>
      Object.prototype.hasOwnProperty.call(prototype, "title"),
    ) || pageWindow.Document.prototype
  const descriptor = Object.getOwnPropertyDescriptor(descriptorOwner, "title")

  if (!descriptor?.get || !descriptor?.set || descriptor.configurable === false) {
    return
  }

  Object.defineProperty(descriptorOwner, "title", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() {
      return descriptor.get?.call(this) ?? ""
    },
    set(value: string | null | undefined) {
      const nextTitle = String(value ?? "")

      if (this === pageWindow.document) {
        const managedTitle = getManagedTitle()
        if (managedTitle && nextTitle !== managedTitle) {
          rememberNativeTitle(nextTitle)
          descriptor.set?.call(this, managedTitle)
          return
        }
      }

      if (this === pageWindow.document && nextTitle !== getManagedTitle()) {
        rememberNativeTitle(nextTitle)
      }
      descriptor.set?.call(this, nextTitle)
    },
  })
}

function startTitleMutationGuard(): void {
  const pageWindow = getPageWindow()
  const pageDocument = pageWindow.document

  if (titleObserver || typeof pageWindow.MutationObserver === "undefined") return

  titleObserver = new pageWindow.MutationObserver(() => {
    if (isApplyingManagedTitle) return
    applyManagedTitle()
  })

  const observeHead = () => {
    if (!pageDocument.head) return
    titleObserver?.observe(pageDocument.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  observeHead()
  if (!pageDocument.head) {
    pageDocument.addEventListener("DOMContentLoaded", observeHead, { once: true })
  }

  if (pageDocument.documentElement) {
    titleObserver.observe(pageDocument.documentElement, {
      attributes: true,
      attributeFilter: [MANAGED_TAB_TITLE_ATTR],
    })
  }
}

export function initGeminiTitleGuard(): void {
  if (installed || !isGeminiStandardHost()) return
  installed = true

  installDocumentTitleSetterGuard()
  startTitleMutationGuard()
  applyManagedTitle()
}
