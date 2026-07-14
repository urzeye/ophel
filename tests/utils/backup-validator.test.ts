import { describe, expect, it } from "vitest"

import { validateBackupData } from "~utils/backup-validator"

describe("validateBackupData", () => {
  it("accepts the current flat version 3 backup schema", () => {
    expect(
      validateBackupData({
        version: 3,
        timestamp: "2026-07-10T00:00:00.000Z",
        data: {
          settings: { language: "en" },
          prompts: [],
          promptChains: [],
          folders: [],
          conversations: { conversations: {}, lastUsedFolderId: "inbox" },
          readingHistory: { history: {}, lastCleanupRun: 0 },
        },
      }),
    ).toEqual({ valid: true, errorKeys: [] })
  })

  it("keeps legacy prompt-chain persist envelopes compatible", () => {
    const legacyPayloads = [{ chains: [] }, { state: { chains: [] }, version: 0 }]

    legacyPayloads.forEach((promptChains) => {
      expect(
        validateBackupData({
          version: 1,
          data: { promptChains },
        }),
      ).toEqual({ valid: true, errorKeys: [] })
    })
  })

  it("rejects missing envelopes and incompatible store payloads", () => {
    expect(validateBackupData({ data: { prompts: {} } })).toEqual({
      valid: false,
      errorKeys: ["backupValidationMissingVersion", "backupValidationPromptsType"],
    })
    expect(validateBackupData(null)).toEqual({
      valid: false,
      errorKeys: ["backupValidationInvalidFormat"],
    })
  })
})
