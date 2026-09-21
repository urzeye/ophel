import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { resources } from "~locales/resources"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

const exportDialogSource = readSource("../../src/components/ExportDialog.tsx")
const appSource = readSource("../../src/components/App.tsx")

const localeIds = ["zh-CN", "zh-TW", "en", "ja", "ko", "it", "de", "es", "fr", "pt", "ru"] as const

describe("export dialog settings entry", () => {
  it("renders a settings button with proper styling, accessibility, and navigation in ExportDialog", () => {
    const source = compact(exportDialogSource)

    // 检查 SettingsIcon 引入与渲染
    expect(source).toContain("SettingsIcon")
    expect(source).toContain("<SettingsIcon size={14}")

    // 检查结构与样式类
    expect(source).toContain(".gh-export-section-header")
    expect(source).toContain(".gh-export-settings-btn")
    expect(source).toContain('className="gh-export-section-header"')
    expect(source).toContain('className="gh-export-settings-btn"')

    // 检查无障碍属性与文案
    expect(source).toContain('title={t("exportSettings")}')
    expect(source).toContain('aria-label={t("exportSettings")}')

    // 检查 props 与事件派发逻辑
    expect(source).toContain("onOpenSettings?: () => void")
    expect(source).toContain('detail: { settingId: "export-settings-card" }')
    expect(source).toContain('"ophel:navigateSettingsPage"')
  })

  it("wires onOpenSettings in App.tsx to open SettingsModal and navigate to export settings card", () => {
    const source = compact(appSource)

    expect(source).toContain("onOpenSettings={() => {")
    expect(source).toContain("openSettingsModal()")
    expect(source).toContain('detail: { settingId: "export-settings-card" }')
  })

  it("ensures exportSettings i18n label exists in all 11 supported languages", () => {
    for (const localeId of localeIds) {
      const locale = resources[localeId]
      expect(locale.exportSettings, `Missing exportSettings in ${localeId}`).toBeDefined()
      expect(locale.exportSettings.length, `Empty exportSettings in ${localeId}`).toBeGreaterThan(0)
    }
  })
})
