import React from "react"
import { createRoot } from "react-dom/client"

import { NotebookAdapter } from "~adapters/notebook"
import type { ExportLifecycleContext } from "~adapters/base"
import { SUPPORTED_AI_PLATFORMS, SITE_IDS } from "~constants/defaults"
import { outlineSourceMessages } from "~locales/outline-sources"
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
import { useConversationsStore } from "~stores/conversations-store"
import SiteSettingsPage from "~tabs/options/pages/SiteSettingsPage"
import {
  t as userscriptTranslate,
  setLanguage as setUserscriptLanguage,
} from "~platform/userscript/i18n"
import { DEFAULT_SETTINGS, getSitePageWidth, getSitePanelAvoidance } from "~utils/storage"
import { initI18n, setLanguage, t } from "~utils/i18n"
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
  check(
    manager.getActiveSourceId() === "conversation",
    "Notebook initially selects the conversation column",
  )
  const legacyLocales = await fetch(chrome.runtime.getURL("assets/locales/messages.json")).then(
    (response) => response.json(),
  )
  check(
    !legacyLocales.en.outlineSourceSources && !legacyLocales["zh-CN"].outlineSourceStudio,
    "Fixture reproduces an older external language resource",
  )
  Object.assign(window, {
    GM_getResourceText: () => JSON.stringify({ outlineSourceConversation: "Chat" }),
  })
  for (const [language, messages] of Object.entries(outlineSourceMessages)) {
    setLanguage(language)
    setUserscriptLanguage(language)
    check(
      t("outlineSourceSources") === messages.outlineSourceSources &&
        t("outlineSourceStudio") === messages.outlineSourceStudio,
      `Extension labels survive old language resources: ${language}`,
    )
    check(
      userscriptTranslate("outlineSourceSources") === messages.outlineSourceSources &&
        userscriptTranslate("outlineSourceStudio") === messages.outlineSourceStudio,
      `Userscript labels survive old language resources: ${language}`,
    )
  }
  setLanguage("zh-CN")
  manager.refresh(undefined, true)
  check(
    adapter
      .getOutlineSources()
      .map((item) => item.label)
      .join(",") === "来源,对话,工作台",
    "Notebook source labels render in Chinese",
  )
  setLanguage("en")
  manager.refresh(undefined, true)
  const enterpriseIndex = SUPPORTED_AI_PLATFORMS.findIndex(
    (site) => site.id === SITE_IDS.GEMINI_ENTERPRISE,
  )
  check(
    SUPPORTED_AI_PLATFORMS[enterpriseIndex + 1].id === SITE_IDS.NOTEBOOK,
    "Notebook follows Gemini Enterprise in the built-in catalog",
  )
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
    adapter.hasFeatureCapability("export-basic") &&
      !adapter.hasFeatureCapability("conversation-list"),
    "Current-column export is enabled without conversation management",
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
    [...shadow.querySelectorAll("button[aria-label]")].some(
      (button) => button.getAttribute("aria-label") === t("exportConversationTitle"),
    ),
    "Outline export entry is available",
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
  const quickGroup = shadow.querySelector<HTMLElement>(".quick-btn-group")!
  quickGroup.dispatchEvent(new MouseEvent("mouseenter"))
  await waitFor(() => {
    const button = shadow.querySelector<HTMLButtonElement>(
      ".quick-prompt-btn:has(.anchor-tap-wrapper)",
    )
    return Boolean(button && !button.disabled)
  }, "Quick navigation did not expand on hover")
  const quickAnchor = shadow.querySelector<HTMLButtonElement>(
    ".quick-prompt-btn:has(.anchor-tap-wrapper)",
  )
  check(quickAnchor && !quickAnchor.disabled, "Quick button shares the selected column anchor")
  quickAnchor.click()
  await frame()
  check(studio.scrollTop === 0, "Quick anchor returns to the position saved by the shortcut")
  quickGroup.dispatchEvent(new MouseEvent("mouseleave"))
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
  const context = (sourceId: string): ExportLifecycleContext => ({
    conversationId: adapter.getSessionId(),
    format: "markdown",
    packaging: "markdown",
    includeThoughts: false,
    sourceId,
  })
  const beforeExport = [sourceRoot.outerHTML, reportRoot.outerHTML, chat.outerHTML]
  const chatContext = context("conversation")
  await adapter.prepareConversationExport(chatContext)
  const chatMessages = await adapter.extractExportMessages(chatContext)
  check(
    chatMessages.length === 4 &&
      chatMessages[0].role === "user" &&
      chatMessages[1].role === "assistant",
    "Conversation export preserves the two user/assistant turns",
  )
  const chatBody = chatMessages.map((message) => message.content).join("\n")
  check(
    chatBody.includes("不要急于反驳") && chatBody.includes("以引导代替强加"),
    "Conversation export preserves wrapped list items",
  )
  check(
    !chatBody.includes("我是一级标题") &&
      !chatBody.includes("五维说话术：基于权力流动的沟通核心框架解析"),
    "Conversation export excludes the source and Studio columns",
  )
  await adapter.restoreConversationAfterExport(chatContext)

  const sourceContextForExport = context("source")
  await adapter.prepareConversationExport(sourceContextForExport)
  const lateParagraph = document.createElement("p")
  lateParagraph.textContent = "Added after export started"
  sourceRoot.append(lateParagraph)
  const sourceMessages = await adapter.extractExportMessages(sourceContextForExport)
  lateParagraph.remove()
  check(
    sourceMessages.length === 1 && sourceMessages[0].content.includes("# 我是一级标题"),
    "Source export preserves semantic heading levels",
  )
  check(
    !sourceMessages[0].content.includes(lateParagraph.textContent),
    "Export snapshots are fixed before later DOM changes",
  )
  check(
    !sourceMessages[0].content.includes("不要急于反驳"),
    "Source export excludes conversation messages",
  )
  await adapter.restoreConversationAfterExport(sourceContextForExport)

  const sourceParentForExport = sourceRoot.parentElement!
  sourceRoot.remove()
  const closedSourceContext = context("source")
  await adapter.prepareConversationExport(closedSourceContext)
  check(
    (await adapter.extractExportMessages(closedSourceContext)).length === 0,
    "Closed source export never falls back to conversation content",
  )
  await adapter.restoreConversationAfterExport(closedSourceContext)
  sourceParentForExport.append(sourceRoot)

  const studioContext = context("studio")
  await adapter.prepareConversationExport(studioContext)
  const studioMessages = await adapter.extractExportMessages(studioContext)
  const report = studioMessages[0].content
  check(
    (report.match(/^#{1,6} /gm) ?? []).length === 14,
    "Studio export preserves all fourteen report headings",
  )
  check(
    (report.match(/^\s*(?:-|\d+\.) /gm) ?? []).length === 35,
    "Studio export preserves all thirty-five report list items",
  )
  check(
    (report.match(/^\| /gm) ?? []).length === 7,
    "Studio export preserves the header and five table data rows",
  )
  await adapter.restoreConversationAfterExport(studioContext)
  check(
    beforeExport[0] === sourceRoot.outerHTML &&
      beforeExport[1] === reportRoot.outerHTML &&
      beforeExport[2] === chat.outerHTML,
    "Export conversion leaves the live page unchanged",
  )

  let copiedExport = ""
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (content: string) => {
        copiedExport = content
      },
    },
  })
  const storedConversations = Object.keys(useConversationsStore.getState().conversations).length
  const positions = [source.scrollTop, chat.scrollTop, studio.scrollTop]
  check(
    await conversations.exportConversation(adapter.getSessionId(), "clipboard", {
      sourceId: "source",
    }),
    "Full export pipeline accepts the source column",
  )
  check(
    copiedExport.includes("我是一级标题") && !copiedExport.includes("不要急于反驳"),
    "Full source export contains only its own body",
  )
  check(
    await conversations.exportConversation(adapter.getSessionId(), "clipboard", {
      sourceId: "studio",
    }),
    "Full export pipeline accepts the Studio column",
  )
  check(
    copiedExport.includes("核心破局思维") && !copiedExport.includes("我是一级标题"),
    "Full Studio export contains only its own body",
  )
  check(
    await conversations.exportConversation(adapter.getSessionId(), "clipboard", {
      sourceId: "conversation",
    }),
    "Full export pipeline accepts the conversation column",
  )
  check(
    copiedExport.includes("不要急于反驳") && !copiedExport.includes("我是一级标题"),
    "Full conversation export contains only its own turns",
  )
  check(
    [source.scrollTop, chat.scrollTop, studio.scrollTop].every(
      (position, index) => position === positions[index],
    ),
    "Column exports preserve all native scroll positions",
  )
  check(
    Object.keys(useConversationsStore.getState().conversations).length === storedConversations,
    "Notebook export does not create conversation-list records",
  )

  const originalPath = location.pathname
  manager.setActiveSource("studio")
  history.replaceState(null, "", "/notebook/offline-fixture-next")
  manager.handleUrlChange()
  check(
    manager.getActiveSourceId() === "conversation",
    "Opening another notebook resets the selected column to conversation",
  )
  history.replaceState(null, "", originalPath)
  manager.handleUrlChange()

  const settingsMount = document.createElement("div")
  shadow.append(settingsMount)
  const settingsRoot = createRoot(settingsMount)
  settingsRoot.render(
    <SiteSettingsPage
      siteId={SITE_IDS.NOTEBOOK}
      siteInstanceKey={adapter.getSiteInstanceKey()}
      adapter={adapter}
    />,
  )
  await frame()
  await frame()
  const avoidanceToggle = settingsMount.querySelector<HTMLInputElement>(
    '[data-setting-id="layout-panel-avoidance-enabled"] input[type="checkbox"]',
  )
  check(avoidanceToggle, "Notebook settings expose the panel-avoidance switch")
  const initialToggle = avoidanceToggle.checked
  const defaultAvoidance = getSitePanelAvoidance(
    useSettingsStore.getState().settings,
    "_default",
  ).enabled
  avoidanceToggle.click()
  await frame()
  check(
    avoidanceToggle.checked !== initialToggle &&
      getSitePanelAvoidance(useSettingsStore.getState().settings, SITE_IDS.NOTEBOOK).enabled ===
        avoidanceToggle.checked,
    "Notebook avoidance switch changes its saved setting",
  )
  check(
    getSitePanelAvoidance(useSettingsStore.getState().settings, "_default").enabled ===
      defaultAvoidance,
    "Notebook avoidance setting leaves other sites' default unchanged",
  )
  avoidanceToggle.click()
  await frame()
  settingsRoot.unmount()
  settingsMount.remove()
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
  notebookVerification: { ready, run, adapter, manager, theme, layout, host, results, setLanguage },
})
