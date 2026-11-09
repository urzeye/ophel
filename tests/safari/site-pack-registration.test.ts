import { describe, expect, it } from "vitest"

import {
  buildSitePackRegistrations,
  discoverSitePackScriptTemplates,
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
})
