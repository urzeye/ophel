import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SitePackManifest } from "~adapters/declarative/types"
import type { InstalledSitePack } from "~core/pack-manager"
import type {
  SitePackOriginBinding,
  SitePackOriginBindingsState,
} from "~core/site-pack-origin-bindings"

import type { SitePackDetectWaitResult } from "~adapters/declarative/detect"

interface TestPackManager {
  getOriginBindings(): Promise<SitePackOriginBindingsState>
  setOriginBinding(origin: string, binding: SitePackOriginBinding): Promise<unknown>
}

const detectionTestState = vi.hoisted(() => {
  const storage = { kind: "test-storage" }
  const getOriginBindings = vi.fn<() => Promise<SitePackOriginBindingsState>>()
  const setOriginBinding =
    vi.fn<(origin: string, binding: SitePackOriginBinding) => Promise<unknown>>()
  const packManager: TestPackManager = {
    getOriginBindings,
    setOriginBinding,
  }
  const createRuntimePackManager = vi.fn<(storage: unknown) => TestPackManager>()
  const ensureBindingOrigin =
    vi.fn<
      (
        origin: string,
        binding: SitePackOriginBinding,
        requestName: string,
      ) => Promise<"ready" | "denied" | "unsupported">
    >()
  const reconcile = vi.fn<() => Promise<unknown>>()
  const getCurrentLang = vi.fn<() => string>()
  const resolveSitePackName = vi.fn<(manifest: SitePackManifest, language: string) => string>()

  return {
    createRuntimePackManager,
    ensureBindingOrigin,
    getCurrentLang,
    getOriginBindings,
    packManager,
    reconcile,
    resolveSitePackName,
    setOriginBinding,
    storage,
  }
})

vi.mock("~core/pack-manager-runtime", () => ({
  createRuntimePackManager: detectionTestState.createRuntimePackManager,
}))

vi.mock("~platform", () => ({
  platform: {
    storage: detectionTestState.storage,
    sitePacks: {
      ensureBindingOrigin: detectionTestState.ensureBindingOrigin,
      reconcile: detectionTestState.reconcile,
    },
  },
}))

vi.mock("~utils/i18n", () => ({
  getCurrentLang: detectionTestState.getCurrentLang,
}))

vi.mock("~adapters/declarative/localization", () => ({
  resolveSitePackName: detectionTestState.resolveSitePackName,
}))

import {
  clearSitePackDetectionState,
  getSitePackDetectionState,
  recordSitePackDetectionResult,
  selectDetectedSitePack,
} from "~adapters/site-pack-detection"

const TEST_ORIGIN = "https://chat.example"

const createManifest = (id: string, name: string): SitePackManifest => ({
  schemaVersion: 1,
  id,
  version: 1,
  minAppVersion: "1.1.8",
  name,
  matches: [],
  detect: [{ selectorExists: `[data-pack='${id}']` }],
  capabilities: [],
  selectors: {},
})

const createPack = (id: string, name: string, installedAt: number): InstalledSitePack => ({
  manifest: createManifest(id, name),
  source: "local",
  installedAt,
  updatedAt: installedAt,
  enabled: true,
})

const createDetectionResult = (
  matches: InstalledSitePack[],
  overrides: Partial<SitePackDetectWaitResult> = {},
): SitePackDetectWaitResult => ({
  status: "matched",
  matches,
  issues: [],
  attempts: 2,
  elapsedMs: 15,
  ...overrides,
})

const createBindingState = (
  binding: SitePackOriginBinding = { mode: "detect" },
): SitePackOriginBindingsState => ({
  storageSchemaVersion: 1,
  bindings: { [TEST_ORIGIN]: binding },
})

const recordCandidates = (packs: InstalledSitePack[]): void => {
  recordSitePackDetectionResult(TEST_ORIGIN, createDetectionResult(packs))
}

