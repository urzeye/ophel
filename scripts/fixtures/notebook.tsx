import React from "react"
import { createRoot } from "react-dom/client"

import { NotebookAdapter } from "~adapters/notebook"
import { MainPanel } from "~components/MainPanel"
import { QuickButtons } from "~components/QuickButtons"
import { ConversationManager } from "~core/conversation-manager"
import { LayoutManager } from "~core/layout-manager"
import { OutlineManager } from "~core/outline-manager"
import { PromptManager } from "~core/prompt-manager"
import { getShortcutManager } from "~core/shortcut-manager"
import { ensureGlobalThemeManager } from "~core/theme-manager"
import { useShortcuts } from "~hooks/useShortcuts"
import { anchorStore } from "~stores/anchor-store"
import { useSettingsStore } from "~stores/settings-store"
import { DEFAULT_SETTINGS, getSitePageWidth } from "~utils/storage"
import { initI18n, setLanguage } from "~utils/i18n"
import { navigateOutlineContext } from "~utils/outline-navigation"
import mainCss from "~style.css?inline"
import themeCss from "~styles/theme-variables.css?inline"
import conversationsCss from "~styles/conversations.css?inline"
import settingsCss from "~styles/settings.css?inline"

const adapter = new NotebookAdapter()
const manager = new OutlineManager(adapter, {
  ...DEFAULT_SETTINGS.features.outline,
  showUserQueries: true,
})
const prompts = new PromptManager(adapter)
const conversations = new ConversationManager(adapter)
const theme = ensureGlobalThemeManager({ mode: "light", adapter, apply: true })
const layout = new LayoutManager(
  adapter,
  getSitePageWidth(DEFAULT_SETTINGS, adapter.getSiteInstanceKey()),
)
const host = document.createElement("plasmo-csui")
const shadow = host.attachShadow({ mode: "open" })
const style = document.createElement("style")
style.textContent = `${themeCss}\n${mainCss}\n${conversationsCss}\n${settingsCss}\n.gh-main-panel { position: fixed !important; top: 80px !important; right: 8px !important; left: auto !important; transform: none !important; width: 340px !important; height: min(760px, calc(100vh - 100px)) !important; }`
shadow.append(style)
const mount = document.createElement("div")
mount.className = "gh-root"
shadow.append(mount)
document.body.append(host)

const noop = () => {}
function Fixture() {
  useShortcuts({
    settings: useSettingsStore.getState().settings,
    adapter,
    outlineManager: manager,
    conversationManager: conversations,
    onPanelToggle: noop,
    onThemeToggle: () => {
      void theme.toggle()
    },
    onOpenSettings: noop,
  })
  return (
    <>
      <MainPanel
        isOpen
        onClose={noop}
        promptManager={prompts}
        conversationManager={conversations}
        outlineManager={manager}
        adapter={adapter}
        onThemeToggle={() => {
          void theme.toggle()
        }}
      />
      <QuickButtons
        adapter={adapter}
        outlineManager={manager}
        isPanelExpanded={false}
        onPanelToggle={noop}
      />
    </>
  )
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
async function waitFor(predicate: () => boolean, message: string) {
  const deadline = performance.now() + 1500
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(message)
    await frame()
  }
}
const results: string[] = []
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
  results.push(message)
}

