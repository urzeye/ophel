import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { OverlayPortalProvider } from "~components/ui/OverlayPortal"
import { ImportDialog } from "~components/prompts/ImportDialog"

const ImportDialogHarness = ({ onClose }: { onClose: () => void }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <OverlayPortalProvider>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open import
      </button>
      <ImportDialog
        isOpen={isOpen}
        promptCount={2}
        onClose={() => {
          setIsOpen(false)
          onClose()
        }}
        onMerge={() => undefined}
        onOverwrite={() => undefined}
      />
    </OverlayPortalProvider>
  )
}

describe("prompt dialogs", () => {
  it("uses the shared dialog focus and Escape lifecycle", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ImportDialogHarness onClose={onClose} />)

    const trigger = screen.getByRole("button", { name: "Open import" })
    await user.click(trigger)

    const dialog = await screen.findByRole("dialog")
    expect(dialog.closest("#ophel-overlay-root")).not.toBeNull()
    expect(screen.getByRole("button", { name: /cancel/i })).toHaveFocus()

    await user.keyboard("{Escape}")
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(onClose).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
  })
})