beforeEach(() => {
  clearSitePackDetectionState()
  detectionTestState.createRuntimePackManager.mockReset()
  detectionTestState.ensureBindingOrigin.mockReset()
  detectionTestState.getCurrentLang.mockReset()
  detectionTestState.getOriginBindings.mockReset()
  detectionTestState.reconcile.mockReset()
  detectionTestState.resolveSitePackName.mockReset()
  detectionTestState.setOriginBinding.mockReset()

  detectionTestState.createRuntimePackManager.mockReturnValue(detectionTestState.packManager)
  detectionTestState.ensureBindingOrigin.mockResolvedValue("ready")
  detectionTestState.getCurrentLang.mockReturnValue("en")
  detectionTestState.getOriginBindings.mockResolvedValue(createBindingState())
  detectionTestState.reconcile.mockResolvedValue(undefined)
  detectionTestState.resolveSitePackName.mockImplementation((manifest) => manifest.name)
  detectionTestState.setOriginBinding.mockResolvedValue({ changed: true })
})

describe("SitePack detection state", () => {
  it("sorts candidates deterministically and returns isolated snapshots", () => {
    const later = createPack("zeta-pack", "Zeta Pack", 20)
    const sameTimeLaterId = createPack("beta-pack", "Beta Pack", 10)
    const sameTimeEarlierId = createPack("alpha-pack", "Alpha Pack", 10)
    const result = createDetectionResult([later, sameTimeLaterId, sameTimeEarlierId], {
      issues: [
        {
          code: "invalid-selector",
          message: "broken selector",
          packId: "zeta-pack",
          ruleIndex: 0,
        },
      ],
    })

    recordSitePackDetectionResult(TEST_ORIGIN, result)
    result.matches.reverse()
    result.issues[0]!.message = "mutated source issue"

    const snapshot = getSitePackDetectionState()
    expect(snapshot).toEqual({
      origin: TEST_ORIGIN,
      status: "matched",
      activePackId: "alpha-pack",
      candidates: [
        { packId: "alpha-pack", name: "Alpha Pack", installedAt: 10 },
        { packId: "beta-pack", name: "Beta Pack", installedAt: 10 },
        { packId: "zeta-pack", name: "Zeta Pack", installedAt: 20 },
      ],
      attempts: 2,
      elapsedMs: 15,
      issues: [
        {
          code: "invalid-selector",
          message: "broken selector",
          packId: "zeta-pack",
          ruleIndex: 0,
        },
      ],
    })

    snapshot!.candidates.reverse()
    snapshot!.candidates[0]!.name = "mutated snapshot"
    snapshot!.issues[0]!.message = "mutated snapshot issue"

    expect(getSitePackDetectionState()).toEqual({
      origin: TEST_ORIGIN,
      status: "matched",
      activePackId: "alpha-pack",
      candidates: [
        { packId: "alpha-pack", name: "Alpha Pack", installedAt: 10 },
        { packId: "beta-pack", name: "Beta Pack", installedAt: 10 },
        { packId: "zeta-pack", name: "Zeta Pack", installedAt: 20 },
      ],
      attempts: 2,
      elapsedMs: 15,
      issues: [
        {
          code: "invalid-selector",
          message: "broken selector",
          packId: "zeta-pack",
          ruleIndex: 0,
        },
      ],
    })
    expect(detectionTestState.createRuntimePackManager).not.toHaveBeenCalled()
  })

  it("clears the in-memory snapshot without touching persistence", () => {
    recordCandidates([createPack("candidate-pack", "Candidate Pack", 1)])
    expect(getSitePackDetectionState()).not.toBeNull()

    clearSitePackDetectionState()

    expect(getSitePackDetectionState()).toBeNull()
    expect(detectionTestState.createRuntimePackManager).not.toHaveBeenCalled()
  })
})

