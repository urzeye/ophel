import React, { createContext, useCallback, useContext, useRef, useState } from "react"

const OverlayPortalContext = createContext<HTMLElement | null>(null)

interface OverlayPortalProviderProps {
  children: React.ReactNode
}

export const OverlayPortalProvider: React.FC<OverlayPortalProviderProps> = ({ children }) => {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const registeredRootRef = useRef<HTMLElement | null>(null)

  const registerPortalRoot = useCallback((node: HTMLDivElement | null) => {
    setPortalRoot(node)

    if (node) {
      registeredRootRef.current = node
      window.__ophelOverlayRoot = node
    } else if (window.__ophelOverlayRoot === registeredRootRef.current) {
      window.__ophelOverlayRoot = undefined
      registeredRootRef.current = null
    }
  }, [])

  return (
    <OverlayPortalContext.Provider value={portalRoot}>
      {children}
      <div ref={registerPortalRoot} id="ophel-overlay-root" className="gh-overlay-root" />
    </OverlayPortalContext.Provider>
  )
}

export function useOverlayPortalTarget(): HTMLElement | null {
  return useContext(OverlayPortalContext)
}

/**
 * Resolve the Shadow Root ambient layer for persistent controls that should stay below page dialogs.
 */
export function resolveAmbientPortalTarget(
  overlayPortalTarget: HTMLElement | null,
): Element | DocumentFragment | null {
  if (!overlayPortalTarget) return null

  const rootNode = overlayPortalTarget.getRootNode()
  return typeof ShadowRoot !== "undefined" && rootNode instanceof ShadowRoot
    ? rootNode
    : overlayPortalTarget
}
