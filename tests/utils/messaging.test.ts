import { describe, expect, it } from "vitest"

import { requireSuccessfulMessageAcknowledgement } from "~utils/messaging"

describe("requireSuccessfulMessageAcknowledgement", () => {
  it("accepts an explicit success response", () => {
    expect(() => requireSuccessfulMessageAcknowledgement({ success: true })).not.toThrow()
  })

  it.each([
    [undefined, "Content script did not acknowledge the message"],
    [{}, "Content script did not acknowledge the message"],
    [{ success: false, error: "runtime cleanup failed" }, "runtime cleanup failed"],
  ])("rejects an unconfirmed response", (response, expectedMessage) => {
    expect(() => requireSuccessfulMessageAcknowledgement(response)).toThrow(expectedMessage)
  })
})