describe("SitePack detected candidate selection", () => {
  it("rejects an unknown candidate before reading or writing bindings", async () => {
    recordCandidates([createPack("known-pack", "Known Pack", 1)])

    await expect(selectDetectedSitePack("unknown-pack")).rejects.toThrow(
      `SitePack unknown-pack is not a matched candidate for ${TEST_ORIGIN}`,
    )

    expect(detectionTestState.createRuntimePackManager).not.toHaveBeenCalled()
    expect(detectionTestState.ensureBindingOrigin).not.toHaveBeenCalled()
    expect(detectionTestState.setOriginBinding).not.toHaveBeenCalled()
  })

  it("rejects a stale non-detect binding before requesting permission", async () => {
    const candidate = createPack("candidate-pack", "Candidate Pack", 1)
    recordCandidates([candidate])
    detectionTestState.getOriginBindings.mockResolvedValue(
      createBindingState({ mode: "explicit", packId: "other-pack" }),
    )

    await expect(selectDetectedSitePack(candidate.manifest.id)).rejects.toThrow(
      `SitePack origin ${TEST_ORIGIN} is no longer in detect mode`,
    )

    expect(detectionTestState.ensureBindingOrigin).not.toHaveBeenCalled()
    expect(detectionTestState.setOriginBinding).not.toHaveBeenCalled()
    expect(detectionTestState.reconcile).not.toHaveBeenCalled()
  })

  it("stops when origin permission is denied", async () => {
    const candidate = createPack("candidate-pack", "  Candidate Pack  ", 1)
    recordCandidates([candidate])
    detectionTestState.ensureBindingOrigin.mockResolvedValue("denied")

    await expect(selectDetectedSitePack(candidate.manifest.id)).rejects.toThrow(
      `Permission was denied for SitePack origin ${TEST_ORIGIN}`,
    )

    expect(detectionTestState.ensureBindingOrigin).toHaveBeenCalledWith(
      TEST_ORIGIN,
      { mode: "explicit", packId: "candidate-pack" },
      "Candidate Pack",
    )
    expect(detectionTestState.setOriginBinding).not.toHaveBeenCalled()
    expect(detectionTestState.reconcile).not.toHaveBeenCalled()
  })

  it("writes the selected candidate as the single explicit binding and reconciles once", async () => {
    const active = createPack("active-pack", "Active Pack", 1)
    const selected = createPack("selected-pack", "Selected Pack", 2)
    recordCandidates([selected, active])

    await expect(selectDetectedSitePack(selected.manifest.id)).resolves.toBeUndefined()

    expect(detectionTestState.createRuntimePackManager).toHaveBeenCalledWith(
      detectionTestState.storage,
    )
    expect(detectionTestState.getOriginBindings).toHaveBeenCalledTimes(1)
    expect(detectionTestState.ensureBindingOrigin).toHaveBeenCalledWith(
      TEST_ORIGIN,
      { mode: "explicit", packId: "selected-pack" },
      "Selected Pack",
    )
    expect(detectionTestState.setOriginBinding).toHaveBeenCalledTimes(1)
    expect(detectionTestState.setOriginBinding).toHaveBeenCalledWith(TEST_ORIGIN, {
      mode: "explicit",
      packId: "selected-pack",
    })
    expect(detectionTestState.reconcile).toHaveBeenCalledTimes(1)
  })

  it("restores the detect binding when reconciliation fails", async () => {
    const candidate = createPack("candidate-pack", "Candidate Pack", 1)
    recordCandidates([candidate])
    const reconcileError = new Error("activation reconcile failed")
    detectionTestState.reconcile
      .mockRejectedValueOnce(reconcileError)
      .mockResolvedValueOnce(undefined)

    await expect(selectDetectedSitePack(candidate.manifest.id)).rejects.toBe(reconcileError)

    expect(detectionTestState.setOriginBinding.mock.calls).toEqual([
      [TEST_ORIGIN, { mode: "explicit", packId: "candidate-pack" }],
      [TEST_ORIGIN, { mode: "detect" }],
    ])
    expect(detectionTestState.reconcile).toHaveBeenCalledTimes(2)
  })

  it("reports both activation and rollback failures", async () => {
    const candidate = createPack("candidate-pack", "Candidate Pack", 1)
    recordCandidates([candidate])
    detectionTestState.reconcile
      .mockRejectedValueOnce(new Error("activation reconcile failed"))
      .mockRejectedValueOnce(new Error("rollback reconcile failed"))

    await expect(selectDetectedSitePack(candidate.manifest.id)).rejects.toThrow(
      "Failed to select detected SitePack: activation reconcile failed; rollback failed: rollback reconcile failed",
    )

    expect(detectionTestState.setOriginBinding.mock.calls).toEqual([
      [TEST_ORIGIN, { mode: "explicit", packId: "candidate-pack" }],
      [TEST_ORIGIN, { mode: "detect" }],
    ])
    expect(detectionTestState.reconcile).toHaveBeenCalledTimes(2)
  })
})
