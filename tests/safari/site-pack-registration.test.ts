import { describe, expect, it, vi } from "vitest"

import examplePack from "../../registry/examples/site-pack.example.json"
import type { SitePackManifest } from "~adapters/declarative/types"
import type { PlatformStorage } from "~platform/types"

import {
  buildSitePackRegistrations,
  createSitePackRegistrationManager,
  discoverSitePackScriptTemplates,
  type RegisteredSitePackScript,
} from "~platform/extension/site-pack-registration"

const manifestScripts = [
  { js: ["main.123.js", "ui-entry.123.js"], matches: ["https://example.com/*"] },
]
const mainScripts = ["monitor-entry", "scroll-lock-main", "keyboard-guard-main"].map((name) => ({
  id: name,
  js: [`safari-web-extension://extension-id/${name}.123.js`],
  world: "MAIN" as const,
  runAt: "document_start" as const,
  matches: ["https://example.com/*"],
}))

describe("SitePack script templates", () => {
  it.each(["safari-web-extension:", "safari-extension:", "chrome-extension:", "moz-extension:"])(
    "normalizes resource paths for %s without changing world or timing",
    async (protocol) => {
      const scripts = mainScripts.map((script) => ({
        ...script,
        js: script.js.map((url) => url.replace("safari-web-extension:", protocol)),
      }))
      const templates = discoverSitePackScriptTemplates(manifestScripts, scripts)
      const registrations = await buildSitePackRegistrations(["https://new.example/*"], templates)
      expect(registrations).toHaveLength(2)
      const main = registrations.find((script) => script.world === "MAIN")!
      expect(main.runAt).toBe("document_start")
      expect(main.persistAcrossSessions).toBe(true)
      expect(main.js).toEqual(mainScripts.map((script) => `${script.id}.123.js`))
      expect(main.matches).toEqual(["https://new.example/*"])
    },
  )

  it("reports missing core MAIN templates instead of pretending registration succeeded", () => {
    expect(() => discoverSitePackScriptTemplates(manifestScripts, mainScripts.slice(1))).toThrow(
      /monitor-entry/,
    )
  })

  it("accepts Safari's lowercase execution worlds while keeping MAIN and ISOLATED distinct", () => {
    const templates = discoverSitePackScriptTemplates(
      manifestScripts.map((script) => ({ ...script, world: "isolated" })),
      mainScripts.map((script) => ({ ...script, world: "main" })),
    )
    expect(templates.map((template) => template.world)).toEqual(["ISOLATED", "MAIN"])
    for (const world of ["isolated", undefined] as const) {
      expect(() =>
        discoverSitePackScriptTemplates(
          manifestScripts,
          mainScripts.map((script) => ({ ...script, world })),
        ),
      ).toThrow(/Expected MAIN world.*world:/)
    }
  })

  it("does not re-register unchanged scripts after Safari normalizes worlds and resource URLs", async () => {
    let dynamicScripts: RegisteredSitePackScript[] = []
    const scripting = {
      getRegisteredContentScripts: async () => [
        ...mainScripts.map((script): RegisteredSitePackScript => ({ ...script, world: "main" })),
        ...dynamicScripts,
      ],
      registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
        dynamicScripts = scripts.map((script) => ({
          ...script,
          world: script.world === "MAIN" ? "main" : "isolated",
          js: script.js?.map((asset) => `safari-web-extension://extension-id/${asset}`),
        }))
      }),
      unregisterContentScripts: vi.fn(),
    }
    const manager = createSitePackRegistrationManager({
      packManager: {
        getSnapshot: async () => ({
          storageSchemaVersion: 1,
          packs: [
            {
              manifest: examplePack as SitePackManifest,
              source: "local",
              enabled: true,
              installedAt: 1,
              updatedAt: 1,
            },
          ],
          issues: [],
        }),
        getOriginBindings: async () => ({ storageSchemaVersion: 1, bindings: {} }),
      },
      storage: { get: async () => undefined } as unknown as PlatformStorage,
      scripting,
      permissions: { contains: async () => true, remove: vi.fn() },
      getManifestContentScripts: () => manifestScripts,
      requestOrigins: vi.fn(),
    })
    const first = await manager.reconcile()
    expect(first.registrations).toHaveLength(2)
    expect(first.registrations.find((script) => script.world === "MAIN")).toMatchObject({
      runAt: "document_start",
      matches: examplePack.matches,
    })
    await manager.reconcile()
    expect(scripting.registerContentScripts).toHaveBeenCalledOnce()
    expect(scripting.unregisterContentScripts).not.toHaveBeenCalled()
  })
})
