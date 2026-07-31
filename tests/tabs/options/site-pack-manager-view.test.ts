import { describe, expect, it } from "vitest"

import type { SitePackManifest } from "~adapters/declarative/types"
import type { InstalledSitePack } from "~core/pack-manager"
import { selectRuntimePreparationPacks } from "~tabs/options/site-pack-manager-view"

const createInstalledPack = (id: string): InstalledSitePack => ({
  manifest: {
    schemaVersion: 1,
    id,
    version: 1,
    minAppVersion: "1.1.8",
    name: id,
    matches: [`https://${id}.example.test/*`],
    capabilities: [],
    selectors: {},
  } satisfies SitePackManifest,
  source: "registry",
  installedAt: 1_000_000_000_000,
  updatedAt: 1_000_000_000_000,
  enabled: true,
  registryStatus: "available",
})

describe("selectRuntimePreparationPacks", () => {
  it("selects only packs changed by the current registry sync", () => {
    const packs = [
      createInstalledPack("stable-pack"),
      createInstalledPack("updated-pack"),
      createInstalledPack("status-pack"),
    ]

    const selected = selectRuntimePreparationPacks(packs, {
      updatedPackIds: ["updated-pack"],
      statusChangedPackIds: ["status-pack"],
    })

    expect(selected.map((pack) => pack.manifest.id)).toEqual(["updated-pack", "status-pack"])
  })
})
