import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { DialogOverlay } from "~components/ui/Dialog"
import { OverlayPortalProvider } from "~components/ui/OverlayPortal"

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

const NestedDialogHarness = ({
  onParentClose,
  onChildClose,
}: {
  onParentClose: () => void
  onChildClose: () => void
}) => {
  const [isParentOpen, setIsParentOpen] = useState(false)
  const [isChildOpen, setIsChildOpen] = useState(false)

  return (
    <OverlayPortalProvider>
      <button onClick={() => setIsParentOpen(true)}>Open parent</button>
      {isParentOpen && (
        <DialogOverlay
          onClose={() => {
            setIsParentOpen(false)
            onParentClose()
          }}>
          <div className="gh-dialog-title">Parent dialog</div>
          <button onClick={() => setIsChildOpen(true)}>Open child</button>
          <button>Parent action</button>
          {isChildOpen && (
            <DialogOverlay
              onClose={() => {
                setIsChildOpen(false)
                onChildClose()
              }}>
              <div className="gh-dialog-title">Child dialog</div>
              <button>Child cancel</button>
              <button>Child confirm</button>
            </DialogOverlay>
          )}
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

  it("limits Escape and focus trapping to the topmost nested dialog", async () => {
    const user = userEvent.setup()
    const onParentClose = vi.fn()
    const onChildClose = vi.fn()
    render(<NestedDialogHarness onParentClose={onParentClose} onChildClose={onChildClose} />)

    const parentTrigger = screen.getByRole("button", { name: "Open parent" })
    await user.click(parentTrigger)
    const childTrigger = await screen.findByRole("button", { name: "Open child" })
    await user.click(childTrigger)

    const childDialog = await screen.findByRole("dialog", { name: "Child dialog" })
    expect(screen.getByRole("button", { name: "Child cancel" })).toHaveFocus()

    await user.tab({ shift: true })
    expect(screen.getByRole("button", { name: "Child confirm" })).toHaveFocus()
    expect(childDialog).toBeInTheDocument()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(childDialog).not.toBeInTheDocument())
    expect(onChildClose).toHaveBeenCalledOnce()
    expect(onParentClose).not.toHaveBeenCalled()
    expect(childTrigger).toHaveFocus()

    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Parent dialog" })).not.toBeInTheDocument(),
    )
    expect(onParentClose).toHaveBeenCalledOnce()
    expect(parentTrigger).toHaveFocus()
  })
})