async function run() {
  results.length = 0
  const source = adapter.getOutlineScrollContainer("source")!
  const chat = adapter.getOutlineScrollContainer("conversation")!
  const studio = adapter.getOutlineScrollContainer("studio")!
  check(
    adapter
      .getOutlineSources()
      .map((s) => s.id)
      .join(",") === "source,conversation,studio",
    "Three permanent outline sources",
  )
  check(adapter.extractOutlineForSource("source").length === 4, "Source has four body headings")
  check(
    adapter.extractOutlineForSource("studio").length === 14,
    "Studio has fourteen report headings",
  )
  const queries = adapter.extractOutlineForSource("conversation", 6, true)
  check(
    queries.length === 2 && queries.every((item) => item.isUserQuery && item.level === 0),
    "Two user queries without duplicated ARIA headings",
  )
  check(
    adapter.extractOutlineForSource("conversation", 6, false).length === 0,
    "User query toggle excludes question headings",
  )
  check(
    !adapter.hasFeatureCapability("export-basic") &&
      !adapter.hasFeatureCapability("conversation-list"),
    "Unsupported site capabilities are absent",
  )
  check(
    adapter.getFeatureCapabilityPolicy() === "strict" && adapter.getEnhancementMode() === "minimal",
    "Strict capabilities and minimal host enhancements",
  )

  const sourceRoot = source.querySelector("labs-tailwind-doc-viewer")!
  const reportRoot = studio.querySelector("labs-tailwind-doc-viewer")!
  const added: Element[] = []
  for (const level of [4, 5, 6]) {
    const element = document.createElement("div")
    element.setAttribute("role", "heading")
    element.setAttribute("aria-level", String(level))
    element.textContent = `Fixture heading ${level}`
    sourceRoot.append(element)
    added.push(element)
  }
  check(
    adapter.extractOutlineForSource("source").length === 7,
    "ARIA heading levels four through six are supported",
  )
  const stable = adapter.extractOutlineForSource("source", 6).filter((i) => i.level <= 3)
  check(
    adapter
      .extractOutlineForSource("source", 3)
      .every((item, index) => item.id === stable[index].id),
    "Heading IDs remain stable across level filtering",
  )
  const duplicate = document.createElement("h2")
  duplicate.textContent = stable[1].text
  reportRoot.append(duplicate)
  const found = await adapter.resolveOutlineTarget(stable[1], undefined, "source")
  check(
    found === stable[1].element && !reportRoot.contains(found),
    "Heading lookup stays in its selected column",
  )
  duplicate.remove()
  added.forEach((element) => element.remove())

  const spacer = document.createElement("div")
  spacer.style.height = "1800px"
  sourceRoot.append(spacer)
  manager.setActiveSource("source")
  manager.refresh()
  const sourceContext = manager.getNavigationContext()!
  chat.scrollTo({ top: 140, behavior: "instant" })
  studio.scrollTo({ top: 210, behavior: "instant" })
  const chatTop = chat.scrollTop
  const studioTop = studio.scrollTop
  check(
    await navigateOutlineContext(() => manager.getNavigationContext(), "bottom"),
    "Source bottom navigation succeeds",
  )
  check(
    source.scrollTop > 0 && chat.scrollTop === chatTop && studio.scrollTop === studioTop,
    "Source navigation does not scroll other columns",
  )
  const bottom = source.scrollTop
  await navigateOutlineContext(() => manager.getNavigationContext(), "top")
  check(source.scrollTop === 0, "Source top navigation succeeds")
  await navigateOutlineContext(() => manager.getNavigationContext(), "anchor")
  check(source.scrollTop === bottom, "Source anchor restores the prior position")
  manager.setActiveSource("studio")
  check(
    anchorStore.get(manager.getNavigationContext()!.key) === null,
    "Studio does not inherit the source anchor",
  )
  manager.setActiveSource("source")
  const sourceParent = sourceRoot.parentElement!
  sourceRoot.remove()
  check(
    !(await navigateOutlineContext(() => manager.getNavigationContext(), "bottom")),
    "Closed source navigation fails explicitly",
  )
  check(
    chat.scrollTop === chatTop && studio.scrollTop === studioTop,
    "Closed source does not fall back to another column",
  )
  sourceParent.append(sourceRoot)
  const changed = document.createElement("p")
  changed.textContent = "Different document with the same headings"
  sourceRoot.append(changed)
  check(
    manager.getNavigationContext()!.key !== sourceContext.key,
    "Different document contents have isolated navigation contexts",
  )
  check(
    anchorStore.get(manager.getNavigationContext()!.key) === null,
    "Replacement document does not inherit an anchor",
  )
  changed.remove()
  spacer.remove()

  const editor = document.querySelector<HTMLTextAreaElement>("chat-panel query-box textarea")!
  let inputs = 0
  const onInput = () => inputs++
  editor.addEventListener("input", onInput)
  check(
    adapter.insertPrompt("Notebook 提示词\n第二行") &&
      editor.value === "Notebook 提示词\n第二行" &&
      inputs === 1,
    "Prompt insertion preserves multiline text and dispatches input",
  )
  editor.disabled = true
  check(!adapter.insertPrompt("blocked"), "Disabled input rejects insertion")
  editor.disabled = false
  check(!(await prompts.submitPrompt()), "Automatic prompt submission is disabled")
  editor.removeEventListener("input", onInput)
  editor.value = ""
  editor.blur()

  await theme.setMode("light")
  const light = getComputedStyle(document.querySelector("section.source-panel")!).backgroundColor
  await theme.setMode("dark")
  await frame()
  const dark = getComputedStyle(document.querySelector("section.source-panel")!).backgroundColor
  check(
    localStorage.getItem("bcsp") === "dark" && light !== dark,
    "Native theme changes color without reloading",
  )
  await theme.setMode("system")
  check(
    localStorage.getItem("bcsp") === "system" && adapter.detectHostThemePreference() === "system",
    "System theme preference is preserved",
  )
  await theme.setMode("light")

  manager.setActiveSource("conversation")
  manager.refresh()
  chat.scrollTo({ top: 0, behavior: "instant" })
  studio.scrollTo({ top: 0, behavior: "instant" })
  await frame()
  shadow.querySelector<HTMLButtonElement>("#gh-panel-tab-outline")?.click()
  await frame()
  check(
    shadow.querySelectorAll(".gh-panel-tab-btn").length === 2,
    "Main panel only exposes outline and prompt tabs",
  )
  const sourceTabs = [...shadow.querySelectorAll(".outline-source-switch button")]
  check(
    sourceTabs.length === 3 &&
      sourceTabs.every(
        (tab) => tab.getBoundingClientRect().top === sourceTabs[0].getBoundingClientRect().top,
      ),
    "Three source tabs share one row",
  )
  check(
    !shadow.querySelector('[aria-label="Export conversation"]'),
    "Outline export entry is hidden",
  )
  layout.startPanelAvoidance()
  await frame()
  await frame()
  const workspace = document.querySelector<HTMLElement>("notebook > .panel-container")!
  check(
    parseFloat(getComputedStyle(workspace).paddingRight) > 300,
    "Panel avoidance reserves space beside all three columns",
  )
  const nativeRight = document.querySelector("section.studio-panel")!.getBoundingClientRect().right
  const panelLeft = shadow.querySelector(".gh-main-panel")!.getBoundingClientRect().left
  check(nativeRight <= panelLeft, "Studio remains clear of the Ophel panel")
  await waitFor(
    () =>
      [...workspace.querySelectorAll(":scope > section")].every(
        (column) => column.getBoundingClientRect().width >= 285,
      ),
    "Column width transition did not settle",
  )
  check(
    [...workspace.querySelectorAll(":scope > section")].every(
      (column) => column.getBoundingClientRect().width >= 285,
    ),
    "Avoidance preserves readable column widths",
  )
  for (const sourceId of ["conversation", "studio"]) {
    manager.setActiveSource(sourceId)
    await frame()
    const other = sourceId === "studio" ? chat : studio
    const otherPosition = other.scrollTop
    const target = adapter.getOutlineScrollContainer(sourceId)!
    const bottomButton = [
      ...shadow.querySelectorAll<HTMLButtonElement>(".gh-panel-footer-action"),
    ].at(-1)!
    bottomButton.click()
    await frame()
    await frame()
    check(
      target.scrollTop > 0 && other.scrollTop === otherPosition,
      `Footer navigation follows ${sourceId} without moving the other column`,
    )
  }
  studio.scrollTop = 400
  shadow.querySelector<HTMLButtonElement>(".gh-panel-footer-action")!.click()
  await frame()
  check(studio.scrollTop === 0, "Footer top navigation targets Studio")
  getShortcutManager().trigger("goToAnchor")
  await frame()
  check(studio.scrollTop === 400, "Shortcut restores the anchor saved by the footer")
  const quickAnchor = shadow.querySelector<HTMLButtonElement>(
    ".quick-prompt-btn:has(.anchor-tap-wrapper)",
  )
  check(quickAnchor && !quickAnchor.disabled, "Quick button shares the selected column anchor")
  quickAnchor.click()
  await frame()
  check(studio.scrollTop === 0, "Quick anchor returns to the position saved by the shortcut")
  studio.scrollTop = 250
  getShortcutManager().trigger("scrollTop")
  await frame()
  check(studio.scrollTop === 0, "Shortcut top navigation targets the selected column")
  const pendingBottom = navigateOutlineContext(() => manager.getNavigationContext(), "bottom")
  const positionBeforeHeadingJump = studio.scrollTop
  const pendingSave = navigateOutlineContext(() => manager.getNavigationContext(), "save")
  studio.scrollTop = 0
  await Promise.all([pendingBottom, pendingSave])
  check(
    anchorStore.get(manager.getNavigationContext()!.key) === positionBeforeHeadingJump,
    "Heading jump captures its anchor before a pending navigation settles",
  )
  manager.setActiveSource("source")
  await frame()
  const remounted = sourceRoot.cloneNode(true) as HTMLElement
  const previousKey = manager.getNavigationContext()!.key
  manager.setActive(false)
  sourceRoot.replaceWith(remounted)
  await waitFor(
    () =>
      manager.getFlatItems().length === 4 &&
      manager.getFlatItems().every((item) => item.element && remounted.contains(item.element)),
    "Outline did not refresh after replacing the source DOM",
  )
  check(
    manager.getNavigationContext()!.key !== previousKey,
    "Remounted source gets a fresh navigation context",
  )
  check(
    manager.getFlatItems().length === 4,
    "Source observer refreshes after DOM remount while the outline is inactive",
  )
  remounted.replaceWith(sourceRoot)
  manager.setActive(true)
  const prompt = prompts.addPrompt({
    title: "Notebook fixture prompt",
    content: "离线提示词\n第二行",
    category: "",
  })
  shadow.querySelector<HTMLButtonElement>("#gh-panel-tab-prompts")!.click()
  await frame()
  await frame()
  check(
    shadow.querySelectorAll('.gh-prompt-library-switch [role="tab"]').length === 1,
    "Insert-only prompt UI hides the chain tab",
  )
  const card = [...shadow.querySelectorAll<HTMLElement>(".prompt-item")].find((item) =>
    item.textContent?.includes(prompt.title),
  )
  check(card, "Fixture prompt appears in the actual prompt library")
  card.click()
  await waitFor(
    () => editor.value === prompt.content,
    "Prompt card did not insert into the central textarea",
  )
  check(editor.value === prompt.content, "Prompt card inserts into the central conversation input")
  prompts.deletePrompt(prompt.id)
  editor.value = ""
  editor.blur()
  manager.setActiveSource("conversation")
  manager.refresh()
  shadow.querySelector<HTMLButtonElement>("#gh-panel-tab-outline")!.click()
  await frame()
  return { passed: results.length, checks: [...results], geometry: { nativeRight, panelLeft } }
}

const ready = (async () => {
  await initI18n()
  setLanguage("en")
  useSettingsStore.getState().setSettings({
    language: "en",
    hasAgreedToTerms: true,
    features: {
      ...DEFAULT_SETTINGS.features,
      prompts: {
        ...DEFAULT_SETTINGS.features.prompts,
        promptQueue: true,
        doubleClickToSend: true,
      },
    },
  })
  manager.refresh()
  createRoot(mount).render(<Fixture />)
  await frame()
  await frame()
  shadow.querySelector<HTMLButtonElement>("#gh-panel-tab-outline")?.click()
  await frame()
  return true
})()

Object.assign(window, {
  notebookVerification: { ready, run, adapter, manager, theme, layout, host, results },
})
