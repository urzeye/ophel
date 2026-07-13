import { render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"

import {
  OverlayPortalProvider,
  resolveAmbientPortalTarget,
  useOverlayPortalTarget,
} from "./OverlayPortal"

const PortalTargetProbe = () => {
  const overlayTarget = useOverlayPortalTarget()
  const ambientTarget = resolveAmbientPortalTarget(overlayTarget)

  return (
    <output data-testid="portal-target">
      {ambientTarget instanceof ShadowRoot ? "shadow-root" : "overlay-root"}
    </output>
  )
}

describe("OverlayPortalProvider", () => {
  it("resolves persistent controls to the ambient Shadow Root layer", () => {
    const host = document.createElement("div")
    const shadowRoot = host.attachShadow({ mode: "open" })
    const container = shadowRoot.appendChild(document.createElement("div"))
    document.body.appendChild(host)

    const { unmount } = render(
      <OverlayPortalProvider>
        <PortalTargetProbe />
      </OverlayPortalProvider>,
      { container },
    )

    expect(within(container).getByTestId("portal-target")).toHaveTextContent("shadow-root")
    expect(window.__ophelOverlayRoot?.getRootNode()).toBe(shadowRoot)
    unmount()
    host.remove()
  })

  it("keeps non-Shadow DOM surfaces on the shared overlay root", () => {
    render(
      <OverlayPortalProvider>
        <PortalTargetProbe />
      </OverlayPortalProvider>,
    )

    expect(screen.getByTestId("portal-target")).toHaveTextContent("overlay-root")
  })
})
