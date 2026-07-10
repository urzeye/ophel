import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { ToggleRow } from "~tabs/options/components/SettingRow"

describe("ToggleRow", () => {
  it("associates the visible label with the checkbox", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ToggleRow
        label="Enable outline"
        description="Refresh the outline while generating"
        checked={false}
        onChange={onChange}
      />,
    )

    const checkbox = screen.getByRole("checkbox", { name: "Enable outline" })
    await user.click(screen.getByText("Enable outline"))

    expect(checkbox).toHaveFocus()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
