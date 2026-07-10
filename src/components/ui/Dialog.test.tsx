import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { DialogOverlay } from "./Dialog"
import { OverlayPortalProvider } from "./OverlayPortal"

const DialogHarness = ({ onClose }: { onClose: () => void }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <OverlayPortalProvider>
      <button onClick={() => setIsOpen(true)}>Open</button>
      {isOpen && (
        <DialogOverlay
          onClose={() => {
            setIsOpen(false)
            onClose()
          }}>
          <div className="gh-dialog-title">Confirm action</div>
          <button>Cancel</button>
          <button>Confirm</button>
        </DialogOverlay>
      )}
    </OverlayPortalProvider>
  )
}

describe("DialogOverlay", () => {
  it("renders in the shared overlay root, traps focus, and restores the trigger", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)

    const trigger = screen.getByRole("button", { name: "Open" })
    await user.click(trigger)

    const dialog = await screen.findByRole("dialog", { name: "Confirm action" })
    expect(dialog.closest("#ophel-overlay-root")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(onClose).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
  })
})
