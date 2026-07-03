/**
 * Gemini 标准版适配器 (gemini.google.com)
 */
import { bindDomTooltip, type DomTooltipBinding } from "~components/ui/Tooltip"
import {
  DOWNLOAD_ICON_ARROW_PATH,
  DOWNLOAD_ICON_CHEVRON_PATH,
  DOWNLOAD_ICON_TRAY_PATH,
} from "~components/icons/DownloadIcon"
import { SITE_IDS } from "~constants"
import {
  extractHeadingOutline,
  findHeadingByText,
  findScrollableAncestor,
  scrollElementInContainer,
} from "~core/outline/dom-outline"
import { platform } from "~platform"
import { geminiNativeThemeCss } from "~styles/native-theme-adapters/gemini"
import { DOMToolkit } from "~utils/dom-toolkit"
import {
  extractConversationTitleFromDocumentTitle,
  GEMINI_NATIVE_TAB_TITLE_ATTR,
  GEMINI_NATIVE_TAB_TITLE_PATH_ATTR,
} from "~utils/conversation-title"
import {
  buildMarkdownFilename,
  createMarkdownDocumentAssetLink,
  extractMarkdownTitle,
  type ExportAssetCollector,
} from "~utils/export-assets"
import {
  createUniqueExportAssetPath,
  copyToClipboard,
  downloadFile,
  ensureUtf8Bom,
  EXPORT_MARKDOWN_HREF_ATTR,
  htmlToMarkdown,
  type ExportAsset,
  type ExportBundle,
  type ExportMessage,
} from "~utils/exporter"
import { t } from "~utils/i18n"
import {
  createCopyIcon,
  createSVGElement,
  createOpenInNewTabIcon,
  showCopySuccess,
} from "~utils/icons"
import {
  EVENT_GEMINI_MYSTUFF_CACHE_SYNC,
  EVENT_GEMINI_MYSTUFF_SYNC_REQUEST,
  type GeminiMyStuffCachePayload,
  type GeminiMyStuffKind,
  type GeminiMyStuffRecord,
} from "~utils/messaging"
import { loadCompleteHistoryForExport } from "~utils/history-loader"
import { SKIP_READING_HISTORY_RESTORE_PARAM } from "~utils/storage"
import { hashTextForCache } from "~utils/text-hash"
import { showToast } from "~utils/toast"
import { setSafeHTML } from "~utils/trusted-types"

import {
  GEMINI_CANVAS_CODE_REQUEST_EVENT,
  GEMINI_CANVAS_CODE_RESPONSE_EVENT,
} from "~core/gemini-canvas-code-bridge"
import { WatermarkRemover } from "~core/watermark-remover"
import {
  SiteAdapter,
  type ConversationDeleteTarget,
  type ConversationInfo,
  type ConversationObserverConfig,
  type ExportConfig,
  type ExportLifecycleContext,
  type MarkdownFixerConfig,
  type ModelSwitcherConfig,
  type NetworkMonitorConfig,
  type OutlineItem,
  type OutlineSource,
  type PanelAvoidanceConfig,
  type SiteDeleteConversationResult,
} from "./base"

const GEMINI_DELETE_REASON = {
  UI_FAILED: "delete_ui_failed",
  UI_EXCEPTION: "delete_ui_exception",
  BATCH_ABORTED_AFTER_UI_FAILURE: "delete_batch_aborted_after_ui_failure",
} as const

const GEMINI_DELETE_KEYWORDS = [
  "delete",
  "remove",
  "删除",
  "删掉",
  "supprimer",
  "eliminar",
  "löschen",
  "삭제",
  "削除",
  "移除",
  "excluir",
  "hapus",
  "удал",
]

const GEMINI_CANCEL_KEYWORDS = [
  "cancel",
  "取消",
  "annuler",
  "abbrechen",
  "취소",
  "キャンセル",
  "batal",
  "отмен",
]

const GEMINI_EXPORT_IMAGE_SRC_ATTR = "data-ophel-export-image-src"
const GEMINI_EMAIL_REGEX = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
const GEMINI_ACCOUNT_HINT_REGEX =
  /(google|account|账号|帳號|conta|compte|cuenta|konto|アカウント|계정|учет)/i
const GEMINI_UNAVAILABLE_SHARED_FILE_HINT_REGEX =
  /(unable|cannot|can't|can not|无法|無法|不可).*(view|preview|download|共享|分享|shared|查看|预览|預覽|下载|下載)|shared.*(file|download|preview)|共享对话中的文件|共享對話中的文件/i
const GEMINI_EXPORT_IMAGE_SCOPE_SELECTOR = [
  ".attachment-container.generated-images",
  "response-element",
  "generated-image",
  "single-image.generated-image",
  ".image-container.replace-fife-images-at-export",
  "[data-image-attachment-index]",
].join(", ")
const GEMINI_USER_QUERY_IMAGE_SELECTOR = [
  "user-query img[data-test-id='uploaded-img']",
  "user-query .preview-image",
].join(", ")
const GEMINI_UPLOADED_FILE_SELECTOR = '[data-test-id="uploaded-file"]'
const GEMINI_SHARE_TURN_SELECTOR = "share-landing-page .share-turn-viewer"
const GEMINI_SHARE_ASSISTANT_MARKDOWN_SELECTOR = "message-content .markdown"
const GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_SELECTOR =
  'share-landing-page immersive-share-landing-page structured-content-container[data-test-id="deep-research-block"]'
const GEMINI_DEEP_RESEARCH_ARTIFACT_SHARE_SELECTOR =
  'share-landing-page structured-content-container[data-test-id="immersive-artifact-content"]'
const GEMINI_DEEP_RESEARCH_MARKDOWN_SELECTOR = GEMINI_SHARE_ASSISTANT_MARKDOWN_SELECTOR
const GEMINI_DEEP_RESEARCH_CONFIRMATION_SELECTOR = "deep-research-confirmation-widget"
const GEMINI_DEEP_RESEARCH_IMMERSIVE_PANEL_SELECTOR =
  "immersive-panel deep-research-immersive-panel"
const GEMINI_DEEP_RESEARCH_PANEL_MARKDOWN_SELECTOR =
  "#extended-response-markdown-content, message-content .markdown"
const GEMINI_DEEP_RESEARCH_APP_DOCUMENT_MARKDOWN_SELECTOR = [
  `${GEMINI_DEEP_RESEARCH_IMMERSIVE_PANEL_SELECTOR} #extended-response-markdown-content`,
  `${GEMINI_DEEP_RESEARCH_IMMERSIVE_PANEL_SELECTOR} message-content .markdown`,
].join(", ")
const GEMINI_DEEP_RESEARCH_APP_DOCUMENT_TRIGGER_SELECTOR =
  'model-response [data-test-id="gem-processing-card"], model-response immersive-entry-chip'
const GEMINI_DEEP_RESEARCH_ICON_SELECTOR = [
  'mat-icon[data-mat-icon-name="travel_explore"]',
  'mat-icon[fonticon="travel_explore"]',
].join(", ")
const GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_FOOTER_SELECTOR =
  'share-landing-page immersive-share-landing-page .page:has(structured-content-container[data-test-id="deep-research-block"]) > .footer'
const GEMINI_CANVAS_CODE_ICON_SELECTOR = [
  'mat-icon[fonticon="code_blocks"]',
  'mat-icon[data-mat-icon-name="code_blocks"]',
].join(", ")
const GEMINI_CANVAS_DOCUMENT_ICON_SELECTOR = [
  'mat-icon[fonticon="article"]',
  'mat-icon[data-mat-icon-name="article"]',
].join(", ")
const GEMINI_CANVAS_CARD_SELECTOR = '[data-test-id="gem-processing-card"]'
const GEMINI_CANVAS_CODE_IMMERSIVE_PANEL_SELECTOR = "immersive-panel code-immersive-panel"
const GEMINI_CANVAS_DOCUMENT_IMMERSIVE_PANEL_SELECTOR =
  "immersive-panel extended-response-panel:has(canvas-create-button)"
const GEMINI_CANVAS_IMMERSIVE_PANEL_SELECTOR = [
  GEMINI_CANVAS_CODE_IMMERSIVE_PANEL_SELECTOR,
  GEMINI_CANVAS_DOCUMENT_IMMERSIVE_PANEL_SELECTOR,
].join(", ")
const GEMINI_CANVAS_SHARE_ARTIFACT_SELECTOR = "share-landing-page .immersive-artifact-container"
const GEMINI_CANVAS_CODE_TAB_SELECTOR = 'mat-button-toggle[value="code"]'
const GEMINI_CANVAS_TAB_GROUP_SELECTOR = "mat-button-toggle-group.tab-group"
const GEMINI_CANVAS_CODE_BLOCK_SELECTOR = "code-block"
const GEMINI_CANVAS_CODE_EDITOR_SELECTOR = 'xap-code-editor[data-test-id="code-editor"]'
const GEMINI_CANVAS_DOCUMENT_MARKDOWN_SELECTOR = [
  "#extended-response-markdown-content .ProseMirror",
  'immersive-editor[data-test-id="immersive-editor"] .ProseMirror',
  "immersive-editor .ProseMirror",
  "#extended-response-markdown-content",
].join(", ")
const GEMINI_CANVAS_CODE_REQUEST_TIMEOUT_MS = 900
const GEMINI_PANEL_MARKDOWN_ACTIONS_CLASS = "gh-gemini-panel-markdown-actions"
const GEMINI_PANEL_MARKDOWN_ACTION_CLASS = "gh-gemini-panel-markdown-action"
const GEMINI_PANEL_MARKDOWN_ACTIONS_STYLE_ID = "gh-gemini-panel-markdown-actions-style"
const GEMINI_DEEP_RESEARCH_PANEL_ACTIONS_ATTR = "data-ophel-deep-research-panel-actions"
const GEMINI_CANVAS_PANEL_ACTIONS_ATTR = "data-ophel-canvas-panel-actions"
const GEMINI_DOCUMENT_OUTLINE_SOURCE_ID = "document"
const GEMINI_ASSISTANT_EXPORT_NOISE_SELECTOR = [
  ".cdk-visually-hidden",
  "model-thoughts",
  "immersive-entry-chip",
  "gem-processing-card",
  '[data-test-id="gem-processing-card"]',
  '[data-test-id="time-estimation-message"]',
  ".time-estimation-message",
  "source-footnote",
  "sources-carousel-inline",
  "sources-carousel",
  ".gh-inline-bookmark",
  ".gh-table-copy-btn",
  "mat-icon",
  "share-button",
  "copy-button",
  "download-generated-image-button",
  ".generated-image-controls",
  ".loader",
].join(", ")
const GEMINI_DECORATIVE_IMAGE_SELECTOR = [
  "img.katex-svg",
  "img.favicon",
  "img.google-icon",
  'img[data-test-id="favicon"]',
  'img[data-test-id="file-icon"]',
  'img[data-test-id="luminous-file-icon"]',
  'img[src*="faviconV2"]',
  'img[src*="drive-thirdparty.googleusercontent.com/32/type/"]',
  'img[src*="google_logo_icon"]',
].join(", ")

interface GeminiMyStuffLocator {
  kind: GeminiMyStuffKind
  status?: number
  timestamp?: number
  timestampNano?: number
  title?: string
  thumbnailUrl?: string
}

interface GeminiMyStuffEnhancerOptions {
  getUserPathPrefix: () => string
}

interface GeminiExportLifecycleState {
  openedDeepResearchPanel: boolean
}

interface GeminiExportAssetCollector extends ExportAssetCollector {
  imagePathsBySource: Map<string, string>
  filePathsBySource: Map<string, string>
}

interface GeminiCanvasCodeArtifact {
  title: string
  language: string
  code: string
}

const GEMINI_MYSTUFF_ACTIVE_CLASS = "ophel-gemini-mystuff-active"
const GEMINI_MYSTUFF_STYLE_ID = "ophel-gemini-mystuff-style"
const GEMINI_MYSTUFF_OPEN_BUTTON_CLASS = "ophel-mystuff-open-btn"
const GEMINI_MYSTUFF_OPEN_BUTTON_ATTR = "data-ophel-mystuff-open"
const GEMINI_MYSTUFF_OPEN_BUTTON_SUPPRESS_ATTR = "data-ophel-mystuff-open-suppress"
const GEMINI_MYSTUFF_SYNC_TIMEOUT_MS = 12000
const GEMINI_MYSTUFF_ROUTE_EVENT = "gh-url-change"
const GEMINI_GOOGLEUSERCONTENT_HOST_REGEX = /^https:\/\/lh\d+\.googleusercontent\.com\//i
const GEMINI_MYSTUFF_TOOLTIP_DELAY_MS = 300
const GEMINI_CHATS_EXPANDABLE_SECTION_SELECTOR =
  'expandable-section[data-test-id="chats-expandable-section"]'
const GEMINI_CHATS_EXPANDABLE_SECTION_FALLBACK_SELECTOR = 'expandable-section[storagekey="chats"]'
const GEMINI_CONVERSATION_ITEM_SELECTOR = 'gem-nav-list-item[data-test-id="conversation"]'
const GEMINI_MARKDOWN_FIXER_SOURCE_ATTRIBUTE_KEYWORDS = [
  "source",
  "sources",
  "citation",
  "citations",
  "reference",
  "references",
  "grounding",
  "footnote",
  "link",
  "fonte",
  "fontes",
  "fuente",
  "fuentes",
  "quelle",
  "quellen",
  "referencia",
  "referencias",
  "referência",
  "referências",
  "riferimento",
  "riferimenti",
  "来源",
  "引用",
  "链接",
  "出典",
  "参照",
  "출처",
  "참조",
  "источник",
  "источники",
  "ссылка",
  "ссылки",
]
const GEMINI_MARKDOWN_FIXER_SOURCE_SELECTOR = [
  "source-chip",
  "source-card",
  "source-footnote",
  "citation-source",
  "citation-chip",
  "citation-marker",
  "grounding-chip",
  "grounding-source",
  "web-source",
  "[data-source]",
  "[data-source-id]",
  "[data-citation]",
  "[data-citation-id]",
  "[data-ved]",
  "[decode-data-ved]",
  "[cdkoverlayorigin]",
  "[mattooltip]",
  "[data-mdc-tooltip]",
  "mat-icon[fonticon]",
  "mat-icon[data-mat-icon-name]",
  "[fonticon*='link' i]",
  "[data-mat-icon-name*='link' i]",
  "sup a",
  "sup button",
  "sup [role='button']",
  ...GEMINI_MARKDOWN_FIXER_SOURCE_ATTRIBUTE_KEYWORDS.flatMap((keyword) => [
    `[aria-label*='${keyword}' i]`,
    `[title*='${keyword}' i]`,
    `[data-test-id*='${keyword}' i]`,
  ]),
].join(",")
const GEMINI_LAYOUT_SCOPE_SELECTOR = "bard-sidenav-content"
const GEMINI_MESSAGE_WIDTH_SELECTOR = ".conversation-container"
const GEMINI_MESSAGE_SAFE_AREA_SELECTOR = "infinite-scroller.chat-history"
const GEMINI_INPUT_WIDTH_SELECTOR = ".input-area-container"
const GEMINI_INPUT_SAFE_AREA_SELECTOR = "input-container"

class GeminiMyStuffEnhancer {
  private started = false
  private tooltipBindings = new WeakMap<HTMLElement, DomTooltipBinding>()
  private pendingRequests = new Map<
    string,
    {
      resolve: (payload: GeminiMyStuffCachePayload) => void
      reject: (reason?: unknown) => void
      timeoutId: ReturnType<typeof setTimeout>
    }
  >()
  private recordsByKind = {
    media: new Map<string, GeminiMyStuffRecord>(),
    document: new Map<string, GeminiMyStuffRecord>(),
  }
  private mediaByTimestamp = new Map<number, GeminiMyStuffRecord[]>()
  private mediaByThumbnail = new Map<string, GeminiMyStuffRecord[]>()
  private documentByTimestamp = new Map<number, GeminiMyStuffRecord[]>()
  private documentByTitle = new Map<string, GeminiMyStuffRecord[]>()

  constructor(private readonly options: GeminiMyStuffEnhancerOptions) {}

  start(): void {
    if (this.started) return
    this.started = true

    this.injectStyles()
    DOMToolkit.each(".library-item-card", (element) => this.enhanceMediaCard(element), {
      shadow: true,
    })

    document.addEventListener("click", this.handleDocumentClick, true)
    window.addEventListener("message", this.handleWindowMessage)
    window.addEventListener(GEMINI_MYSTUFF_ROUTE_EVENT, this.handleRouteChange)

    this.refreshForCurrentRoute(false)
    setTimeout(() => this.refreshForCurrentRoute(false), 600)
    setTimeout(() => this.refreshForCurrentRoute(false), 1500)
  }

  private readonly handleRouteChange = () => {
    this.refreshForCurrentRoute(false)
  }

  private readonly handleWindowMessage = (event: MessageEvent) => {
    const { type, payload } = event.data || {}

    if (event.source !== window && type !== EVENT_GEMINI_MYSTUFF_CACHE_SYNC) {
      return
    }

    if (type !== EVENT_GEMINI_MYSTUFF_CACHE_SYNC) return
    this.handleCachePayload(payload as GeminiMyStuffCachePayload | undefined)
  }

  private readonly handleDocumentClick = (event: MouseEvent) => {
    if (!this.isMyStuffPath() || event.defaultPrevented || event.button !== 0) {
      return
    }

    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const actionButton = target.closest(
      `[${GEMINI_MYSTUFF_OPEN_BUTTON_ATTR}="1"]`,
    ) as HTMLElement | null
    if (actionButton) {
      const mediaHost = actionButton.closest("library-item-card")
      if (!mediaHost) return
      this.preventNativeNavigation(event)
      this.dismissActionButtonVisualState(actionButton)
      void this.openHostInNewTab(mediaHost, "media", this.preparePendingTab())
      return
    }

    if (target.closest("library-item-card")) {
      // 媒体卡本体点击交回 Gemini 原生逻辑处理
      return
    }

    const documentHost = target.closest("library-list-item")
    if (documentHost) {
      this.preventNativeNavigation(event)
      void this.openHostInNewTab(documentHost, "document", this.preparePendingTab())
    }
  }

  private preventNativeNavigation(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  private refreshForCurrentRoute(force: boolean): void {
    const active = this.isMyStuffPath()
    document.documentElement.classList.toggle(GEMINI_MYSTUFF_ACTIVE_CLASS, active)

    if (!active) return

    this.enhanceExistingMediaCards()
    void this.requestSync(force, this.getKindsForCurrentPath()).catch(() => {
      // 点击时会再强制拉一次，这里静默即可
    })
  }

  private injectStyles(): void {
    if (document.getElementById(GEMINI_MYSTUFF_STYLE_ID)) return

    const style = document.createElement("style")
    style.id = GEMINI_MYSTUFF_STYLE_ID
    style.textContent = `
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} library-item-card .library-item-card,
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .library-item-card-container {
        position: relative;
      }

      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS} {
        position: absolute;
        top: 4px;
        right: 42px;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        background: rgba(15, 23, 42, 0.45);
        color: #ffffff;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
        backdrop-filter: blur(6px);
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-2px);
        transition:
          opacity 0.18s ease,
          transform 0.18s ease,
          background-color 0.18s ease,
          color 0.18s ease;
        z-index: 3;
      }

      .${GEMINI_MYSTUFF_ACTIVE_CLASS} library-item-card:hover .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} library-item-card:focus-within .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .library-item-card:hover .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .library-item-card:focus-within .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .library-item-card-container:hover .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .library-item-card-container:focus-within .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS} {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }

      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS}:hover {
        background: rgba(15, 23, 42, 0.60);
        color: #ffffff;
      }

      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS}[${GEMINI_MYSTUFF_OPEN_BUTTON_SUPPRESS_ATTR}="1"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-2px) !important;
      }

      .${GEMINI_MYSTUFF_ACTIVE_CLASS} .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS} svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      body.dark-theme .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      html[dark-theme] .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS},
      html.dark .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS} {
        background: rgba(15, 23, 42, 0.45);
        color: #f9fafb;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
      }

      body.dark-theme .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS}:hover,
      html[dark-theme] .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS}:hover,
      html.dark .${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS}:hover {
        background: rgba(15, 23, 42, 0.60);
        color: #ffffff;
      }

    `
    document.head.appendChild(style)
  }

  private enhanceExistingMediaCards(): void {
    document
      .querySelectorAll(".library-item-card")
      .forEach((element) => this.enhanceMediaCard(element))
  }

  private enhanceMediaCard(element: Element): void {
    if (!this.isMyStuffPath()) return

    const host = element.closest("library-item-card")
    const card = (
      element.matches(".library-item-card") ? element : element.querySelector(".library-item-card")
    ) as HTMLElement | null
    if (!host || !card) return

    const existingButton = card.querySelector(
      `[${GEMINI_MYSTUFF_OPEN_BUTTON_ATTR}="1"]`,
    ) as HTMLElement | null
    if (existingButton) return

    const button = document.createElement("button")
    button.type = "button"
    button.className = `${GEMINI_MYSTUFF_OPEN_BUTTON_CLASS} ophel-tooltip-trigger`
    button.setAttribute(GEMINI_MYSTUFF_OPEN_BUTTON_ATTR, "1")
    button.setAttribute("aria-label", this.getOpenInNewTabLabel())
    button.appendChild(createOpenInNewTabIcon())

    card.appendChild(button)
    this.tooltipBindings.set(
      button,
      bindDomTooltip(button, {
        getContent: () => this.getOpenInNewTabLabel(),
        delay: GEMINI_MYSTUFF_TOOLTIP_DELAY_MS,
        maxWidth: 260,
        preferredPlacement: "top",
      }),
    )
  }

  private isMyStuffPath(): boolean {
    const path = this.getNormalizedPath()
    return (
      path === "/mystuff" ||
      path === "/mystuff/" ||
      path.startsWith("/mystuff/") ||
      path === "/library" ||
      path === "/library/" ||
      path.startsWith("/library/")
    )
  }

  private getKindsForCurrentPath(): GeminiMyStuffKind[] {
    const path = this.getNormalizedPath()
    if (path.startsWith("/mystuff/documents") || path.startsWith("/library/documents")) {
      return ["document"]
    }
    return ["media", "document"]
  }

  private getNormalizedPath(): string {
    return window.location.pathname.replace(/^\/u\/\d+/, "")
  }

  private handleCachePayload(payload: GeminiMyStuffCachePayload | undefined): void {
    if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.kinds)) return

    this.replaceRecords(payload.kinds, payload.items)

    const pending = payload.requestId ? this.pendingRequests.get(payload.requestId) : null
    if (!pending || !payload.requestId) return

    clearTimeout(pending.timeoutId)
    this.pendingRequests.delete(payload.requestId)
    pending.resolve(payload)
  }

  private replaceRecords(kinds: GeminiMyStuffKind[], items: GeminiMyStuffRecord[]): void {
    for (const kind of kinds) {
      this.recordsByKind[kind].clear()
      items
        .filter((item) => item.kind === kind)
        .forEach((item) => this.recordsByKind[kind].set(this.getRecordKey(item), item))
    }

    this.rebuildIndexes()
  }

  private rebuildIndexes(): void {
    this.mediaByTimestamp.clear()
    this.mediaByThumbnail.clear()
    this.documentByTimestamp.clear()
    this.documentByTitle.clear()

    this.recordsByKind.media.forEach((record) => {
      this.pushIndex(this.mediaByTimestamp, record.timestamp, record)
      const thumbnailKey = this.normalizeThumbnailUrl(record.thumbnailUrl)
      if (thumbnailKey) {
        this.pushIndex(this.mediaByThumbnail, thumbnailKey, record)
      }
    })

    this.recordsByKind.document.forEach((record) => {
      this.pushIndex(this.documentByTimestamp, record.timestamp, record)
      const titleKey = this.normalizeTitle(record.title)
      if (titleKey) {
        this.pushIndex(this.documentByTitle, titleKey, record)
      }
    })
  }

  private pushIndex<Key extends string | number>(
    index: Map<Key, GeminiMyStuffRecord[]>,
    key: Key | null | undefined,
    record: GeminiMyStuffRecord,
  ): void {
    if (key === null || key === undefined || key === "" || key === 0) return
    const current = index.get(key) || []
    current.push(record)
    index.set(key, current)
  }

  private async requestSync(
    force: boolean,
    kinds: GeminiMyStuffKind[],
  ): Promise<GeminiMyStuffCachePayload> {
    const requestId = `ophel-mystuff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const payload = {
      requestId,
      force,
      kinds,
    }

    const requestPromise = new Promise<GeminiMyStuffCachePayload>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error("mystuff-sync-timeout"))
      }, GEMINI_MYSTUFF_SYNC_TIMEOUT_MS)

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      })
    })

    window.postMessage(
      {
        type: EVENT_GEMINI_MYSTUFF_SYNC_REQUEST,
        payload,
      },
      "*",
    )

    return requestPromise
  }

  private preparePendingTab(): Window | null {
    if (platform.type !== "userscript") {
      return null
    }

    return window.open("about:blank", "_blank")
  }

  private async openHostInNewTab(
    host: Element,
    kind: GeminiMyStuffKind,
    pendingTab: Window | null,
  ): Promise<void> {
    const record = await this.resolveRecord(host, kind)
    if (!record) {
      if (pendingTab && !pendingTab.closed) {
        pendingTab.close()
      }
      console.warn("[GeminiAdapter][MyStuff] record not found for host", {
        kind,
        locator: this.extractLocator(host, kind),
      })
      showToast(t("geminiMystuffLocateFailed"), 2500)
      return
    }

    const targetUrl = this.buildRecordUrl(record)
    if (pendingTab && !pendingTab.closed) {
      pendingTab.location.href = targetUrl
      return
    }

    platform.openTab(targetUrl)
  }

  private async resolveRecord(
    host: Element,
    kind: GeminiMyStuffKind,
  ): Promise<GeminiMyStuffRecord | null> {
    const locator = this.extractLocator(host, kind)
    let record = this.findRecord(locator)
    if (record) return record

    try {
      await this.requestSync(true, [kind])
    } catch (error) {
      console.warn("[GeminiAdapter][MyStuff] sync failed before open", {
        kind,
        error,
      })
    }

    record = this.findRecord(locator)
    return record
  }

  private extractLocator(host: Element, kind: GeminiMyStuffKind): GeminiMyStuffLocator {
    const jslogHost =
      (host.closest("[jslog]") as HTMLElement | null) ||
      (host.querySelector("[jslog]") as HTMLElement | null)
    const jslog = jslogHost?.getAttribute("jslog") || ""
    const jslogMeta = this.extractJslogMeta(jslog)

    return {
      kind,
      status: jslogMeta?.status,
      timestamp: jslogMeta?.timestamp,
      timestampNano: jslogMeta?.timestampNano,
      title: kind === "document" ? this.extractTitle(host) : undefined,
      thumbnailUrl: kind === "media" ? this.extractThumbnailUrl(host) : undefined,
    }
  }

  private extractJslogMeta(
    jslog: string,
  ): { status?: number; timestamp?: number; timestampNano?: number } | null {
    if (!jslog) return null

    const matches = Array.from(jslog.matchAll(/\[(\d+),\[(\d+)(?:,(\d+))?\]\]/g))
    const lastMatch = matches[matches.length - 1]
    if (!lastMatch) return null

    return {
      status: Number(lastMatch[1]),
      timestamp: Number(lastMatch[2]),
      timestampNano: lastMatch[3] ? Number(lastMatch[3]) : undefined,
    }
  }

  private extractTitle(host: Element): string {
    const titleElement = host.querySelector(".title, .gds-title-m, .text-content .title")
    return titleElement?.textContent?.trim() || ""
  }

  private extractThumbnailUrl(host: Element): string {
    const image = host.querySelector("img")
    if (!(image instanceof HTMLImageElement)) return ""
    return this.normalizeThumbnailUrl(image.currentSrc || image.src || "")
  }

  private normalizeTitle(value?: string): string {
    return (value || "").trim().replace(/\s+/g, " ").toLowerCase()
  }

  private normalizeThumbnailUrl(value?: string): string {
    if (!value) return ""

    let normalized = value
    try {
      normalized = new URL(value, window.location.href).toString()
    } catch {
      normalized = value
    }

    if (!GEMINI_GOOGLEUSERCONTENT_HOST_REGEX.test(normalized)) {
      return normalized
    }

    return normalized.replace(/=[^/?#]+$/, "")
  }

  private findRecord(locator: GeminiMyStuffLocator): GeminiMyStuffRecord | null {
    if (locator.kind === "media") {
      return this.findMediaRecord(locator)
    }
    return this.findDocumentRecord(locator)
  }

  private findMediaRecord(locator: GeminiMyStuffLocator): GeminiMyStuffRecord | null {
    const candidates = new Map<string, GeminiMyStuffRecord>()
    const thumbnailKey = this.normalizeThumbnailUrl(locator.thumbnailUrl)

    if (thumbnailKey) {
      for (const record of this.mediaByThumbnail.get(thumbnailKey) || []) {
        candidates.set(this.getRecordKey(record), record)
      }
    }

    if (locator.timestamp) {
      for (const record of this.mediaByTimestamp.get(locator.timestamp) || []) {
        candidates.set(this.getRecordKey(record), record)
      }
    }

    return this.pickBestRecord(Array.from(candidates.values()), locator)
  }

  private findDocumentRecord(locator: GeminiMyStuffLocator): GeminiMyStuffRecord | null {
    const candidates = new Map<string, GeminiMyStuffRecord>()
    const titleKey = this.normalizeTitle(locator.title)

    if (locator.timestamp) {
      for (const record of this.documentByTimestamp.get(locator.timestamp) || []) {
        candidates.set(this.getRecordKey(record), record)
      }
    }

    if (titleKey) {
      for (const record of this.documentByTitle.get(titleKey) || []) {
        candidates.set(this.getRecordKey(record), record)
      }
    }

    return this.pickBestRecord(Array.from(candidates.values()), locator)
  }

  private pickBestRecord(
    candidates: GeminiMyStuffRecord[],
    locator: GeminiMyStuffLocator,
  ): GeminiMyStuffRecord | null {
    if (candidates.length === 0) return null

    const thumbnailKey = this.normalizeThumbnailUrl(locator.thumbnailUrl)
    const titleKey = this.normalizeTitle(locator.title)

    const scored = candidates
      .map((record) => {
        let score = 0

        if (locator.status !== undefined && record.status === locator.status) {
          score += 20
        }

        if (locator.timestamp !== undefined && record.timestamp === locator.timestamp) {
          score += 80
        }

        if (thumbnailKey && this.normalizeThumbnailUrl(record.thumbnailUrl) === thumbnailKey) {
          score += 200
        }

        if (titleKey && this.normalizeTitle(record.title) === titleKey) {
          score += 120
        }

        if (locator.timestampNano !== undefined) {
          score -= Math.min(
            Math.abs((record.timestampNano || 0) - locator.timestampNano) / 1_000_000,
            20,
          )
        }

        return { record, score }
      })
      .sort((left, right) => right.score - left.score)

    return scored[0]?.record || null
  }

  private buildRecordUrl(record: GeminiMyStuffRecord): string {
    const conversationId = record.conversationId.replace(/^c_/, "")
    const responseId = record.responseId.replace(/^r_/, "")
    const targetUrl = new URL(
      `${window.location.origin}${this.options.getUserPathPrefix()}/app/${conversationId}`,
    )
    targetUrl.searchParams.set(SKIP_READING_HISTORY_RESTORE_PARAM, "1")
    targetUrl.hash = responseId
    return targetUrl.toString()
  }

  private getRecordKey(record: Pick<GeminiMyStuffRecord, "conversationId" | "responseId">): string {
    return `${record.conversationId}:${record.responseId}`
  }

  private getOpenInNewTabLabel(): string {
    return t("geminiMystuffOpenInNewTab")
  }

  private dismissActionButtonVisualState(button: HTMLElement): void {
    this.tooltipBindings.get(button)?.hide()
    button.blur()
    button.setAttribute(GEMINI_MYSTUFF_OPEN_BUTTON_SUPPRESS_ATTR, "1")

    const release = () => {
      button.removeAttribute(GEMINI_MYSTUFF_OPEN_BUTTON_SUPPRESS_ATTR)
      window.removeEventListener("pointermove", release, true)
      window.removeEventListener("pointerdown", release, true)
      window.removeEventListener("keydown", release, true)
      window.removeEventListener("wheel", release, true)
      window.removeEventListener("touchstart", release, true)
      button.removeEventListener("focus", release, true)
    }

    window.addEventListener("pointermove", release, true)
    window.addEventListener("pointerdown", release, true)
    window.addEventListener("keydown", release, true)
    window.addEventListener("wheel", release, true)
    window.addEventListener("touchstart", release, true)
    button.addEventListener("focus", release, true)
  }
}

interface GeminiOutlineWordCountCacheEntry {
  signature: string
  count: number
}

export class GeminiAdapter extends SiteAdapter {
  private cachedAccountEmail: string | null = null
  private accountEmailLastDetectAt = 0
  private myStuffEnhancer: GeminiMyStuffEnhancer | null = null
  private deepResearchPanelWatchStop: (() => void) | null = null
  private deepResearchPanelObservers = new WeakMap<Element, () => void>()
  private deepResearchPanelTooltipBindings = new WeakMap<HTMLElement, DomTooltipBinding>()
  private canvasPanelWatchStop: (() => void) | null = null
  private canvasPanelObservers = new WeakMap<Element, () => void>()
  private canvasPanelTooltipBindings = new WeakMap<HTMLElement, DomTooltipBinding>()
  private exportOpenedCanvasPanel = false
  private outlineWordCountCache = new WeakMap<Element, GeminiOutlineWordCountCacheEntry>()

  private getUserPathPrefix(): string {
    // Gemini 多账号路径格式：/u/2/app/...
    const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
    // - 若当前 URL 本身没有 /u/ 前缀：保持空前缀（生成 /app/...）
    // - 若带 /u/n ：使用 /u/n
    if (!match) return ""
    const idx = match[1]
    return `/u/${idx}`
  }

  getCurrentCid(): string {
    // 新逻辑：优先使用当前 Google 账号邮箱作为稳定标识（跨浏览器一致）
    const accountEmail = this.getCurrentAccountEmail()
    if (accountEmail) return accountEmail

    // 兼容兜底：若暂时无法提取邮箱，回退到旧版 /u/<n> 索引
    const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/)
    return match ? match[1] : "0"
  }

  private getCurrentAccountEmail(): string | null {
    const now = Date.now()
    // 缓存命中（含空值）时短暂复用，减少频繁 DOM 扫描
    if (now - this.accountEmailLastDetectAt < 2000) {
      return this.cachedAccountEmail
    }
    this.accountEmailLastDetectAt = now

    const attrs = ["aria-label", "title", "data-email", "data-identifier"] as const
    const selectors = [
      "[data-email]",
      '[data-identifier*="@"]',
      '[aria-label*="@"]',
      '[title*="@"]',
    ]

    const nodes = new Set<Element>()
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => nodes.add(el))
    })

    for (const node of nodes) {
      for (const attr of attrs) {
        const value = node.getAttribute(attr)
        const email = this.extractEmailFromAttr(attr, value)
        if (email) {
          this.cachedAccountEmail = email
          return email
        }
      }
    }

    return this.cachedAccountEmail
  }

  private startDeepResearchPanelActions(): void {
    if (this.deepResearchPanelWatchStop) return

    this.injectGeminiPanelMarkdownActionStyles()
    this.deepResearchPanelWatchStop = DOMToolkit.each(
      GEMINI_DEEP_RESEARCH_IMMERSIVE_PANEL_SELECTOR,
      (panel) => this.watchDeepResearchPanel(panel),
      { shadow: true },
    )
  }

  private startGeminiCanvasPanelActions(): void {
    if (this.canvasPanelWatchStop) return

    this.injectGeminiPanelMarkdownActionStyles()
    this.canvasPanelWatchStop = DOMToolkit.each(
      GEMINI_CANVAS_IMMERSIVE_PANEL_SELECTOR,
      (panel) => this.watchGeminiCanvasPanel(panel),
      { shadow: true },
    )
  }

  private watchDeepResearchPanel(panel: Element): void {
    this.syncDeepResearchPanelActions(panel)
    if (this.deepResearchPanelObservers.has(panel)) return

    let stop: (() => void) | null = null
    stop = DOMToolkit.watch(
      panel,
      () => {
        if (!panel.isConnected) {
          stop?.()
          this.deepResearchPanelObservers.delete(panel)
          return
        }
        this.syncDeepResearchPanelActions(panel)
      },
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-busy"],
        debounce: 100,
      },
    )
    this.deepResearchPanelObservers.set(panel, stop)
  }

  private watchGeminiCanvasPanel(panel: Element): void {
    this.syncGeminiCanvasPanelActions(panel)
    if (this.canvasPanelObservers.has(panel)) return

    let stop: (() => void) | null = null
    stop = DOMToolkit.watch(
      panel,
      () => {
        if (!panel.isConnected) {
          stop?.()
          this.canvasPanelObservers.delete(panel)
          return
        }
        this.syncGeminiCanvasPanelActions(panel)
      },
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-checked", "data-mode-id"],
        debounce: 100,
      },
    )
    this.canvasPanelObservers.set(panel, stop)
  }

  private injectGeminiPanelMarkdownActionStyles(): void {
    DOMToolkit.css(
      `
        .${GEMINI_PANEL_MARKDOWN_ACTIONS_CLASS} {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          margin-inline-end: 4px;
        }

        .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS} {
          width: 40px;
          height: 40px;
          border: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: transparent;
          color: var(--bard-color-on-surface-variant, #5f6368);
          cursor: pointer;
          transition:
            background-color 0.16s ease,
            color 0.16s ease,
            opacity 0.16s ease;
        }

        .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:hover:not(:disabled),
        .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:focus-visible:not(:disabled) {
          background: rgba(60, 64, 67, 0.08);
          color: var(--bard-color-on-surface, #202124);
          outline: none;
        }

        .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:disabled {
          cursor: default;
          opacity: 0.38;
        }

        .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS} svg {
          width: 18px;
          height: 18px;
          stroke: currentColor;
        }

        body.dark-theme .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS},
        html.dark .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS},
        html[dark-theme] .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS} {
          color: rgba(232, 234, 237, 0.86);
        }

        body.dark-theme .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:hover:not(:disabled),
        body.dark-theme .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:focus-visible:not(:disabled),
        html.dark .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:hover:not(:disabled),
        html.dark .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:focus-visible:not(:disabled),
        html[dark-theme] .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:hover:not(:disabled),
        html[dark-theme] .${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}:focus-visible:not(:disabled) {
          background: rgba(232, 234, 237, 0.12);
          color: #ffffff;
        }
      `,
      GEMINI_PANEL_MARKDOWN_ACTIONS_STYLE_ID,
    )
  }

  private syncDeepResearchPanelActions(panel: Element): void {
    const markdown = this.getDeepResearchPanelMarkdownElement(panel)
    const toolbarActions = panel.querySelector("toolbar .action-buttons")
    if (!(toolbarActions instanceof HTMLElement) || !markdown) {
      this.removeDeepResearchPanelActions(panel)
      return
    }

    const existing = panel.querySelector(
      `[${GEMINI_DEEP_RESEARCH_PANEL_ACTIONS_ATTR}="1"]`,
    ) as HTMLElement | null
    if (existing) {
      this.updateDeepResearchPanelActionDisabledState(panel)
      return
    }

    const actions = this.createDeepResearchPanelActions(panel)
    const exportButton = toolbarActions.querySelector('[data-test-id="export-menu-button"]')
    if (exportButton?.parentElement === toolbarActions) {
      toolbarActions.insertBefore(actions, exportButton)
    } else {
      toolbarActions.prepend(actions)
    }

    this.updateDeepResearchPanelActionDisabledState(panel)
  }

  private syncGeminiCanvasPanelActions(panel: Element): void {
    const toolbarActions = panel.querySelector("toolbar .action-buttons")
    if (
      !(toolbarActions instanceof HTMLElement) ||
      !this.hasGeminiCanvasPanelExportSurface(panel)
    ) {
      this.removeGeminiCanvasPanelActions(panel)
      return
    }

    const existing = panel.querySelector(
      `[${GEMINI_CANVAS_PANEL_ACTIONS_ATTR}="1"]`,
    ) as HTMLElement | null
    if (existing) {
      this.updateGeminiCanvasPanelActionDisabledState(panel)
      return
    }

    const actions = this.createGeminiCanvasPanelActions(panel)
    const downloadButton = toolbarActions.querySelector('[data-test-id="download-preview-button"]')
    if (downloadButton?.parentElement === toolbarActions) {
      toolbarActions.insertBefore(actions, downloadButton)
    } else {
      toolbarActions.prepend(actions)
    }

    this.updateGeminiCanvasPanelActionDisabledState(panel)
  }

  private removeDeepResearchPanelActions(panel: Element): void {
    panel.querySelectorAll(`[${GEMINI_DEEP_RESEARCH_PANEL_ACTIONS_ATTR}="1"]`).forEach((node) => {
      node.querySelectorAll(`.${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}`).forEach((button) => {
        if (button instanceof HTMLElement) {
          this.deepResearchPanelTooltipBindings.get(button)?.destroy()
        }
      })
      node.remove()
    })
  }

  private removeGeminiCanvasPanelActions(panel: Element): void {
    panel.querySelectorAll(`[${GEMINI_CANVAS_PANEL_ACTIONS_ATTR}="1"]`).forEach((node) => {
      node.querySelectorAll(`.${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}`).forEach((button) => {
        if (button instanceof HTMLElement) {
          this.canvasPanelTooltipBindings.get(button)?.destroy()
        }
      })
      node.remove()
    })
  }

  private createDeepResearchPanelActions(panel: Element): HTMLElement {
    const actions = document.createElement("div")
    actions.className = GEMINI_PANEL_MARKDOWN_ACTIONS_CLASS
    actions.setAttribute(GEMINI_DEEP_RESEARCH_PANEL_ACTIONS_ATTR, "1")

    const copyButton = this.createGeminiPanelMarkdownActionButton(
      "copy",
      this.deepResearchPanelTooltipBindings,
    )
    const downloadButton = this.createGeminiPanelMarkdownActionButton(
      "download",
      this.deepResearchPanelTooltipBindings,
    )

    copyButton.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.copyDeepResearchPanelMarkdown(panel, copyButton)
    })

    downloadButton.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.downloadDeepResearchPanelMarkdown(panel)
    })

    actions.append(copyButton, downloadButton)
    return actions
  }

  private createGeminiCanvasPanelActions(panel: Element): HTMLElement {
    const actions = document.createElement("div")
    actions.className = GEMINI_PANEL_MARKDOWN_ACTIONS_CLASS
    actions.setAttribute(GEMINI_CANVAS_PANEL_ACTIONS_ATTR, "1")

    const copyButton = this.createGeminiPanelMarkdownActionButton(
      "copy",
      this.canvasPanelTooltipBindings,
    )
    const downloadButton = this.createGeminiPanelMarkdownActionButton(
      "download",
      this.canvasPanelTooltipBindings,
    )

    copyButton.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.copyGeminiCanvasPanelMarkdown(panel, copyButton)
    })

    downloadButton.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      void this.downloadGeminiCanvasPanelMarkdown(panel)
    })

    actions.append(copyButton, downloadButton)
    return actions
  }

  private createGeminiPanelMarkdownActionButton(
    action: "copy" | "download",
    tooltipBindings: WeakMap<HTMLElement, DomTooltipBinding>,
  ): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.className = GEMINI_PANEL_MARKDOWN_ACTION_CLASS
    button.setAttribute("aria-label", this.getGeminiPanelMarkdownActionLabel(action))
    button.title = this.getGeminiPanelMarkdownActionLabel(action)
    button.appendChild(
      action === "copy"
        ? createCopyIcon({ size: 18 })
        : this.createGeminiPanelMarkdownDownloadIcon(),
    )

    const binding = bindDomTooltip(button, {
      getContent: () => this.getGeminiPanelMarkdownActionLabel(action),
      preferredPlacement: "bottom",
    })
    tooltipBindings.set(button, binding)

    return button
  }

  private createGeminiPanelMarkdownDownloadIcon(): SVGSVGElement {
    const svg = createSVGElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }) as SVGSVGElement

    ;[DOWNLOAD_ICON_ARROW_PATH, DOWNLOAD_ICON_CHEVRON_PATH, DOWNLOAD_ICON_TRAY_PATH].forEach(
      (path) => {
        svg.appendChild(createSVGElement("path", { d: path }))
      },
    )

    return svg
  }

  private getGeminiPanelMarkdownActionLabel(action: "copy" | "download"): string {
    if (action === "copy") {
      return t("exportToClipboard")
    }
    return `${t("webdavDownloadBtn")} ${t("exportToMarkdown")}`
  }

  private updateDeepResearchPanelActionDisabledState(panel: Element): void {
    const hasContent = this.hasDeepResearchPanelContent(panel)
    panel.querySelectorAll(`.${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}`).forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = !hasContent
      }
    })
  }

  private updateGeminiCanvasPanelActionDisabledState(panel: Element): void {
    const hasContent = this.hasGeminiCanvasPanelExportSurface(panel)
    panel.querySelectorAll(`.${GEMINI_PANEL_MARKDOWN_ACTION_CLASS}`).forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = !hasContent
      }
    })
  }

  private async copyDeepResearchPanelMarkdown(panel: Element, button: HTMLElement): Promise<void> {
    const content = this.getDeepResearchPanelMarkdown(panel)
    if (!content) {
      showToast(t("exportNoContent"))
      return
    }

    const copied = await copyToClipboard(content)
    if (!copied) {
      showToast(t("copyFailed"))
      return
    }

    showCopySuccess(button, { size: 18 })
    showToast(t("copySuccess"))
  }

  private async downloadDeepResearchPanelMarkdown(panel: Element): Promise<void> {
    const content = this.getDeepResearchPanelMarkdown(panel)
    if (!content) {
      showToast(t("exportNoContent"))
      return
    }

    const downloaded = await downloadFile(
      ensureUtf8Bom(content),
      buildMarkdownFilename(
        this.getDeepResearchPanelTitle(panel) ||
          extractMarkdownTitle(content, "deep-research-report"),
        "deep-research-report",
      ),
      "text/markdown;charset=utf-8",
    )
    if (downloaded) {
      showToast(t("exportSuccess"))
    }
  }

  private async copyGeminiCanvasPanelMarkdown(panel: Element, button: HTMLElement): Promise<void> {
    const content = await this.getGeminiCanvasPanelMarkdown(panel)
    if (!content) {
      showToast(t("exportNoContent"))
      return
    }

    const copied = await copyToClipboard(content)
    if (!copied) {
      showToast(t("copyFailed"))
      return
    }

    showCopySuccess(button, { size: 18 })
    showToast(t("copySuccess"))
  }

  private async downloadGeminiCanvasPanelMarkdown(panel: Element): Promise<void> {
    const content = await this.getGeminiCanvasPanelMarkdown(panel)
    if (!content) {
      showToast(t("exportNoContent"))
      return
    }

    const downloaded = await downloadFile(
      ensureUtf8Bom(content),
      buildMarkdownFilename(
        this.getGeminiCanvasPanelTitle(panel) || extractMarkdownTitle(content, "gemini-canvas"),
        "gemini-canvas",
      ),
      "text/markdown;charset=utf-8",
    )
    if (downloaded) {
      showToast(t("exportSuccess"))
    }
  }

  private getDeepResearchPanelMarkdown(panel: Element): string {
    const markdown = this.getDeepResearchPanelMarkdownElement(panel)
    return markdown ? this.extractAssistantResponseTextWithAssets(markdown).trim() : ""
  }

  private async getGeminiCanvasPanelMarkdown(panel: Element): Promise<string> {
    return (
      await this.extractGeminiCanvasArtifactMarkdown(
        panel,
        this.getGeminiCanvasPanelTitle(panel) || "Gemini Canvas",
      )
    ).trim()
  }

  private hasDeepResearchPanelContent(panel: Element): boolean {
    const markdown = this.getDeepResearchPanelMarkdownElement(panel)
    return Boolean(markdown?.textContent?.trim())
  }

  private hasGeminiCanvasPanelExportSurface(panel: Element): boolean {
    return (
      this.getGeminiCanvasDocumentMarkdownElement(panel) !== null ||
      this.findGeminiCanvasCodeBlock(panel) !== null ||
      panel.querySelector(GEMINI_CANVAS_CODE_EDITOR_SELECTOR) !== null ||
      this.findGeminiCanvasCodeTab(panel) !== null
    )
  }

  private getDeepResearchPanelMarkdownElement(panel: Element): Element | null {
    const candidates = Array.from(
      panel.querySelectorAll(GEMINI_DEEP_RESEARCH_PANEL_MARKDOWN_SELECTOR),
    )
    return candidates.find((candidate) => candidate.closest("thinking-panel") === null) || null
  }

  private getDeepResearchPanelTitle(panel: Element): string | null {
    const toolbarTitle = this.getNormalizedText(panel.querySelector("toolbar h2.title-text"))
    if (toolbarTitle) return toolbarTitle

    const heading = this.getNormalizedText(
      this.getDeepResearchPanelMarkdownElement(panel)?.querySelector("h1"),
    )
    return heading || null
  }

  private getGeminiCanvasPanelTitle(panel: Element): string | null {
    const title = this.getNormalizedText(panel.querySelector("toolbar h2.title-text, .title-text"))
    return title || null
  }

  private extractEmailFromAttr(
    attr: "aria-label" | "title" | "data-email" | "data-identifier",
    value: string | null | undefined,
  ): string | null {
    if (!value) return null

    if (attr === "data-email" || attr === "data-identifier") {
      return this.extractEmail(value)
    }

    // aria/title 可能来自普通内容，限定为账号语义后再提取邮箱，避免误识别正文邮箱
    if (!GEMINI_ACCOUNT_HINT_REGEX.test(value)) return null
    return this.extractEmail(value)
  }

  private extractEmail(value: string | null | undefined): string | null {
    if (!value) return null
    const match = value.match(GEMINI_EMAIL_REGEX)
    if (!match) return null
    return match[1].toLowerCase()
  }

  match(): boolean {
    return (
      window.location.hostname.includes("gemini.google") &&
      !window.location.hostname.includes("business.gemini.google")
    )
  }

  getSiteId(): string {
    return SITE_IDS.GEMINI
  }

  getName(): string {
    return "Gemini"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#4285f4", secondary: "#34a853" }
  }

  getNativeThemeCss(): string | null {
    return geminiNativeThemeCss
  }

  getNewTabUrl(): string {
    return `https://gemini.google.com${this.getUserPathPrefix()}/app`
  }

  isNewConversation(): boolean {
    const path = window.location.pathname.replace(/^\/u\/\d+/, "")
    // 普通新对话
    if (path === "/app" || path === "/app/") return true
    // Gem 相关页面：创建、编辑、使用 gem 新对话
    if (path === "/gems/create" || path === "/gems/create/") return true
    if (path.startsWith("/gems/edit/")) return true
    // /gem/{gem_id} 是使用 gem 新对话，/gem/{gem_id}/{session_id} 是已有对话
    if (path.startsWith("/gem/")) {
      const parts = path.split("/").filter(Boolean) // ["gem", "gem_id"] 或 ["gem", "gem_id", "session_id"]
      return parts.length <= 2 // 只有 gem_id，没有 session_id
    }
    return false
  }

  isUserConversationPage(): boolean {
    const path = window.location.pathname.replace(/^\/u\/\d+(?=\/)/, "")
    return (
      !this.isSharePage() &&
      (/^\/app\/[^/?#]+(?:\/|$)/i.test(path) || /^\/gem\/[^/?#]+\/[^/?#]+(?:\/|$)/i.test(path))
    )
  }

  // ==================== 会话管理 ====================

  getConversationList(): ConversationInfo[] {
    const items =
      (DOMToolkit.query(GEMINI_CONVERSATION_ITEM_SELECTOR, {
        all: true,
      }) as Element[]) || []
    const cid = this.getCurrentCid()
    const prefix = this.getUserPathPrefix()
    return Array.from(items)
      .map((el) => {
        // 新版侧边栏：jslog 在内部 <a> 上，标题在 .title-text 中
        const anchor = el.querySelector("a")
        const jslog = anchor?.getAttribute("jslog") || el.getAttribute("jslog") || ""
        const idMatch = jslog.match(/\["c_([^"]+)"/)
        const id = idMatch ? idMatch[1] : ""
        const title = el.querySelector(".title-text")?.textContent?.trim() || ""
        const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]')
        const isActive = anchor?.classList.contains("mdc-list-item--activated") || false

        return {
          id,
          cid,
          title,
          url: id ? `https://gemini.google.com${prefix}/app/${id}` : "",
          isActive,
          isPinned,
        }
      })
      .filter((c) => c.id)
  }

  getSidebarScrollContainer(): Element | null {
    // Gemini 正文聊天也使用 infinite-scroller，必须限定在侧边栏会话区域内查找。
    return this.getChatsScrollableContainer()
  }

  async loadAllConversations(): Promise<boolean> {
    const sectionReady = await this.ensureChatsExpandableSectionOpen()
    if (!sectionReady) return false

    let container = this.getSidebarScrollContainer() as HTMLElement | null
    if (!container) return false

    let lastCount = this.getLoadedGeminiConversationCount()
    let lastScrollHeight = container.scrollHeight
    let lastProgressAt = Date.now()
    const startedAt = Date.now()
    const maxDurationMs = 90000
    const idleAfterProgressMs = 4000
    const minRounds = 6
    const waitMs = 900

    for (let round = 0; Date.now() - startedAt < maxDurationMs; round++) {
      container = this.getSidebarScrollContainer() as HTMLElement | null
      if (!container) break

      this.scrollGeminiConversationHistoryToBottom(container)
      await this.sleep(waitMs)

      const currentCount = this.getLoadedGeminiConversationCount()
      const currentScrollHeight = container.scrollHeight
      const isLoading = this.isConversationHistoryLoading()
      const hasProgress =
        currentCount > lastCount || currentScrollHeight > lastScrollHeight || isLoading

      if (currentCount > lastCount || currentScrollHeight > lastScrollHeight) {
        lastCount = currentCount
        lastScrollHeight = Math.max(lastScrollHeight, currentScrollHeight)
        lastProgressAt = Date.now()
      }

      if (isLoading) {
        lastProgressAt = Date.now()
      }

      const isIdle = !hasProgress && Date.now() - lastProgressAt >= idleAfterProgressMs
      if (round >= minRounds && isIdle) {
        return currentCount > 0
      }
    }

    return false
  }

  private async ensureChatsExpandableSectionOpen(timeout = 2500): Promise<boolean> {
    if (this.getConversationList().length > 0) return true

    const section = this.getChatsExpandableSection()
    if (!section) return false

    section.click()

    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (this.getConversationList().length > 0) return true
      await this.sleep(100)
    }

    return this.getConversationList().length > 0
  }

  private getChatsExpandableSection(): HTMLElement | null {
    const selectors = [
      GEMINI_CHATS_EXPANDABLE_SECTION_SELECTOR,
      GEMINI_CHATS_EXPANDABLE_SECTION_FALLBACK_SELECTOR,
    ]

    for (const selector of selectors) {
      const section = document.querySelector(selector)
      if (section instanceof HTMLElement) return section
    }

    const conversationList = document.querySelector(
      'conversations-list[data-test-id="all-conversations"]',
    )
    const section = conversationList?.closest("expandable-section")
    if (section instanceof HTMLElement) return section

    const firstExpandableSection = document.getElementsByTagName("expandable-section")[0]
    return firstExpandableSection instanceof HTMLElement ? firstExpandableSection : null
  }

  private isConversationHistoryLoading(): boolean {
    const loadingSpinner = document.querySelector('[data-test-id="loading-history-spinner"]')
    return loadingSpinner instanceof HTMLElement && this.isVisible(loadingSpinner)
  }

  private getLoadedGeminiConversationCount(): number {
    const conversations =
      (DOMToolkit.query(GEMINI_CONVERSATION_ITEM_SELECTOR, {
        all: true,
        shadow: true,
      }) as Element[]) || []

    return conversations.length
  }

  private scrollGeminiConversationHistoryToBottom(container: HTMLElement): void {
    const targetTop = Math.max(container.scrollHeight, container.scrollTop + container.clientHeight)

    container.scrollTop = targetTop
    container.scrollTo?.({ top: targetTop, behavior: "auto" })
    container.dispatchEvent(new Event("scroll", { bubbles: true, composed: true }))
    container.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: Math.max(600, container.clientHeight * 2),
      }),
    )
  }

  private getChatsScrollableContainer(): Element | null {
    const anchor = document.querySelector(
      [
        'conversations-list[data-test-id="all-conversations"]',
        GEMINI_CHATS_EXPANDABLE_SECTION_SELECTOR,
        GEMINI_CHATS_EXPANDABLE_SECTION_FALLBACK_SELECTOR,
        GEMINI_CONVERSATION_ITEM_SELECTOR,
      ].join(","),
    )
    if (!(anchor instanceof HTMLElement)) return null

    let current: HTMLElement | null = anchor
    let closestInfiniteScroller: HTMLElement | null = null
    while (current && current !== document.body) {
      if (!closestInfiniteScroller && current.tagName.toLowerCase() === "infinite-scroller") {
        closestInfiniteScroller = current
      }

      const style = window.getComputedStyle(current)
      const canScroll =
        /(auto|scroll|overlay)/i.test(style.overflowY) || current.classList.contains("chat-history")
      if (canScroll && current.scrollHeight > current.clientHeight) {
        return current
      }
      current = current.parentElement
    }

    return closestInfiniteScroller
  }

  getConversationObserverConfig(): ConversationObserverConfig {
    return {
      selector: 'gem-nav-list-item[data-test-id="conversation"]',
      shadow: false,
      extractInfo: (el) => {
        // 新版侧边栏：jslog 在内部 <a> 上，标题在 .title-text 中
        const anchor = el.querySelector("a")
        const jslog = anchor?.getAttribute("jslog") || el.getAttribute("jslog") || ""
        const idMatch = jslog.match(/\["c_([^"]+)"/)
        const id = idMatch ? idMatch[1] : ""
        if (!id) return null
        const title = el.querySelector(".title-text")?.textContent?.trim() || ""
        const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]')
        const cid = this.getCurrentCid()
        const prefix = this.getUserPathPrefix()
        return {
          id,
          cid,
          title,
          url: `https://gemini.google.com${prefix}/app/${id}`,
          isPinned,
        }
      },
      getTitleElement: (el) => el.querySelector(".title-text") || el,
    }
  }

  navigateToConversation(id: string, url?: string): boolean {
    // 新版侧边栏：通过 jslog 属性在内部 <a> 上查找会话元素
    const anchor = document.querySelector(
      `gem-nav-list-item[data-test-id="conversation"] a[jslog*="${id}"]`,
    ) as HTMLElement | null
    if (anchor) {
      anchor.click()
      return true
    }
    // 降级：页面刷新
    return super.navigateToConversation(id, url)
  }

  async deleteConversationOnSite(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    const result = await this.deleteConversationOnSiteInternal(target)
    if (result.success) {
      this.scheduleFullReloadAfterDelete([target.id])
    }
    return result
  }

  async deleteConversationsOnSite(
    targets: ConversationDeleteTarget[],
  ): Promise<SiteDeleteConversationResult[]> {
    const results: SiteDeleteConversationResult[] = []
    const deletedIds: string[] = []

    for (let index = 0; index < targets.length; index++) {
      const result = await this.deleteConversationOnSiteInternal(targets[index])
      results.push(result)

      if (result.success) {
        deletedIds.push(targets[index].id)
      }

      // Stop the remaining batch when UI deletion fails once,
      // to prevent accidental wrong-item deletions.
      if (!result.success && result.reason === GEMINI_DELETE_REASON.UI_FAILED) {
        for (let i = index + 1; i < targets.length; i++) {
          results.push({
            id: targets[i].id,
            success: false,
            method: "none",
            reason: GEMINI_DELETE_REASON.BATCH_ABORTED_AFTER_UI_FAILURE,
          })
        }
        break
      }
    }

    if (deletedIds.length > 0) {
      this.scheduleFullReloadAfterDelete(deletedIds)
    }

    return results
  }

  private async deleteConversationOnSiteInternal(
    target: ConversationDeleteTarget,
  ): Promise<SiteDeleteConversationResult> {
    try {
      const uiSuccess = await this.deleteConversationViaUi(target.id)
      return {
        id: target.id,
        success: uiSuccess,
        method: uiSuccess ? "ui" : "none",
        reason: uiSuccess ? undefined : GEMINI_DELETE_REASON.UI_FAILED,
      }
    } catch (error) {
      console.error(
        `[GeminiAdapter] deleteConversationOnSiteInternal error for "${target.id}":`,
        error,
      )
      return {
        id: target.id,
        success: false,
        method: "none",
        reason: GEMINI_DELETE_REASON.UI_EXCEPTION,
      }
    }
  }

  private async deleteConversationViaUi(id: string): Promise<boolean> {
    const row = await this.findConversationRowWithRetry(id)
    if (!row) return false

    row.scrollIntoView({ block: "center", behavior: "auto" })
    this.revealConversationActions(row)

    let menuButton = await this.findConversationMenuButton(row)
    if (!menuButton) return false

    const menuRoot = await this.openConversationMenu(row, menuButton)
    if (!menuRoot) return false

    const deleteItem = await this.waitForDeleteMenuItem(menuButton, 2500, menuRoot)
    if (!deleteItem) {
      document.body.click()
      return false
    }
    this.simulateClick(deleteItem)

    const dialogOpened = await this.waitForDialogOpen(2200)
    if (!dialogOpened) return false

    const confirmButton = await this.waitForDeleteConfirmButton(2800)
    if (!confirmButton) return false
    this.simulateClick(confirmButton)

    const removed = await this.waitForConversationRemoved(id, 4500)
    const dialogClosed = await this.waitForDialogClosed(1200)
    const success = removed || dialogClosed
    if (success) {
      this.syncConversationListAfterDelete(id)
    }
    return success
  }

  private async openConversationMenu(
    row: HTMLElement,
    initialTrigger: HTMLElement,
  ): Promise<HTMLElement | null> {
    let trigger: HTMLElement | null = initialTrigger

    for (let attempt = 0; attempt < 4; attempt++) {
      document.body.click()
      await this.sleep(60)

      this.revealConversationActions(row)
      if (!trigger || !trigger.isConnected) {
        trigger = await this.findConversationMenuButton(row)
      }
      if (!trigger) return null

      this.simulateClick(trigger)
      const menu = await this.waitForMenuOpen(trigger, 900)
      if (menu) return menu
    }

    return null
  }

  private async waitForMenuOpen(trigger: HTMLElement, timeout = 900): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const controlled = this.getMenuContainerFromTrigger(trigger)
      if (controlled && this.isVisible(controlled)) return controlled

      const fallback = this.findVisibleMenuContainer()
      if (fallback) return fallback

      await this.sleep(80)
    }
    return null
  }

  private async findConversationRowWithRetry(id: string): Promise<HTMLElement | null> {
    const firstTry = this.findConversationRow(id)
    if (firstTry) return firstTry

    await this.loadAllConversations()
    await this.sleep(250)
    return this.findConversationRow(id)
  }

  private findConversationRow(id: string): HTMLElement | null {
    const expected = this.normalizeConversationId(id)
    // 新版侧边栏：使用 gem-nav-list-item
    const rows = this.findAllElementsBySelector(
      'gem-nav-list-item[data-test-id="conversation"]',
    ) as HTMLElement[]
    for (const row of rows) {
      const rowId = this.normalizeConversationId(this.extractConversationIdFromElement(row))
      if (rowId && rowId === expected) {
        return row
      }
    }
    const hrefCandidates = [
      `a[href*="/app/${expected}"]`,
      `a[href*="/app/c_${expected}"]`,
      `a[href$="/${expected}"]`,
      `a[href$="/c_${expected}"]`,
    ]

    for (const selector of hrefCandidates) {
      const anchor = document.querySelector(selector) as HTMLElement | null
      if (!anchor) continue
      const container = (anchor.closest('gem-nav-list-item[data-test-id="conversation"]') ||
        anchor.closest("li") ||
        anchor.parentElement) as HTMLElement | null
      if (container) return container
    }

    return null
  }

  private extractConversationIdFromElement(element: Element | null): string {
    if (!element) return ""
    // 新版侧边栏：jslog 在内部 <a> 上
    const anchor = element.querySelector("a")
    const jslog = anchor?.getAttribute("jslog") || element.getAttribute("jslog") || ""
    const idMatch = jslog.match(/\["c_([^"]+)"/)
    return idMatch ? idMatch[1] : ""
  }

  private normalizeConversationId(id: string): string {
    if (!id) return ""
    return id.startsWith("c_") ? id.slice(2) : id
  }

  private revealConversationActions(row: HTMLElement): void {
    const events: Array<keyof GlobalEventHandlersEventMap> = [
      "mouseenter",
      "mouseover",
      "mousemove",
    ]

    for (const eventName of events) {
      row.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
        }),
      )
    }
  }

  private async findConversationMenuButton(row: HTMLElement): Promise<HTMLElement | null> {
    const actionSelectors = [
      'button[aria-haspopup="menu"]',
      'button[aria-label*="More"]',
      'button[aria-label*="more"]',
      'button[aria-label*="更多"]',
      'button[aria-label*="选项"]',
      'button[title*="More"]',
      'button[title*="more"]',
      'button[data-test-id*="menu"]',
      'button[data-testid*="menu"]',
      "button",
    ].join(", ")

    for (let attempt = 0; attempt < 12; attempt++) {
      const scopes = this.getMenuSearchScopes(row)
      scopes.forEach((scope) => this.revealConversationActions(scope))

      const allCandidates = scopes.flatMap(
        (scope) => Array.from(scope.querySelectorAll(actionSelectors)) as HTMLElement[],
      )
      const candidates = allCandidates.filter((candidate) => {
        if (candidate instanceof HTMLButtonElement && candidate.disabled) return false
        return true
      })

      if (candidates.length > 0) {
        const moreIconButton = candidates.find((candidate) => {
          return (
            candidate.querySelector(
              'mat-icon[fonticon="more_vert"], mat-icon[fonticon="more_horiz"]',
            ) !== null
          )
        })
        if (moreIconButton) return moreIconButton

        const preferred = candidates.find((candidate) => this.isLikelyMenuButton(candidate, row))
        if (preferred) return preferred

        const fallbackVisible = candidates
          .filter((candidate) => this.isVisible(candidate))
          .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]
        if (fallbackVisible) return fallbackVisible

        if (attempt >= 8) {
          const fallbackAny = candidates[candidates.length - 1]
          if (fallbackAny) return fallbackAny
        }
      }

      await this.sleep(100)
    }

    return null
  }

  private getMenuSearchScopes(row: HTMLElement): HTMLElement[] {
    const scopes = [
      row,
      row.parentElement,
      row.parentElement?.parentElement,
      row.closest("li"),
    ].filter((item): item is HTMLElement => item instanceof HTMLElement)

    const unique = new Set<HTMLElement>()
    const deduplicated: HTMLElement[] = []
    for (const scope of scopes) {
      if (unique.has(scope)) continue
      unique.add(scope)
      deduplicated.push(scope)
    }
    return deduplicated
  }

  private isLikelyMenuButton(button: HTMLElement, row: HTMLElement): boolean {
    if (!row.contains(button)) return false

    const hasMenuPopup = button.getAttribute("aria-haspopup") === "menu"
    if (hasMenuPopup) return true

    const signalText = this.getSignalText(button)
    return (
      signalText.includes("more") ||
      signalText.includes("更多") ||
      signalText.includes("选项") ||
      signalText.includes("menu") ||
      signalText.includes("菜单")
    )
  }

  private async waitForDeleteMenuItem(
    trigger: HTMLElement,
    timeout = 2500,
    menuRoot?: HTMLElement | null,
  ): Promise<HTMLElement | null> {
    const start = Date.now()
    let lastVisibleItems: HTMLElement[] = []

    while (Date.now() - start < timeout) {
      const candidates = this.getMenuActionCandidates(trigger, menuRoot || null)
      for (const item of candidates) {
        if (!this.isVisible(item)) continue

        const deleteIcon = item.querySelector(
          'mat-icon[fonticon="delete"], mat-icon[data-mat-icon-name="delete"]',
        )
        if (deleteIcon) return item

        const text = this.getSignalText(item)
        if (!this.hasKeyword(text, GEMINI_DELETE_KEYWORDS)) continue
        if (this.hasKeyword(text, GEMINI_CANCEL_KEYWORDS)) continue
        return item
      }

      const visibleItems = candidates.filter((item) => this.isVisible(item))
      if (visibleItems.length > 0) {
        lastVisibleItems = visibleItems
      }

      await this.sleep(80)
    }

    // Last resort for multilingual/icon-only menus:
    // Gemini's delete action is usually the last actionable item.
    if (lastVisibleItems.length > 0) {
      const fallback = lastVisibleItems[lastVisibleItems.length - 1]
      const text = this.getSignalText(fallback)
      if (!this.hasKeyword(text, GEMINI_CANCEL_KEYWORDS)) {
        return fallback
      }
    }

    return null
  }

  private getMenuActionCandidates(
    trigger: HTMLElement,
    menuRoot?: HTMLElement | null,
  ): HTMLElement[] {
    const selectors = '[role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button'
    const results: HTMLElement[] = []

    if (menuRoot) {
      results.push(...(Array.from(menuRoot.querySelectorAll(selectors)) as HTMLElement[]))
    }

    const controlledId = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns")
    if (controlledId) {
      const controlledMenu = document.getElementById(controlledId)
      if (controlledMenu) {
        results.push(...(Array.from(controlledMenu.querySelectorAll(selectors)) as HTMLElement[]))
      }
    }

    const visibleMenu = this.findVisibleMenuContainer()
    if (visibleMenu) {
      results.push(...(Array.from(visibleMenu.querySelectorAll(selectors)) as HTMLElement[]))
    }

    results.push(...(this.findAllElementsBySelector(selectors) as HTMLElement[]))

    const unique = new Set<HTMLElement>()
    const deduplicated: HTMLElement[] = []
    for (const item of results) {
      if (unique.has(item)) continue
      unique.add(item)
      deduplicated.push(item)
    }

    return deduplicated
  }

  private getMenuContainerFromTrigger(trigger: HTMLElement): HTMLElement | null {
    const controlledId = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns")
    if (!controlledId) return null

    const controlled = document.getElementById(controlledId)
    return controlled instanceof HTMLElement ? controlled : null
  }

  private findVisibleMenuContainer(): HTMLElement | null {
    const menus = Array.from(
      document.querySelectorAll('[role="menu"], .mat-mdc-menu-panel, .mat-menu-panel'),
    ) as HTMLElement[]
    const visible = menus.filter((menu) => this.isVisible(menu))
    if (visible.length === 0) return null
    return visible[visible.length - 1]
  }

  private async waitForDialogOpen(timeout = 2200): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (this.findVisibleDialog()) return true
      await this.sleep(80)
    }
    return false
  }

  private async waitForDeleteConfirmButton(timeout = 2800): Promise<HTMLElement | null> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const dialog = this.findVisibleDialog()

      const explicitConfirm = dialog?.querySelector(
        'button[data-test-id="confirm-button"], button[data-testid="confirm-button"]',
      ) as HTMLElement | null
      if (explicitConfirm && this.isVisible(explicitConfirm)) {
        return explicitConfirm
      }

      const buttons = dialog
        ? (Array.from(dialog.querySelectorAll("button")) as HTMLElement[])
        : (Array.from(document.querySelectorAll("button")) as HTMLElement[])
      const visibleButtons = buttons.filter((button) => this.isVisible(button))

      for (const button of visibleButtons) {
        const text = this.getSignalText(button)
        if (!this.hasKeyword(text, GEMINI_DELETE_KEYWORDS)) continue
        if (this.hasKeyword(text, GEMINI_CANCEL_KEYWORDS)) continue
        return button
      }

      const fallback = visibleButtons
        .filter((button) => !this.hasKeyword(this.getSignalText(button), GEMINI_CANCEL_KEYWORDS))
        .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]
      if (fallback) return fallback

      await this.sleep(80)
    }

    return null
  }

  private async waitForDialogClosed(timeout = 1200): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.findVisibleDialog()) return true
      await this.sleep(80)
    }
    return false
  }

  private findVisibleDialog(): HTMLElement | null {
    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container'),
    ) as HTMLElement[]
    return dialogs.find((dialog) => this.isVisible(dialog)) || null
  }

  private async waitForConversationRemoved(id: string, timeout = 4500): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!this.findConversationRow(id)) {
        return true
      }
      await this.sleep(90)
    }
    return false
  }

  private syncConversationListAfterDelete(id: string): void {
    const row = this.findConversationRow(id)
    if (!row) return
    row.remove()
  }

  private scheduleFullReloadAfterDelete(deletedIds: string[]): void {
    if (deletedIds.length === 0) return

    const currentId = this.getCurrentConversationIdFromPath()
    if (currentId && deletedIds.includes(currentId)) {
      const appPath = `${this.getUserPathPrefix()}/app` || "/app"
      try {
        window.history.replaceState(window.history.state, "", appPath)
      } catch {
        // ignore route state failures
      }
    }
  }

  private getCurrentConversationIdFromPath(): string | null {
    const match = window.location.pathname.match(/\/app\/([^/?#]+)/)
    if (match?.[1]) {
      const raw = match[1]
      if (raw === "app" || raw === "new_chat") return null
      return raw.startsWith("c_") ? raw.slice(2) : raw
    }
    return null
  }

  private getSignalText(element: HTMLElement): string {
    return [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-test-id") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("mattooltip") || "",
      element.getAttribute("ng-reflect-message") || "",
      element.className || "",
    ]
      .join(" ")
      .toLowerCase()
  }

  private hasKeyword(text: string, keywords: string[]): boolean {
    const normalized = text.toLowerCase()
    return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  }

  private isVisible(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false
    if (!element.isConnected) return false

    const style = window.getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false
    }

    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  protected simulateClick(element: HTMLElement): void {
    const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const
    let dispatched = false
    for (const type of eventTypes) {
      try {
        if (typeof PointerEvent === "function") {
          element.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
            }),
          )
        } else {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
            }),
          )
        }
        dispatched = true
      } catch {
        try {
          element.dispatchEvent(
            new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
            }),
          )
          dispatched = true
        } catch {
          // ignore event dispatch failure and fallback below
        }
      }
    }

    if (!dispatched) {
      element.click()
    }
  }

  getSessionName(): string | null {
    // 新版侧边栏：激活项标题在 a.mdc-list-item--activated .title-text 中
    const activeTitle = document.querySelector("a.mdc-list-item--activated .title-text")
    if (activeTitle) {
      const name = activeTitle.textContent?.trim()
      if (name) return name
    }
    const deepResearchDocumentTitle = this.getDeepResearchDocumentShareTitle()
    if (deepResearchDocumentTitle) {
      return deepResearchDocumentTitle
    }
    // 分享页面（/share/...）：标题在 h1.headline 中，如 <h1 class="headline gds-headline-m"><strong>询问模型身份</strong></h1>
    const shareTitle = document.querySelector("h1.headline, h1[class*='headline']")
    if (shareTitle) {
      const name = shareTitle.textContent?.trim()
      if (name) return name
    }
    const deepResearchArtifactTitle = this.getDeepResearchArtifactShareTitle()
    if (deepResearchArtifactTitle) {
      return deepResearchArtifactTitle
    }
    const nativeTitle = this.getGeminiNativeDocumentTitle()
    if (nativeTitle) {
      return nativeTitle
    }
    return super.getSessionName()
  }

  private getGeminiNativeDocumentTitle(): string | null {
    const root = document.documentElement
    const title = root?.getAttribute(GEMINI_NATIVE_TAB_TITLE_ATTR)
    const path = root?.getAttribute(GEMINI_NATIVE_TAB_TITLE_PATH_ATTR)

    if (!title || path !== window.location.pathname) return null

    return extractConversationTitleFromDocumentTitle(title, {
      siteName: this.getName(),
    })
  }

  getConversationTitle(): string | null {
    // 新版侧边栏：激活项标题
    const activeTitle = document.querySelector("a.mdc-list-item--activated .title-text")
    if (activeTitle) {
      const title = activeTitle.textContent?.trim()
      if (title) return title
    }
    // 回退到页面标题（覆盖自有 + 分享两种页面）
    return this.getSessionName()
  }

  getNewChatButtonSelectors(): string[] {
    return [
      'gem-nav-list-item[data-test-id="new-chat-button"] a',
      '[aria-label="New chat"]',
      '[aria-label="新对话"]',
      '[aria-label="发起新对话"]',
      '[data-testid="new-chat-button"]',
      '[data-test-id="new-chat-button"]',
      '[data-test-id="expanded-button"]',
      '[data-test-id="temp-chat-button"]',
      'button[aria-label="临时对话"]',
    ]
  }

  getLatestReplyText(): string | null {
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return null

    // 查找所有的 model-response
    const responses = container.querySelectorAll("model-response")
    if (responses.length === 0) return null

    const lastResponse = responses[responses.length - 1]
    const text = this.extractAssistantResponseText(lastResponse)
    return text || null
  }

  // ==================== 页面宽度 ====================

  // ==================== 页面宽度控制 ====================

  getWidthSelectors() {
    return [
      {
        selector: GEMINI_MESSAGE_WIDTH_SELECTOR,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      {
        selector: GEMINI_INPUT_WIDTH_SELECTOR,
        property: "max-width",
        extraCss: "width: 100% !important; min-width: 0 !important;",
      },
      // 表格容器随页面加宽（覆盖 Gemini 的 max-width 限制）
      {
        selector: ".table-block.new-table-style",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "width: 100% !important;",
      },
      // 用户消息右对齐
      {
        selector: "user-query",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "display: flex !important; justify-content: flex-end !important;",
      },
      {
        selector: ".user-query-container",
        property: "max-width",
        value: "100%",
        noCenter: true,
        extraCss: "justify-content: flex-end !important;",
      },
    ]
  }

  getPanelAvoidanceConfig(): PanelAvoidanceConfig {
    return {
      scopeSelector: GEMINI_LAYOUT_SCOPE_SELECTOR,
      widthSelectors: [
        {
          selector: GEMINI_MESSAGE_WIDTH_SELECTOR,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: GEMINI_INPUT_WIDTH_SELECTOR,
          property: "max-width",
          extraCss: "width: 100% !important; min-width: 0 !important;",
        },
      ],
      insetSelectors: [
        {
          selector: GEMINI_MESSAGE_SAFE_AREA_SELECTOR,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
        {
          selector: GEMINI_INPUT_SAFE_AREA_SELECTOR,
          extraCss:
            "box-sizing: border-box; width: 100% !important; max-width: 100% !important; min-width: 0 !important;",
        },
      ],
      defaultWidth: "760px",
      gap: 16,
    }
  }

  /** 用户问题宽度选择器 */
  getUserQueryWidthSelectors() {
    return [
      {
        selector: ".user-query-bubble-with-background:not(.edit-mode)",
        property: "max-width",
        noCenter: true, // 用户问题不需要居中
      },
    ]
  }

  getZenModeConfig() {
    return {
      hide: ["bard-sidenav", "div.sidenav-with-history-container"],
    }
  }

  getCleanModeConfig() {
    return {
      hide: [
        "hallucination-disclaimer",
        "g1-dynamic-upsell-button",
        ".share-viewer_footer_disclaimer",
        GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_FOOTER_SELECTOR,
      ],
    }
  }

  getMarkdownFixerConfig(): MarkdownFixerConfig {
    return {
      selector: "message-content p",
      fixSpanContent: false,
      shouldIgnore: (element) => this.shouldIgnoreMarkdownFixElement(element),
    }
  }

  private shouldIgnoreMarkdownFixElement(element: HTMLElement): boolean {
    return element.querySelector(GEMINI_MARKDOWN_FIXER_SOURCE_SELECTOR) !== null
  }

  getAssistantMermaidSupportMode() {
    return "fallback" as const
  }

  // ==================== 输入框操作 ====================

  getTextareaSelectors(): string[] {
    return [
      'div[contenteditable="true"].ql-editor',
      'div[contenteditable="true"]',
      '[role="textbox"]',
      '[aria-label*="Enter a prompt"]',
    ]
  }

  getSubmitButtonSelectors(): string[] {
    return [
      'button[aria-label*="Send"]',
      'button[aria-label*="发送"]',
      ".send-button",
      '[data-testid*="send"]',
    ]
  }

  isValidTextarea(element: HTMLElement): boolean {
    if (element.offsetParent === null) return false
    const isContentEditable = element.getAttribute("contenteditable") === "true"
    const isTextbox = element.getAttribute("role") === "textbox"
    if (element.closest(".gh-main-panel")) return false
    return isContentEditable || isTextbox || element.classList.contains("ql-editor")
  }

  insertPrompt(content: string): boolean {
    const editor = this.textarea
    if (!editor) return false

    if (!editor.isConnected) {
      this.textarea = null
      return false
    }

    editor.focus()
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
      console.warn("[Ophel] insertPrompt: focus failed")
      return false
    }

    try {
      document.execCommand("selectAll", false, undefined)
      const success = document.execCommand("insertText", false, content)
      if (!success) throw new Error("execCommand returned false")
    } catch {
      editor.textContent = content
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      editor.dispatchEvent(new Event("change", { bubbles: true }))
    }
    return true
  }

  clearTextarea(): void {
    if (!this.textarea) return
    if (!this.textarea.isConnected) {
      this.textarea = null
      return
    }

    this.textarea.focus()
    if (
      document.activeElement !== this.textarea &&
      !this.textarea.contains(document.activeElement)
    ) {
      return
    }

    document.execCommand("selectAll", false, undefined)
    document.execCommand("delete", false, undefined)
  }

  // ==================== 滚动容器 ====================

  getScrollContainer(): HTMLElement | null {
    if (this.isSharePage()) {
      return document.querySelector("div.content-container") as HTMLElement
    }
    return document.querySelector("infinite-scroller.chat-history") as HTMLElement
  }

  getResponseContainerSelector(): string {
    if (this.isSharePage()) {
      return "div.content-container"
    }
    return "infinite-scroller.chat-history"
  }

  getChatContentSelectors(): string[] {
    return [
      ".model-response-container",
      "model-response",
      ".response-container",
      "[data-message-id]",
      "message-content",
    ]
  }

  // ==================== 大纲提取 ====================

  getUserQuerySelector(): string {
    return "user-query"
  }

  getOutlineSources(): OutlineSource[] {
    const sources: OutlineSource[] = [
      { id: "conversation", kind: "conversation", label: "对话", available: true },
    ]

    const documentOutline = this.extractDeepResearchDocumentOutline(6, false)
    if (documentOutline.length > 0) {
      sources.push({
        id: GEMINI_DOCUMENT_OUTLINE_SOURCE_ID,
        kind: "document",
        label: "文档",
        available: true,
        count: documentOutline.length,
      })
    }

    return sources
  }

  supportsDynamicOutlineSources(): boolean {
    return true
  }

  getOutlineSourcesSignature(): string {
    const hasDocument = this.getDeepResearchDocumentOutlineRoot() !== null
    return `conversation:1|${GEMINI_DOCUMENT_OUTLINE_SOURCE_ID}:${hasDocument ? 1 : 0}`
  }

  extractOutlineForSource(
    sourceId: string,
    maxLevel = 6,
    includeUserQueries = false,
    showWordCount = false,
  ): OutlineItem[] {
    if (sourceId === GEMINI_DOCUMENT_OUTLINE_SOURCE_ID) {
      return this.extractDeepResearchDocumentOutline(maxLevel, showWordCount)
    }

    return this.extractOutline(maxLevel, includeUserQueries, showWordCount)
  }

  /**
   * 清理用户提问元素，移除辅助可访问性节点。
   */
  private sanitizeUserQueryElement(element: Element): Element {
    const clone = element.cloneNode(true) as Element
    const hiddenNodes = clone.querySelectorAll(".cdk-visually-hidden")
    hiddenNodes.forEach((node) => node.remove())
    return clone
  }

  extractUserQueryText(element: Element): string {
    const sanitized = this.sanitizeUserQueryElement(element)
    const queryText = sanitized.querySelector(".query-text")
    const target = queryText || sanitized
    return this.extractTextWithLineBreaks(target)
  }

  /**
   * 从用户提问元素中提取原始 Markdown 文本
   * Gemini 标准版：将按行拆分的 .query-text-line 合并为完整 Markdown
   */
  extractUserQueryMarkdown(element: Element): string {
    const sanitized = this.sanitizeUserQueryElement(element)
    const lines = sanitized.querySelectorAll(".query-text-line")
    if (lines.length === 0) {
      // 回退：使用 extractUserQueryText
      return this.extractUserQueryText(sanitized)
    }

    const textLines = Array.from(lines).map((line) => {
      // 空行（只有 <br>）
      if (line.querySelector("br") && line.textContent?.trim() === "") {
        return ""
      }
      // 只去行尾空格，保留行首空格（代码缩进）
      return line.textContent?.trimEnd() ?? ""
    })

    // Gemini 会在每行 textContent 前统一加若干个前导空格作为包装，
    // 通过 dedent（去掉所有行共有的最小前导空格数）抵消，保留相对缩进
    const nonEmptyLines = textLines.filter((l) => l.trim() !== "")
    if (nonEmptyLines.length > 0) {
      const minIndent = nonEmptyLines.reduce((min, line) => {
        const match = line.match(/^(\s*)/)
        return Math.min(min, match ? match[1].length : 0)
      }, Infinity)
      if (minIndent > 0 && isFinite(minIndent)) {
        return textLines.map((line) => (line === "" ? "" : line.slice(minIndent))).join("\n")
      }
    }

    return textLines.join("\n")
  }

  extractUserQueryExportContent(element: Element): string {
    return this.extractUserQueryExportContentWithAssets(element)
  }

  private extractUserQueryExportContentWithAssets(
    element: Element,
    collector?: GeminiExportAssetCollector,
  ): string {
    const sanitized = this.sanitizeUserQueryElement(element)
    const imageMarkdown = this.extractUserQueryImageMarkdown(sanitized, collector)
    const fileMarkdown = this.extractUserQueryFileMarkdown(sanitized, collector)
    const markdown = this.extractUserQueryMarkdown(sanitized).trim()
    const textContent = markdown || this.extractUserQueryText(sanitized).trim()

    if (imageMarkdown.length === 0 && fileMarkdown.length === 0) {
      return textContent
    }

    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, textContent].filter(Boolean).join("\n\n")
  }

  private async extractUserQueryExportContentWithResolvedAssets(
    element: Element,
    collector: GeminiExportAssetCollector,
  ): Promise<string> {
    const sanitized = this.sanitizeUserQueryElement(element)
    const imageMarkdown = this.extractUserQueryImageMarkdown(sanitized, collector)
    const fileMarkdown = await this.extractUserQueryFileMarkdownWithResolvedAssets(
      element,
      sanitized,
      collector,
    )
    const markdown = this.extractUserQueryMarkdown(sanitized).trim()
    const textContent = markdown || this.extractUserQueryText(sanitized).trim()

    if (imageMarkdown.length === 0 && fileMarkdown.length === 0) {
      return textContent
    }

    const fileBlock =
      fileMarkdown.length > 0 ? `${t("exportAttachmentsLabel")}:\n${fileMarkdown.join("\n")}` : ""

    return [imageMarkdown.join("\n\n"), fileBlock, textContent].filter(Boolean).join("\n\n")
  }

  async prepareConversationExport(_context: ExportLifecycleContext): Promise<unknown> {
    await this.loadCompleteExportHistory()

    this.exportOpenedCanvasPanel = false
    await this.prepareImagesForExport(_context)

    const state: GeminiExportLifecycleState = {
      openedDeepResearchPanel: false,
    }

    if (this.isDeepResearchAppPage() && !this.getDeepResearchAppDocumentElement()) {
      state.openedDeepResearchPanel = await this.openDeepResearchAppDocumentPanel()
    }

    return state
  }

  private async loadCompleteExportHistory(): Promise<void> {
    if (!this.isUserConversationPage()) return

    const result = await loadCompleteHistoryForExport({
      adapter: this,
      waitMs: 800,
      maxRounds: 60,
      stableRounds: 4,
      wheelDeltaY: -900,
      getSignature: (container) => this.getExportHistoryLoadSignature(container),
    })

    if (!result.success) {
      console.warn("[GeminiAdapter] Export history load reached max rounds before stabilizing", {
        rounds: result.rounds,
        stableRounds: result.stableRounds,
        finalHeight: result.finalHeight,
      })
    }
  }

  private getExportHistoryLoadSignature(container: HTMLElement): string {
    const root =
      document.querySelector(this.getResponseContainerSelector()) || this.getScrollContainer()
    const messages = root
      ? Array.from(root.querySelectorAll("user-query, model-response")).filter(
          (element) => !element.closest("immersive-panel"),
        )
      : []

    const firstMessage = messages[0]
    const lastMessage = messages[messages.length - 1]

    return [
      container.scrollHeight,
      container.clientHeight,
      container.scrollTop,
      messages.length,
      firstMessage ? this.getExportHistoryMessageMarker(firstMessage) : "",
      lastMessage ? this.getExportHistoryMessageMarker(lastMessage) : "",
    ].join(":")
  }

  private getExportHistoryMessageMarker(element: Element): string {
    const source = element.closest("message-content, .conversation-turn") || element
    const id =
      source.id ||
      source.getAttribute("data-message-id") ||
      source.getAttribute("data-test-id") ||
      source.getAttribute("aria-label")

    if (id) return id

    return (source.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
  }

  async restoreConversationAfterExport(
    _context: ExportLifecycleContext,
    state: unknown,
  ): Promise<void> {
    this.clearPreparedExportImageMetadata()

    if (this.isGeminiExportLifecycleState(state) && state.openedDeepResearchPanel) {
      await this.closeDeepResearchAppDocumentPanel()
    }

    if (this.exportOpenedCanvasPanel) {
      await this.closeGeminiCanvasPanel()
      this.exportOpenedCanvasPanel = false
    }
  }

  private async prepareImagesForExport(context: ExportLifecycleContext): Promise<void> {
    this.clearPreparedExportImageMetadata()

    const images = Array.from(
      document.querySelectorAll(
        [
          "model-response img",
          `share-landing-page ${GEMINI_SHARE_ASSISTANT_MARKDOWN_SELECTOR} img`,
          GEMINI_USER_QUERY_IMAGE_SELECTOR,
        ].join(", "),
      ),
    ).filter((node): node is HTMLImageElement => node instanceof HTMLImageElement)

    for (const image of images) {
      try {
        const exportSrc = await this.resolvePreparedExportImageSrc(image, context)
        if (!exportSrc) continue
        image.setAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR, exportSrc)
      } catch (error) {
        console.warn("[GeminiAdapter] Failed to prepare export image source", error)
      }
    }
  }

  private clearPreparedExportImageMetadata(): void {
    document.querySelectorAll(`[${GEMINI_EXPORT_IMAGE_SRC_ATTR}]`).forEach((node) => {
      node.removeAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR)
    })
  }

  private extractUserQueryImageMarkdown(
    element: Element,
    collector?: GeminiExportAssetCollector,
  ): string[] {
    const images = Array.from(
      element.querySelectorAll("img[data-test-id='uploaded-img'], .preview-image"),
    ).filter((node): node is HTMLImageElement => node instanceof HTMLImageElement)
    const imageMarkdown: string[] = []
    const seenSources = new Set<string>()

    for (const image of images) {
      const source = this.getPreparedExportImageSrc(image)
      if (!source || seenSources.has(source)) continue

      seenSources.add(source)
      const alt = (image.alt || "uploaded image").replace(/\s+/g, " ").trim()
      const escapedAlt = alt.replace(/[[\]]/g, "\\$&")
      const assetPath = collector
        ? this.addImageExportAsset(collector, source, escapedAlt || "uploaded image")
        : source
      imageMarkdown.push(`![${escapedAlt || "uploaded image"}](${assetPath})`)
    }

    return imageMarkdown
  }

  private addImageExportAsset(
    collector: GeminiExportAssetCollector,
    source: string,
    alt: string,
  ): string {
    const existingPath = collector.imagePathsBySource.get(source)
    if (existingPath) return existingPath

    const index = collector.imagePathsBySource.size + 1
    const extension = this.getImageExportExtension(source)
    const requestedName = `gemini-image-${String(index).padStart(3, "0")}.${extension}`
    const path = this.createUniqueGeminiExportPath(`assets/images/${requestedName}`, collector)
    const name = path.split("/").pop() || requestedName

    collector.imagePathsBySource.set(source, path)
    collector.assets.push({
      id: `gemini-image-${index}`,
      name,
      relativePath: path,
      mimeType: this.getImageExportMimeType(source, extension),
      kind: "image",
      content: source.startsWith("data:image/") ? this.dataUrlToExportBlob(source) : undefined,
      sourceUrl: source.startsWith("data:image/") ? undefined : source,
      description: alt,
    })

    return path
  }

  private getImageExportExtension(source: string): string {
    if (source.startsWith("data:image/")) {
      const match = source.match(/^data:image\/([a-zA-Z0-9.+-]+)[;,]/)
      return this.normalizeImageExtension(match?.[1] || "png")
    }

    try {
      const pathname = new URL(source, window.location.href).pathname
      const extension = pathname.match(/\.([a-zA-Z0-9]+)$/)?.[1]
      return this.normalizeImageExtension(extension || "png")
    } catch {
      return "png"
    }
  }

  private normalizeImageExtension(value: string): string {
    const extension = value
      .toLowerCase()
      .replace(/^jpg$/, "jpeg")
      .replace(/^svg\+xml$/, "svg")
    if (["png", "jpeg", "webp", "gif", "avif", "svg"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension
    }
    return "png"
  }

  private getImageExportMimeType(source: string, extension: string): string {
    if (source.startsWith("data:image/")) {
      return source.slice(5, source.indexOf(";"))
    }

    if (extension === "svg") return "image/svg+xml"
    return extension === "jpg" ? "image/jpeg" : `image/${extension}`
  }

  private dataUrlToExportBlob(dataUrl: string): Blob {
    const [header, payload = ""] = dataUrl.split(",", 2)
    const mimeType = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream"
    const isBase64 = /;base64/i.test(header)

    if (!isBase64) {
      return new Blob([decodeURIComponent(payload)], { type: mimeType })
    }

    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: mimeType })
  }

  private extractUserQueryFileMarkdown(
    element: Element,
    collector?: GeminiExportAssetCollector,
  ): string[] {
    const files = Array.from(element.querySelectorAll(GEMINI_UPLOADED_FILE_SELECTOR))
    const fileMarkdown: string[] = []
    const seenFiles = new Set<string>()

    for (const file of files) {
      const name = this.extractUserQueryFileName(file)
      if (!name) continue

      const type = this.extractUserQueryFileType(file)
      const label = type && !this.fileNameEndsWithType(name, type) ? `${name} (${type})` : name
      const href = this.extractUserQueryFileHref(file)
      const assetPath =
        href && collector ? this.addFileExportAsset(collector, href, name, type || undefined) : href
      const markdown = assetPath
        ? `- [${this.escapeMarkdownLinkText(label)}](${assetPath})`
        : `- ${label}`

      if (seenFiles.has(markdown)) continue

      seenFiles.add(markdown)
      fileMarkdown.push(markdown)
    }

    return fileMarkdown
  }

  private async extractUserQueryFileMarkdownWithResolvedAssets(
    sourceElement: Element,
    sanitizedElement: Element,
    collector: GeminiExportAssetCollector,
  ): Promise<string[]> {
    const sourceFiles = Array.from(sourceElement.querySelectorAll(GEMINI_UPLOADED_FILE_SELECTOR))
    const sanitizedFiles = Array.from(
      sanitizedElement.querySelectorAll(GEMINI_UPLOADED_FILE_SELECTOR),
    )
    const fileMarkdown: string[] = []
    const seenFiles = new Set<string>()

    for (let index = 0; index < sanitizedFiles.length; index += 1) {
      const file = sanitizedFiles[index]
      const sourceFile = sourceFiles[index] || null
      const name = this.extractUserQueryFileName(file)
      if (!name) continue

      const type = this.extractUserQueryFileType(file)
      const label = type && !this.fileNameEndsWithType(name, type) ? `${name} (${type})` : name
      const href = this.extractUserQueryFileHref(file)
      let assetPath = href ? this.addFileExportAsset(collector, href, name, type || undefined) : ""

      if (!assetPath && sourceFile) {
        const viewerDocument = await this.extractUserQueryViewerDocument(sourceFile, name)
        if (viewerDocument) {
          assetPath = this.addInlineDocumentExportAsset(
            collector,
            viewerDocument.content,
            viewerDocument.name || name,
            viewerDocument.mimeType,
          )
        }
      }

      const markdown = assetPath
        ? `- [${this.escapeMarkdownLinkText(label)}](${assetPath})`
        : `- ${label}`

      if (seenFiles.has(markdown)) continue

      seenFiles.add(markdown)
      fileMarkdown.push(markdown)
    }

    return fileMarkdown
  }

  private addInlineDocumentExportAsset(
    collector: GeminiExportAssetCollector,
    content: string,
    requestedName: string,
    mimeType?: string,
  ): string {
    const filename = this.ensureExportFilenameExtension(
      this.sanitizeGeminiExportFilename(requestedName || "gemini-document"),
      "",
      mimeType || "text/plain",
    )
    const existing = collector.assets.find(
      (asset) => asset.kind === "document" && asset.name === filename && asset.content === content,
    )
    if (existing?.relativePath) return existing.relativePath

    const path = this.createUniqueGeminiExportPath(`assets/documents/${filename}`, collector)
    const name = path.split("/").pop() || filename

    collector.assets.push({
      id: `gemini-document-${collector.assets.length + 1}`,
      name,
      relativePath: path,
      mimeType: mimeType || this.getExportAssetMimeType("", name, "document"),
      kind: "document",
      content,
      description: requestedName || undefined,
    })

    return path
  }

  private async extractUserQueryViewerDocument(
    file: Element,
    fallbackName: string,
  ): Promise<{ name: string; mimeType?: string; content: string } | null> {
    const trigger = this.getUserQueryFilePreviewTrigger(file)
    if (!trigger) return null

    const previousViewer = document.querySelector("immersive-panel .drive-viewer")
    trigger.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    this.simulateClick(trigger)

    const viewer = (await this.waitForDriveViewer(previousViewer)) || previousViewer
    if (!viewer) return null

    try {
      const viewerDocument = await this.waitForDriveViewerDocument(viewer, fallbackName)
      if (!viewerDocument) {
        console.warn("[GeminiAdapter] Failed to extract uploaded file viewer document", {
          name: fallbackName,
          viewerTextContainers: document.querySelectorAll(
            "immersive-panel .drive-viewer-text-content",
          ).length,
          visibleViewers: Array.from(
            document.querySelectorAll("immersive-panel .drive-viewer"),
          ).filter((panel) => this.isVisible(panel)).length,
        })
      }
      return viewerDocument
        ? {
            name: viewerDocument.name || fallbackName,
            mimeType: viewerDocument.mimeType,
            content: viewerDocument.content,
          }
        : null
    } finally {
      await this.closeDriveViewer(viewer)
    }
  }

  private getUserQueryFilePreviewTrigger(file: Element): HTMLElement | null {
    const candidates = [
      file.matches("button, [role='button']") ? file : null,
      file.querySelector("button"),
      file.querySelector("[role='button']"),
    ]

    return (
      candidates.find((candidate): candidate is HTMLElement => candidate instanceof HTMLElement) ||
      null
    )
  }

  private async waitForDriveViewer(
    previousViewer: Element | null,
    timeoutMs = 3000,
  ): Promise<Element | null> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const viewers = Array.from(document.querySelectorAll("immersive-panel .drive-viewer"))
      const viewer = viewers.find((candidate) => candidate !== previousViewer)
      if (viewer) return viewer
      if (!previousViewer && viewers[0]) return viewers[0]
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return null
  }

  private async waitForDriveViewerDocument(
    viewer: Element,
    expectedName: string,
    timeoutMs = 5000,
  ): Promise<{ name: string; mimeType?: string; content: string } | null> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const contentElement = this.findActiveDriveViewerTextContent(expectedName) || null
      const content = this.decodeDriveViewerText(contentElement?.textContent || "")
      if (content) {
        const owner = contentElement?.closest(".drive-viewer") || viewer
        return {
          name: this.extractDriveViewerDocumentName(owner),
          mimeType: this.extractDriveViewerDocumentMimeType(owner),
          content,
        }
      }

      const error = Array.from(viewer.querySelectorAll(".drive-viewer-msg-error")).find((node) =>
        this.isVisible(node),
      )
      if (error) {
        return null
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return null
  }

  private findActiveDriveViewerTextContent(expectedName: string): Element | null {
    const panels = Array.from(document.querySelectorAll("immersive-panel .drive-viewer"))
    const expectedBaseName = expectedName.replace(/\.[A-Za-z0-9]{1,10}$/, "")

    const matchingPanel =
      panels.find((panel) => {
        const name = this.extractDriveViewerDocumentName(panel)
        return (
          name === expectedName ||
          name === expectedBaseName ||
          name.startsWith(`${expectedBaseName}.`) ||
          expectedName.startsWith(`${name}.`)
        )
      }) || panels[panels.length - 1]

    const candidates = Array.from(
      (matchingPanel || document).querySelectorAll(
        ".drive-viewer-text-content pre, .drive-viewer-text-content",
      ),
    )

    return (
      candidates.find((candidate) => this.isVisible(candidate)) ||
      candidates.find((candidate) => this.decodeDriveViewerText(candidate.textContent || "")) ||
      null
    )
  }

  private decodeDriveViewerText(value: string): string {
    return value.replace(/\r\n/g, "\n").trim()
  }

  private extractDriveViewerDocumentName(viewer: Element): string {
    const info = this.parseDriveActiveItemInfo(viewer)
    const toolstripName = this.getNormalizedText(
      viewer.querySelector(".drive-viewer-toolstrip-name"),
    )
    return info?.title || toolstripName || ""
  }

  private extractDriveViewerDocumentMimeType(viewer: Element): string | undefined {
    return this.parseDriveActiveItemInfo(viewer)?.mimeType
  }

  private parseDriveActiveItemInfo(viewer: Element): { title?: string; mimeType?: string } | null {
    const info = Array.from(
      viewer.querySelectorAll('[id="drive-active-item-info"], div[style*="display:none"]'),
    )
      .map((node) => node.textContent?.trim() || "")
      .find((text) => text.startsWith("{") && text.includes('"title"'))
    if (!info) return null

    try {
      const parsed = JSON.parse(info) as { title?: string; mimeType?: string }
      return parsed && typeof parsed === "object" ? parsed : null
    } catch {
      return null
    }
  }

  private async closeDriveViewer(viewer: Element): Promise<void> {
    const closeButton = viewer.querySelector(".drive-viewer-close-button")
    if (closeButton instanceof HTMLElement) {
      this.simulateClick(closeButton)
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  private addFileExportAsset(
    collector: GeminiExportAssetCollector,
    source: string,
    requestedName: string,
    mimeHint?: string,
    kind: ExportAsset["kind"] = "file",
  ): string {
    const existingPath = collector.filePathsBySource.get(source)
    if (existingPath) return existingPath

    const filename = this.ensureExportFilenameExtension(
      this.sanitizeGeminiExportFilename(requestedName || "gemini-file"),
      source,
      mimeHint,
    )
    const path = this.createUniqueGeminiExportPath(`assets/files/${filename}`, collector)
    const name = path.split("/").pop() || filename
    const mimeType = this.getExportAssetMimeType(source, mimeHint || name, kind)

    collector.filePathsBySource.set(source, path)
    collector.assets.push({
      id: `gemini-${kind || "file"}-${collector.filePathsBySource.size}`,
      name,
      relativePath: path,
      mimeType,
      kind,
      content: source.startsWith("data:") ? this.dataUrlToExportBlob(source) : undefined,
      sourceUrl: source.startsWith("data:") ? undefined : source,
      description: requestedName || undefined,
    })

    return path
  }

  private sanitizeGeminiExportFilename(value: string): string {
    return value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 120)
  }

  private ensureExportFilenameExtension(
    filename: string,
    source: string,
    mimeHint?: string,
  ): string {
    const cleanName = filename || "gemini-file"
    if (/\.[A-Za-z0-9]{1,10}$/.test(cleanName)) return cleanName

    const extension =
      this.getExportAssetExtension(source) || this.getExtensionFromMimeType(mimeHint || "")
    return extension ? `${cleanName}.${extension}` : cleanName
  }

  private getExportAssetExtension(source: string): string {
    if (source.startsWith("data:")) {
      const mimeType = source.match(/^data:([^;,]+)/)?.[1] || ""
      return this.getExtensionFromMimeType(mimeType)
    }

    try {
      const pathname = new URL(source, window.location.href).pathname
      return pathname.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() || ""
    } catch {
      return ""
    }
  }

  private getExportAssetMimeType(
    source: string,
    hint: string,
    kind: ExportAsset["kind"],
  ): string | undefined {
    if (source.startsWith("data:")) {
      return source.match(/^data:([^;,]+)/)?.[1] || undefined
    }

    const lowerHint = hint.toLowerCase()
    const extension = lowerHint.match(/\.([a-z0-9]{1,10})$/)?.[1] || lowerHint
    const fromExtension = extension ? this.getMimeTypeFromExtension(extension) : ""
    if (fromExtension) return fromExtension

    if (kind === "audio") return "audio/mpeg"
    if (kind === "video") return "video/mp4"
    return undefined
  }

  private getMimeTypeFromExtension(extension: string): string {
    const normalized = extension.toLowerCase()
    const mimeTypes: Record<string, string> = {
      avif: "image/avif",
      csv: "text/csv",
      gif: "image/gif",
      htm: "text/html",
      html: "text/html",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      json: "application/json",
      m4a: "audio/mp4",
      md: "text/markdown;charset=utf-8",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      ogg: "audio/ogg",
      pdf: "application/pdf",
      png: "image/png",
      txt: "text/plain;charset=utf-8",
      wav: "audio/wav",
      webm: "video/webm",
      webp: "image/webp",
    }
    return mimeTypes[normalized] || ""
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const normalized = mimeType.toLowerCase().split(";")[0].trim()
    const extensions: Record<string, string> = {
      "application/json": "json",
      "application/pdf": "pdf",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "image/avif": "avif",
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/webp": "webp",
      "text/csv": "csv",
      "text/html": "html",
      "text/markdown": "md",
      "text/plain": "txt",
      "video/mp4": "mp4",
      "video/webm": "webm",
    }
    return extensions[normalized] || ""
  }

  private extractUserQueryFileName(file: Element): string {
    const ariaName = this.extractUserQueryFileAriaName(file)
    if (ariaName) return ariaName

    const visibleCandidates = [
      this.getNormalizedText(file.querySelector('[data-test-id="filename-label"]')),
      this.getNormalizedText(file.querySelector(".filename-label")),
      this.getNormalizedText(file.querySelector(".new-file-name")),
    ]

    return visibleCandidates.find(Boolean) || ""
  }

  private extractUserQueryFileAriaName(file: Element): string {
    const candidates = Array.from(file.querySelectorAll("a[aria-label], button[aria-label]"))
      .map((node) => node.getAttribute("aria-label") || "")
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter(Boolean)

    return (
      candidates.find((candidate) => !GEMINI_UNAVAILABLE_SHARED_FILE_HINT_REGEX.test(candidate)) ||
      ""
    )
  }

  private extractUserQueryFileType(file: Element): string {
    const explicitType = this.getNormalizedText(file.querySelector(".new-file-type"))
    if (explicitType) return explicitType

    const iconAlt = file.querySelector('[data-test-id="luminous-file-icon"]')?.getAttribute("alt")
    return (iconAlt || "")
      .replace(/icon|图标|圖標|アイコン|아이콘|símbolo|ícone|symbol|значок/gi, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  private fileNameEndsWithType(name: string, type: string): boolean {
    const normalizedName = name.toLowerCase()
    const normalizedType = type.replace(/^\./, "").toLowerCase()
    return normalizedType ? normalizedName.endsWith(`.${normalizedType}`) : false
  }

  private extractUserQueryFileHref(file: Element): string {
    const links = Array.from(file.querySelectorAll("a[href]")).filter(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    )

    for (const link of links) {
      const href = this.normalizeExportAssetUrl(link.href || link.getAttribute("href") || "")
      if (this.isDownloadableExportAssetUrl(href)) return href
    }

    return ""
  }

  private escapeMarkdownLinkText(value: string): string {
    return value.replace(/[[\]]/g, "\\$&")
  }

  private getPreparedExportImageSrc(image: HTMLImageElement): string {
    const displayedProcessedSource = this.getDisplayedProcessedImageDataUrl(image)
    if (displayedProcessedSource) return displayedProcessedSource

    const directCandidates = [
      image.getAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR) || "",
      image.getAttribute("data-ophel-wm-source") || "",
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
    ]

    for (const rawCandidate of directCandidates) {
      const candidate = this.normalizeExportImageUrl(rawCandidate)
      if (this.isStablePreparedExportImageUrl(candidate)) {
        return candidate
      }
    }

    return ""
  }

  private async resolvePreparedExportImageSrc(
    image: HTMLImageElement,
    context: ExportLifecycleContext,
  ): Promise<string> {
    const watermarkRemovedSource = await this.resolveWatermarkRemovedExportImageSrc(image)
    if (watermarkRemovedSource) {
      return watermarkRemovedSource
    }

    const directCandidates = [this.getPreparedExportImageSrc(image)]
    const fallbackCandidates = [
      image.getAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR) || "",
      image.getAttribute("data-ophel-wm-source") || "",
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
    ]

    for (const rawCandidate of directCandidates) {
      const candidate = this.normalizeExportImageUrl(rawCandidate)
      if (!candidate) continue

      if (this.shouldInlineUserQueryImageForExport(image, context)) {
        return this.resolveExportImageDataUrl(candidate, image)
      }

      if (this.isStablePreparedExportImageUrl(candidate)) {
        return candidate
      }
    }

    const blobCandidate = fallbackCandidates
      .map((candidate) => this.normalizeExportImageUrl(candidate))
      .find((candidate) => candidate.startsWith("blob:"))

    if (!blobCandidate) {
      return ""
    }

    return this.convertBlobUrlToDataUrl(blobCandidate, image)
  }

  private shouldTryWatermarkRemovalForExport(image: HTMLImageElement): boolean {
    if (image.closest("user-query")) return false
    if (image.closest("model-response")) {
      return image.closest(GEMINI_EXPORT_IMAGE_SCOPE_SELECTOR) !== null
    }
    return image.closest(`share-landing-page ${GEMINI_SHARE_ASSISTANT_MARKDOWN_SELECTOR}`) !== null
  }

  private getDisplayedProcessedImageDataUrl(image: HTMLImageElement): string {
    if (image.getAttribute("data-ophel-wm-processed") !== "1") return ""

    const candidates = [image.currentSrc || "", image.src || "", image.getAttribute("src") || ""]
    return (
      candidates
        .map((candidate) => this.normalizeExportImageUrl(candidate))
        .find((candidate) => candidate.startsWith("data:image/")) || ""
    )
  }

  private async resolveWatermarkRemovedExportImageSrc(image: HTMLImageElement): Promise<string> {
    if (!this.shouldTryWatermarkRemovalForExport(image)) return ""

    const displayedProcessedSource = this.getDisplayedProcessedImageDataUrl(image)
    if (displayedProcessedSource) return displayedProcessedSource

    const watermarkRemover = WatermarkRemover.getActiveInstance()
    if (!watermarkRemover) return ""

    const candidates = [
      image.getAttribute("data-ophel-wm-source") || "",
      image.currentSrc || "",
      image.src || "",
      image.getAttribute("src") || "",
      image.getAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR) || "",
    ]
    const seenCandidates = new Set<string>()

    for (const rawCandidate of candidates) {
      const candidate = this.normalizeExportImageUrl(rawCandidate)
      if (!candidate || seenCandidates.has(candidate)) continue
      seenCandidates.add(candidate)
      if (candidate.startsWith("data:image/")) continue

      const processedDataUrl = await watermarkRemover.resolveProcessedImageDataUrl(candidate, {
        scene: "export",
      })
      if (processedDataUrl?.startsWith("data:image/")) {
        return processedDataUrl
      }
    }

    return ""
  }

  private shouldInlineUserQueryImageForExport(
    image: HTMLImageElement,
    context: ExportLifecycleContext,
  ): boolean {
    return (
      context.format === "markdown" &&
      context.packaging === "markdown" &&
      image.closest("user-query") !== null
    )
  }

  private async resolveExportImageDataUrl(
    source: string,
    image?: HTMLImageElement,
  ): Promise<string> {
    if (source.startsWith("data:image/")) return source
    if (source.startsWith("blob:")) return this.convertBlobUrlToDataUrl(source, image)
    if (!/^https?:\/\//i.test(source)) return ""

    try {
      const response = await platform.fetch(source)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const blob = await response.blob()
      return this.convertBlobToDataUrl(blob)
    } catch (error) {
      console.warn("[GeminiAdapter] Failed to inline user query image for Markdown export", error)
      return source
    }
  }

  private normalizeExportImageUrl(value: string): string {
    if (!value) return ""
    if (value.startsWith("blob:") || value.startsWith("data:image/")) {
      return value
    }

    try {
      return new URL(value, window.location.href).toString()
    } catch {
      return value
    }
  }

  private normalizeExportAssetUrl(value: string): string {
    if (!value) return ""
    if (/^(blob:|data:)/i.test(value)) return value

    try {
      return new URL(value, window.location.href).toString()
    } catch {
      return value
    }
  }

  private isDownloadableExportAssetUrl(value: string): boolean {
    if (!value) return false
    if (/^(blob:|data:)/i.test(value)) return true
    if (!/^https?:\/\//i.test(value)) return false

    try {
      const url = new URL(value)
      if (url.hostname === window.location.hostname && /^\/?(app|share)(\/|$)/.test(url.pathname)) {
        return false
      }
      if (/faviconV2|google_logo_icon|\/32\/type\//i.test(url.href)) return false
      return true
    } catch {
      return false
    }
  }

  private isStablePreparedExportImageUrl(value: string): boolean {
    if (!value) return false
    if (value.startsWith("data:image/")) return true
    if (GEMINI_GOOGLEUSERCONTENT_HOST_REGEX.test(value)) return true
    return /^https?:\/\//i.test(value)
  }

  private async convertImageElementToDataUrl(image: HTMLImageElement): Promise<string> {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      await image.decode()
    }

    const width = image.naturalWidth || image.width || image.clientWidth
    const height = image.naturalHeight || image.height || image.clientHeight
    if (width <= 0 || height <= 0) {
      throw new Error("Image has no exportable size")
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("2D canvas context unavailable")
    }

    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL("image/png")
  }

  private async convertBlobUrlToDataUrl(
    blobUrl: string,
    image?: HTMLImageElement,
  ): Promise<string> {
    if (image) {
      try {
        return await this.convertImageElementToDataUrl(image)
      } catch {
        // Fall back to fetch for extension pages where blob: fetch is allowed.
      }
    }

    const response = await fetch(blobUrl)
    const blob = await response.blob()
    return this.convertBlobToDataUrl(blob)
  }

  private async convertBlobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result)
          return
        }
        reject(new Error("Failed to convert blob image to data URL"))
      }
      reader.onerror = () => reject(reader.error || new Error("Failed to read blob image"))
      reader.readAsDataURL(blob)
    })
  }

  /**
   * 导出前清理 Gemini 注入的辅助可访问性节点，避免进入 Markdown。
   */
  private sanitizeAssistantExportElement(element: Element): Element {
    const clone = element.cloneNode(true) as Element
    clone.querySelectorAll(GEMINI_ASSISTANT_EXPORT_NOISE_SELECTOR).forEach((node) => node.remove())
    this.normalizeDeepResearchConfirmationWidgetsForExport(clone)
    this.normalizeAssistantGeneratedImagesForExport(clone)

    return clone
  }

  private normalizeDeepResearchConfirmationWidgetsForExport(root: Element): void {
    root.querySelectorAll(GEMINI_DEEP_RESEARCH_CONFIRMATION_SELECTOR).forEach((widget) => {
      const replacement = document.createElement("div")
      replacement.className = "ophel-gemini-deep-research-plan"

      const title = this.getNormalizedText(widget.querySelector('[data-test-id="title"]'))
      if (title) {
        const heading = document.createElement("h3")
        heading.textContent = title
        replacement.appendChild(heading)
      }

      const steps = Array.from(
        widget.querySelectorAll('[data-test-id="research-steps"] .research-step'),
      )
      steps.forEach((step, index) => {
        const stepTitle = this.extractDeepResearchStepTitle(step)
        if (stepTitle) {
          const heading = document.createElement("h4")
          heading.textContent = `${index + 1}. ${stepTitle}`
          replacement.appendChild(heading)
        }

        const description = this.normalizeExportMultilineText(
          step.querySelector(".research-step-description")?.textContent || "",
        )
        if (description) {
          const paragraph = document.createElement("p")
          paragraph.textContent = description
          replacement.appendChild(paragraph)
        }
      })

      if (replacement.childNodes.length > 0) {
        widget.replaceWith(replacement)
      }
    })
  }

  private extractDeepResearchStepTitle(step: Element): string {
    const titleContainer = step.querySelector(".research-step-title")
    const titleElement = Array.from(titleContainer?.children || []).find(
      (child) => child.tagName.toLowerCase() !== "mat-icon",
    )
    return this.getNormalizedText(titleElement || titleContainer)
  }

  private getNormalizedText(element: Element | null | undefined): string {
    return (element?.textContent || "").replace(/\s+/g, " ").trim()
  }

  private normalizeExportMultilineText(value: string): string {
    return value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  private normalizeAssistantGeneratedImagesForExport(root: Element): void {
    root.querySelectorAll(GEMINI_DECORATIVE_IMAGE_SELECTOR).forEach((node) => node.remove())

    root.querySelectorAll(`img[${GEMINI_EXPORT_IMAGE_SRC_ATTR}]`).forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return

      const preparedSrc = node.getAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR) || ""
      if (!preparedSrc) return

      node.setAttribute("src", preparedSrc)
      node.removeAttribute("srcset")
      node.removeAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR)
    })

    root
      .querySelectorAll(`${GEMINI_EXPORT_IMAGE_SCOPE_SELECTOR} button.image-button`)
      .forEach((node) => {
        if (!(node instanceof HTMLButtonElement) || !node.parentNode) return

        const image = node.querySelector("img")
        if (!(image instanceof HTMLImageElement)) return

        const replacement = image.cloneNode(true) as HTMLImageElement
        const preparedSrc = replacement.getAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR) || ""
        if (preparedSrc) {
          replacement.setAttribute("src", preparedSrc)
          replacement.removeAttribute("srcset")
          replacement.removeAttribute(GEMINI_EXPORT_IMAGE_SRC_ATTR)
        }

        node.replaceWith(replacement)
      })

    root
      .querySelectorAll(
        "share-button, copy-button, download-generated-image-button, .generated-image-controls, .loader",
      )
      .forEach((node) => node.remove())
  }

  /**
   * 过滤 Gemini 注入的辅助可访问性标题（例如 “Gemini says”）。
   * 这类标题通常为 visually-hidden，不应进入大纲。
   */
  private shouldSkipOutlineHeading(heading: Element): boolean {
    if (this.isInRenderedMarkdownContainer(heading)) return true

    // 仅过滤 Gemini 注入的辅助可访问性标题，避免误杀正常 Markdown 标题
    if (heading.classList.contains("cdk-visually-hidden")) return true

    return false
  }

  private getDeepResearchDocumentOutlineRoot(): Element | null {
    const appDocument = this.getDeepResearchAppDocumentElement()
    if (appDocument) return appDocument

    if (this.isDeepResearchDocumentSharePage()) {
      return document.querySelector(
        `${GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_SELECTOR} ${GEMINI_DEEP_RESEARCH_MARKDOWN_SELECTOR}`,
      )
    }

    if (this.isDeepResearchConversationSharePage()) {
      return document.querySelector(
        `${GEMINI_DEEP_RESEARCH_ARTIFACT_SHARE_SELECTOR} ${GEMINI_DEEP_RESEARCH_MARKDOWN_SELECTOR}`,
      )
    }

    return null
  }

  private extractDeepResearchDocumentOutline(maxLevel = 6, showWordCount = false): OutlineItem[] {
    const root = this.getDeepResearchDocumentOutlineRoot()
    if (!root) return []

    return extractHeadingOutline(root, {
      maxLevel,
      showWordCount,
      idPrefix: "gemini-document",
      shouldSkipHeading: (heading) => this.shouldSkipOutlineHeading(heading),
      calculateWordCount: (heading, nextBoundary, outlineRoot) => {
        return this.calculateRangeWordCount(heading, nextBoundary, outlineRoot)
      },
    })
  }

  private findDeepResearchDocumentHeading(level: number, text: string): Element | null {
    const root = this.getDeepResearchDocumentOutlineRoot()
    if (!root) return null

    return findHeadingByText(root, level, text, (heading) => this.shouldSkipOutlineHeading(heading))
  }

  getOutlineScrollContainer(sourceId = "conversation"): HTMLElement | null {
    if (sourceId === GEMINI_DOCUMENT_OUTLINE_SOURCE_ID) {
      const root = this.getDeepResearchDocumentOutlineRoot()
      return findScrollableAncestor(root) || null
    }

    return this.getScrollContainer()
  }

  async resolveOutlineTarget(
    item: Pick<OutlineItem, "level" | "text" | "isUserQuery">,
    queryIndex?: number,
    sourceId = "conversation",
  ): Promise<Element | null> {
    if (sourceId === GEMINI_DOCUMENT_OUTLINE_SOURCE_ID) {
      return this.findDeepResearchDocumentHeading(item.level, item.text)
    }

    return super.resolveOutlineTarget(item, queryIndex, sourceId)
  }

  scrollToOutlineSourceTarget(element: HTMLElement, sourceId = "conversation"): void {
    if (sourceId === GEMINI_DOCUMENT_OUTLINE_SOURCE_ID) {
      const container = findScrollableAncestor(element) || this.getOutlineScrollContainer(sourceId)
      if (scrollElementInContainer(element, container)) {
        return
      }
    }

    this.scrollToOutlineTarget(element)
  }

  /**
   * Gemini 导出：优先转 Markdown，并过滤辅助可访问性标题（如 “Gemini says”）和思维链节点。
   */
  extractAssistantResponseText(element: Element): string {
    return this.extractAssistantResponseTextWithAssets(element)
  }

  private extractAssistantResponseTextWithAssets(
    element: Element,
    collector?: GeminiExportAssetCollector,
  ): string {
    const sanitized = this.sanitizeAssistantExportElement(element)
    if (collector) {
      this.replaceAssistantImageSourcesWithExportAssets(sanitized, collector)
      this.replaceAssistantMediaSourcesWithExportAssets(sanitized, collector)
      this.replaceAssistantDownloadLinksWithExportAssets(sanitized, collector)
    }
    return this.extractMarkdownExportContent(sanitized)
  }

  async extractExportMessages(_context: ExportLifecycleContext): Promise<ExportMessage[] | null> {
    if (this.isDeepResearchDocumentSharePage()) {
      return this.extractDeepResearchDocumentShareMessages()
    }

    if (this.isDeepResearchConversationSharePage()) {
      return this.extractDeepResearchConversationShareMessages()
    }

    if (this.isGeminiConversationSharePage()) {
      return this.extractGeminiConversationShareMessages()
    }

    if (this.isDeepResearchAppPage()) {
      return this.extractDeepResearchAppMessages()
    }

    if (this.hasGeminiCanvasAppArtifacts()) {
      return this.extractGeminiConversationMessages()
    }

    return null
  }

  async extractExportBundle(context: ExportLifecycleContext): Promise<ExportBundle | null> {
    const collector: GeminiExportAssetCollector = {
      assets: [],
      imagePathsBySource: new Map<string, string>(),
      filePathsBySource: new Map<string, string>(),
      usedPaths: new Set<string>(),
    }

    const messages = await this.extractExportMessagesWithAssets(context, collector)
    if (!messages) return null

    return {
      messages,
      assets: collector.assets,
    }
  }

  private async extractExportMessagesWithAssets(
    _context: ExportLifecycleContext,
    collector: GeminiExportAssetCollector,
  ): Promise<ExportMessage[] | null> {
    if (this.isDeepResearchDocumentSharePage()) {
      return this.extractDeepResearchDocumentShareMessages(collector)
    }

    if (this.isDeepResearchConversationSharePage()) {
      return this.extractDeepResearchConversationShareMessages(collector)
    }

    if (this.isGeminiConversationSharePage()) {
      return this.extractGeminiConversationShareMessages(collector)
    }

    if (this.isDeepResearchAppPage()) {
      return this.extractDeepResearchAppMessages(collector)
    }

    return this.extractGeminiConversationMessages(collector)
  }

  private async extractGeminiConversationMessages(
    collector?: GeminiExportAssetCollector,
  ): Promise<ExportMessage[] | null> {
    const root =
      document.querySelector(this.getResponseContainerSelector()) || this.getScrollContainer()
    if (!root) return null

    const messageElements = Array.from(root.querySelectorAll("user-query, model-response")).sort(
      (left, right) => this.compareDomOrder(left, right),
    )
    if (messageElements.length === 0) return null

    const messages: ExportMessage[] = []
    for (const element of messageElements) {
      if (element.closest("immersive-panel")) continue

      const role = element.tagName.toLowerCase() === "user-query" ? "user" : "assistant"
      const content =
        role === "user"
          ? (collector
              ? await this.extractUserQueryExportContentWithResolvedAssets(element, collector)
              : this.extractUserQueryExportContentWithAssets(element)
            ).trim()
          : this.joinExportSections(
              this.extractAssistantResponseTextWithAssets(element, collector),
              await this.extractGeminiCanvasAppArtifactsFromResponse(element, collector),
            )

      if (!content) continue
      messages.push({ role, content })
    }

    const deduped = this.dedupeAdjacentExportMessages(messages)
    return deduped.length > 0 ? deduped : null
  }

  private replaceAssistantImageSourcesWithExportAssets(
    root: Element,
    collector: GeminiExportAssetCollector,
  ): void {
    const images = Array.from(root.querySelectorAll("img")).filter(
      (node): node is HTMLImageElement => node instanceof HTMLImageElement,
    )

    images.forEach((image) => {
      if (this.isDecorativeExportImage(image)) return

      const source = this.getPreparedExportImageSrc(image)
      if (!source) return

      const alt = (image.alt || "image").replace(/\s+/g, " ").trim()
      const assetPath = this.addImageExportAsset(collector, source, alt)
      image.setAttribute("src", assetPath)
      image.removeAttribute("srcset")
    })
  }

  private replaceAssistantMediaSourcesWithExportAssets(
    root: Element,
    collector: GeminiExportAssetCollector,
  ): void {
    const mediaElements = Array.from(root.querySelectorAll("audio, video")).filter(
      (node): node is HTMLMediaElement => node instanceof HTMLMediaElement,
    )

    mediaElements.forEach((media) => {
      const mediaSource = this.extractAssistantMediaSource(media)
      if (!mediaSource) return

      const kind: ExportAsset["kind"] = media.tagName.toLowerCase() === "video" ? "video" : "audio"
      const label = this.buildAssistantMediaAssetName(media, kind, mediaSource.source)
      const assetPath = this.addFileExportAsset(
        collector,
        mediaSource.source,
        label,
        mediaSource.mimeType,
        kind,
      )

      media.replaceWith(this.createExportAssetLinkElement(label, assetPath))
    })
  }

  private replaceAssistantDownloadLinksWithExportAssets(
    root: Element,
    collector: GeminiExportAssetCollector,
  ): void {
    const links = Array.from(root.querySelectorAll("a[href]")).filter(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    )

    links.forEach((link) => {
      if (!this.isAssistantExportDownloadLink(link)) return

      const source = this.normalizeExportAssetUrl(link.getAttribute("href") || link.href || "")
      if (!this.isDownloadableExportAssetUrl(source)) return

      const label = this.buildAssistantDownloadAssetName(link, source)
      const kind = this.inferExportAssetKind(source, label)
      const assetPath = this.addFileExportAsset(collector, source, label, undefined, kind)
      link.setAttribute("href", assetPath)
      link.setAttribute(EXPORT_MARKDOWN_HREF_ATTR, assetPath)
      link.removeAttribute("target")
      link.removeAttribute("rel")
    })
  }

  private extractAssistantMediaSource(
    media: HTMLMediaElement,
  ): { source: string; mimeType?: string } | null {
    const directCandidates = [
      media.currentSrc || "",
      media.getAttribute("src") || "",
      "src" in media ? String(media.src || "") : "",
    ]

    const sourceElements = Array.from(media.querySelectorAll("source[src]")).filter(
      (node): node is HTMLSourceElement => node instanceof HTMLSourceElement,
    )
    const candidates = [
      ...directCandidates.map((source) => ({ source, mimeType: media.getAttribute("type") || "" })),
      ...sourceElements.map((sourceElement) => ({
        source: sourceElement.getAttribute("src") || sourceElement.src || "",
        mimeType: sourceElement.type || "",
      })),
    ]

    for (const candidate of candidates) {
      const source = this.normalizeExportAssetUrl(candidate.source)
      if (this.isDownloadableExportAssetUrl(source)) {
        return {
          source,
          mimeType: candidate.mimeType || undefined,
        }
      }
    }

    return null
  }

  private buildAssistantMediaAssetName(
    media: HTMLMediaElement,
    kind: ExportAsset["kind"],
    source: string,
  ): string {
    const label =
      media.getAttribute("aria-label") ||
      media.getAttribute("title") ||
      (kind === "video" ? "gemini-video" : "gemini-audio")
    return this.ensureExportFilenameExtension(this.sanitizeGeminiExportFilename(label), source)
  }

  private buildAssistantDownloadAssetName(link: HTMLAnchorElement, source: string): string {
    const downloadName = link.getAttribute("download")
    const label =
      downloadName ||
      link.getAttribute("aria-label") ||
      link.getAttribute("title") ||
      link.textContent ||
      "gemini-file"
    return this.ensureExportFilenameExtension(this.sanitizeGeminiExportFilename(label), source)
  }

  private createExportAssetLinkElement(label: string, href: string): HTMLElement {
    const paragraph = document.createElement("p")
    const link = document.createElement("a")
    link.setAttribute("href", href)
    link.setAttribute(EXPORT_MARKDOWN_HREF_ATTR, href)
    link.textContent = label
    paragraph.appendChild(link)
    return paragraph
  }

  private isAssistantExportDownloadLink(link: HTMLAnchorElement): boolean {
    if (link.getAttribute("href")?.startsWith("assets/")) return false
    if (link.hasAttribute("download")) return true

    const signal = [
      link.getAttribute("data-test-id") || "",
      link.getAttribute("data-testid") || "",
      link.getAttribute("aria-label") || "",
      link.getAttribute("title") || "",
      link.className || "",
    ]
      .join(" ")
      .toLowerCase()

    if (!/(download|attachment|file|document|audio|video|下载|下載)/i.test(signal)) {
      return false
    }

    const source = this.normalizeExportAssetUrl(link.getAttribute("href") || link.href || "")
    return this.isDownloadableExportAssetUrl(source)
  }

  private inferExportAssetKind(source: string, label: string): ExportAsset["kind"] {
    const extension = (
      this.getExportAssetExtension(source) ||
      label.match(/\.([A-Za-z0-9]{1,10})$/)?.[1] ||
      ""
    ).toLowerCase()

    if (["mp3", "m4a", "ogg", "wav"].includes(extension)) return "audio"
    if (["mp4", "webm"].includes(extension)) return "video"
    if (["md", "pdf", "txt", "csv", "json", "html", "htm"].includes(extension)) return "document"
    return "file"
  }

  private isDecorativeExportImage(image: HTMLImageElement): boolean {
    if (image.matches(GEMINI_DECORATIVE_IMAGE_SELECTOR)) return true

    const source = this.getPreparedExportImageSrc(image)
    if (!source) return true

    const className = image.className || ""
    const testId = image.getAttribute("data-test-id") || ""
    const role = image.getAttribute("role") || ""
    if (
      role === "presentation" &&
      /(^|\s)(favicon|icon|google-icon)(\s|$)/.test(String(className)) &&
      /favicon|icon|file/i.test(testId)
    ) {
      return true
    }

    const mimeType = source.startsWith("data:image/")
      ? source.slice(5, source.indexOf(";")).toLowerCase()
      : ""

    if (mimeType === "image/svg+xml" && image.classList.contains("katex-svg")) return true

    return false
  }

  private hasGeminiCanvasAppArtifacts(): boolean {
    if (this.isSharePage()) return false

    const root =
      document.querySelector(this.getResponseContainerSelector()) || this.getScrollContainer()
    return root ? this.getGeminiCanvasCardsFromResponse(root).length > 0 : false
  }

  private getGeminiCanvasCardsFromResponse(element: Element): HTMLElement[] {
    return Array.from(element.querySelectorAll(GEMINI_CANVAS_CARD_SELECTOR)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && this.isGeminiCanvasCard(node),
    )
  }

  private getGeminiCanvasShareArtifactElements(root: ParentNode): HTMLElement[] {
    const candidates = new Set<Element>()
    if (root instanceof Element && root.classList.contains("immersive-artifact-container")) {
      candidates.add(root)
    }

    root
      .querySelectorAll(`${GEMINI_CANVAS_SHARE_ARTIFACT_SELECTOR}, .immersive-artifact-container`)
      .forEach((element) => candidates.add(element))

    return Array.from(candidates).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && this.isGeminiCanvasCard(node),
    )
  }

  private isGeminiCanvasCard(card: HTMLElement): boolean {
    return (
      card.querySelector(GEMINI_CANVAS_CODE_ICON_SELECTOR) !== null ||
      card.querySelector(GEMINI_CANVAS_DOCUMENT_ICON_SELECTOR) !== null
    )
  }

  private async extractGeminiCanvasAppArtifactsFromResponse(
    element: Element,
    collector?: GeminiExportAssetCollector,
  ): Promise<string> {
    const cards = this.getGeminiCanvasCardsFromResponse(element)
    if (cards.length === 0) return ""

    const sections: string[] = []

    for (const card of cards) {
      const title = this.extractGeminiCanvasTitle(card)
      try {
        const panel = await this.openGeminiCanvasCardForExport(card)
        if (!panel) continue

        const content = await this.extractGeminiCanvasArtifactMarkdown(panel, title, collector)
        if (content) {
          sections.push(content)
        }
      } catch (error) {
        console.warn("[GeminiAdapter] Failed to export Gemini Canvas artifact", error)
      }
    }

    return sections.length > 0
      ? this.formatGeminiCanvasArtifactSections(sections)
      : this.formatGeminiCanvasFallbackTitles(
          cards.map((card) => this.extractGeminiCanvasTitle(card)),
        )
  }

  private async extractGeminiCanvasShareArtifactsFromTurn(
    turn: Element,
    collector?: GeminiExportAssetCollector,
  ): Promise<string> {
    const artifactElements = this.getGeminiCanvasShareArtifactElements(turn)
    if (artifactElements.length === 0) return ""

    const sections: string[] = []

    for (const artifactElement of artifactElements) {
      try {
        const content = await this.extractGeminiCanvasArtifactMarkdown(
          artifactElement,
          this.extractGeminiCanvasTitle(artifactElement),
          collector,
        )
        if (content) {
          sections.push(content)
        }
      } catch (error) {
        console.warn("[GeminiAdapter] Failed to export Gemini Canvas share artifact", error)
      }
    }

    return sections.length > 0
      ? this.formatGeminiCanvasArtifactSections(sections)
      : this.formatGeminiCanvasFallbackTitles(
          artifactElements.map((artifactElement) => this.extractGeminiCanvasTitle(artifactElement)),
        )
  }

  private async extractGeminiCanvasArtifactMarkdown(
    scope: ParentNode,
    fallbackTitle: string,
    collector?: GeminiExportAssetCollector,
  ): Promise<string> {
    if (this.isGeminiCanvasDocumentScope(scope)) {
      const documentMarkdown = this.extractGeminiCanvasDocumentMarkdown(scope, collector)
      if (documentMarkdown) {
        return this.formatGeminiCanvasDocumentArtifact(scope, fallbackTitle, documentMarkdown)
      }
    }

    const codeBlock = this.findGeminiCanvasCodeBlock(scope)
    if (codeBlock) {
      const artifact = this.extractGeminiCanvasCodeBlockArtifact(codeBlock, fallbackTitle)
      if (artifact) return this.formatGeminiCanvasCodeArtifacts([artifact])
    }

    const editor = this.findGeminiCanvasCodeEditor(scope)
    if (editor) {
      const artifact = await this.extractGeminiCanvasCodeEditorArtifact(editor, fallbackTitle)
      if (artifact) return this.formatGeminiCanvasCodeArtifacts([artifact])
    }

    await this.selectGeminiCanvasCodeTab(scope)

    const artifact = await this.extractGeminiCanvasCodeArtifact(scope, fallbackTitle)
    if (artifact) return this.formatGeminiCanvasCodeArtifacts([artifact])

    const documentMarkdown = this.extractGeminiCanvasDocumentMarkdown(scope, collector)
    return documentMarkdown
      ? this.formatGeminiCanvasDocumentArtifact(scope, fallbackTitle, documentMarkdown)
      : ""
  }

  private isGeminiCanvasDocumentScope(scope: ParentNode): boolean {
    if (!(scope instanceof Element)) return false
    return scope.closest(GEMINI_CANVAS_DOCUMENT_IMMERSIVE_PANEL_SELECTOR) !== null
  }

  private extractGeminiCanvasDocumentMarkdown(
    scope: ParentNode,
    collector?: GeminiExportAssetCollector,
  ): string {
    const markdown = this.getGeminiCanvasDocumentMarkdownElement(scope)
    return markdown ? this.extractAssistantResponseTextWithAssets(markdown, collector).trim() : ""
  }

  private getGeminiCanvasDocumentMarkdownElement(scope: ParentNode): Element | null {
    const candidates = Array.from(scope.querySelectorAll(GEMINI_CANVAS_DOCUMENT_MARKDOWN_SELECTOR))
    return (
      candidates.find(
        (candidate) =>
          candidate.closest("thinking-panel") === null && Boolean(candidate.textContent?.trim()),
      ) || null
    )
  }

  private formatGeminiCanvasDocumentArtifact(
    scope: ParentNode,
    fallbackTitle: string,
    markdown: string,
  ): string {
    const title =
      scope instanceof Element ? this.extractGeminiCanvasTitle(scope, fallbackTitle) : fallbackTitle
    const heading = title ? `### Gemini Canvas: ${title}` : "### Gemini Canvas"
    return `${heading}\n\n${markdown.trim()}`
  }

  private formatGeminiCanvasArtifactSections(sections: string[]): string {
    const deduped: string[] = []
    const seen = new Set<string>()

    for (const section of sections) {
      const normalized = section.trim()
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      deduped.push(normalized)
    }

    return deduped.join("\n\n")
  }

  private getGeminiCanvasPanelElement(): HTMLElement | null {
    const panel = document.querySelector(GEMINI_CANVAS_IMMERSIVE_PANEL_SELECTOR)
    return panel instanceof HTMLElement ? panel : null
  }

  private async openGeminiCanvasCardForExport(card: HTMLElement): Promise<HTMLElement | null> {
    const hadPanel = this.getGeminiCanvasPanelElement() !== null
    const expectedTitle = this.extractGeminiCanvasTitle(card)
    const currentPanel = this.getGeminiCanvasPanelElement()
    if (currentPanel && this.isGeminiCanvasPanelForTitle(currentPanel, expectedTitle)) {
      return currentPanel
    }

    card.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" })
    await this.sleep(60)

    for (const target of this.getGeminiCanvasCardClickTargets(card)) {
      this.simulateClick(target)
      const panel = await this.waitForGeminiCanvasPanel(expectedTitle)
      if (panel) {
        if (!hadPanel) {
          this.exportOpenedCanvasPanel = true
        }
        return panel
      }
    }

    return null
  }

  private getGeminiCanvasCardClickTargets(card: HTMLElement): HTMLElement[] {
    const chip = card.closest("immersive-entry-chip")
    const candidates = [card, chip].filter(
      (candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
    )
    const seen = new Set<HTMLElement>()
    return candidates.filter((candidate) => {
      if (seen.has(candidate)) return false
      seen.add(candidate)
      return true
    })
  }

  private async waitForGeminiCanvasPanel(
    expectedTitle?: string,
    timeoutMs = 3000,
  ): Promise<HTMLElement | null> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const panel = this.getGeminiCanvasPanelElement()
      if (panel && this.isGeminiCanvasPanelForTitle(panel, expectedTitle)) return panel
      await this.sleep(100)
    }

    const panel = this.getGeminiCanvasPanelElement()
    return panel && this.isGeminiCanvasPanelForTitle(panel, expectedTitle) ? panel : null
  }

  private isGeminiCanvasPanelForTitle(panel: HTMLElement, expectedTitle?: string): boolean {
    if (!expectedTitle || expectedTitle === "Gemini Canvas") return true

    const panelTitle = this.extractGeminiCanvasTitle(panel, "")
    return panelTitle === expectedTitle
  }

  private async closeGeminiCanvasPanel(): Promise<void> {
    const closeButton = this.getGeminiCanvasPanelElement()?.querySelector(
      'toolbar [data-test-id="close-button"]',
    )
    if (!(closeButton instanceof HTMLElement)) return

    closeButton.click()
    await this.sleep(150)
  }

  private async selectGeminiCanvasCodeTab(scope: ParentNode): Promise<boolean> {
    const codeTab = this.findGeminiCanvasCodeTab(scope)
    if (!codeTab) return false
    if (this.isGeminiCanvasCodeTabSelected(codeTab)) {
      return this.waitForGeminiCanvasCodeSurface(scope, codeTab, 1500)
    }

    const button = codeTab.querySelector("button")
    const target = button instanceof HTMLElement ? button : codeTab
    this.simulateClick(target)

    return this.waitForGeminiCanvasCodeSurface(scope, codeTab, 1800)
  }

  private async waitForGeminiCanvasCodeSurface(
    scope: ParentNode,
    codeTab: HTMLElement,
    timeoutMs: number,
  ): Promise<boolean> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const currentCodeTab = this.getCurrentGeminiCanvasCodeTab(scope, codeTab)
      if (
        this.isGeminiCanvasCodeTabSelected(currentCodeTab) &&
        this.hasGeminiCanvasCodeSurface(scope)
      ) {
        return true
      }
      await this.sleep(80)
    }

    const currentCodeTab = this.getCurrentGeminiCanvasCodeTab(scope, codeTab)
    return (
      this.isGeminiCanvasCodeTabSelected(currentCodeTab) && this.hasGeminiCanvasCodeSurface(scope)
    )
  }

  private getCurrentGeminiCanvasCodeTab(scope: ParentNode, fallback: HTMLElement): HTMLElement {
    if (fallback.isConnected) return fallback
    return this.findGeminiCanvasCodeTab(scope) || fallback
  }

  private findGeminiCanvasCodeTab(scope: ParentNode): HTMLElement | null {
    const explicit = scope.querySelector(GEMINI_CANVAS_CODE_TAB_SELECTOR)
    if (explicit instanceof HTMLElement) return explicit

    const groups = Array.from(scope.querySelectorAll(GEMINI_CANVAS_TAB_GROUP_SELECTOR))
    for (const group of groups) {
      if (
        !group.closest(GEMINI_CANVAS_IMMERSIVE_PANEL_SELECTOR) &&
        !group.closest(".immersive-artifact-container")
      ) {
        continue
      }

      const toggles = Array.from(group.querySelectorAll("mat-button-toggle")).filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      )
      if (toggles.length >= 2) {
        // Gemini app Canvas panel omits value attributes; its toolbar order is code, then preview.
        return toggles[0]
      }
    }

    return null
  }

  private isGeminiCanvasCodeTabSelected(tab: HTMLElement): boolean {
    if (tab.classList.contains("mat-button-toggle-checked")) return true
    const button = tab.querySelector("button[role='radio']")
    return button?.getAttribute("aria-checked") === "true"
  }

  private hasGeminiCanvasCodeSurface(scope: ParentNode): boolean {
    return (
      this.findGeminiCanvasCodeBlock(scope) !== null ||
      this.findGeminiCanvasCodeEditor(scope) !== null
    )
  }

  private async extractGeminiCanvasCodeArtifact(
    scope: ParentNode,
    fallbackTitle: string,
  ): Promise<GeminiCanvasCodeArtifact | null> {
    const codeBlock = this.findGeminiCanvasCodeBlock(scope)
    if (codeBlock) {
      return this.extractGeminiCanvasCodeBlockArtifact(codeBlock, fallbackTitle)
    }

    const editor = this.findGeminiCanvasCodeEditor(scope)
    if (editor) {
      return this.extractGeminiCanvasCodeEditorArtifact(editor, fallbackTitle)
    }

    return null
  }

  private findGeminiCanvasCodeBlock(scope: ParentNode): HTMLElement | null {
    if (scope instanceof HTMLElement && scope.matches("code-block")) {
      return scope
    }

    const block = scope.querySelector(GEMINI_CANVAS_CODE_BLOCK_SELECTOR)
    return block instanceof HTMLElement ? block : null
  }

  private findGeminiCanvasCodeEditor(scope: ParentNode): HTMLElement | null {
    if (scope instanceof HTMLElement && scope.matches(GEMINI_CANVAS_CODE_EDITOR_SELECTOR)) {
      return scope.classList.contains("hidden") ? null : scope
    }

    const editor = scope.querySelector(GEMINI_CANVAS_CODE_EDITOR_SELECTOR)
    if (!(editor instanceof HTMLElement) || editor.classList.contains("hidden")) return null
    return editor
  }

  private extractGeminiCanvasCodeBlockArtifact(
    codeBlock: HTMLElement,
    fallbackTitle: string,
  ): GeminiCanvasCodeArtifact | null {
    const codeElement = codeBlock.querySelector('[data-test-id="code-content"], pre code, code')
    const code = this.normalizeGeminiCanvasCode(
      this.extractTextWithLineBreaks(codeElement || codeBlock),
    )
    if (!code) return null

    return {
      title: this.extractGeminiCanvasTitle(codeBlock, fallbackTitle),
      language: this.extractGeminiCanvasCodeLanguage(codeBlock) || "text",
      code,
    }
  }

  private async extractGeminiCanvasCodeEditorArtifact(
    editor: HTMLElement,
    fallbackTitle: string,
  ): Promise<GeminiCanvasCodeArtifact | null> {
    const code =
      (await this.extractGeminiCanvasMainWorldMonacoCode(editor)) ||
      this.extractGeminiCanvasMonacoModelCode(editor) ||
      (await this.extractGeminiCanvasRenderedMonacoCode(editor))

    if (!code) return null

    return {
      title: this.extractGeminiCanvasTitle(editor, fallbackTitle),
      language: this.extractGeminiCanvasCodeLanguage(editor) || "text",
      code,
    }
  }

  private async extractGeminiCanvasMainWorldMonacoCode(editor: HTMLElement): Promise<string> {
    if (!document.documentElement.hasAttribute("data-ophel-gemini-canvas-main")) return ""

    const editorUri = editor.querySelector(".monaco-editor")?.getAttribute("data-uri") || ""
    if (!editorUri) return ""

    const requestId = `ophel-gemini-canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`

    return new Promise((resolve) => {
      let settled = false
      let timeoutId = 0
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        window.removeEventListener("message", handleMessage)
      }

      const finish = (code: string) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(this.normalizeGeminiCanvasCode(code))
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.origin && event.origin !== window.location.origin) return
        const data = event.data as {
          type?: unknown
          requestId?: unknown
          code?: unknown
        }
        if (data?.type !== GEMINI_CANVAS_CODE_RESPONSE_EVENT || data.requestId !== requestId) {
          return
        }

        finish(typeof data.code === "string" ? data.code : "")
      }

      timeoutId = window.setTimeout(() => finish(""), GEMINI_CANVAS_CODE_REQUEST_TIMEOUT_MS)
      window.addEventListener("message", handleMessage)
      window.postMessage(
        {
          type: GEMINI_CANVAS_CODE_REQUEST_EVENT,
          requestId,
          editorUri,
        },
        "*",
      )
    })
  }

  private extractGeminiCanvasMonacoModelCode(editor: HTMLElement): string {
    const monacoWindow = window as typeof window & {
      monaco?: {
        editor?: {
          getModels?: () => unknown[]
        }
      }
    }
    const models = monacoWindow.monaco?.editor?.getModels?.()
    if (!models?.length) return ""

    const editorUri = editor.querySelector(".monaco-editor")?.getAttribute("data-uri") || ""
    const matchingModel = models.find((model) => {
      const candidate = model as { uri?: { toString?: () => string } }
      return editorUri && candidate.uri?.toString?.() === editorUri
    })
    const model = matchingModel || (models.length === 1 ? models[0] : null)
    const getValue = (model as { getValue?: () => string } | null)?.getValue
    if (typeof getValue !== "function") return ""

    return this.normalizeGeminiCanvasCode(getValue.call(model))
  }

  private async extractGeminiCanvasRenderedMonacoCode(editor: HTMLElement): Promise<string> {
    const textarea = editor.querySelector("textarea.inputarea")
    if (textarea instanceof HTMLTextAreaElement && textarea.value.trim()) {
      return this.normalizeGeminiCanvasCode(textarea.value)
    }

    const scrollable = editor.querySelector(".monaco-scrollable-element")
    if (!(scrollable instanceof HTMLElement)) {
      return this.normalizeGeminiCanvasCode(
        this.extractGeminiCanvasVisibleMonacoLines(editor).join("\n"),
      )
    }

    const originalScrollTop = scrollable.scrollTop
    const viewportHeight = Math.max(scrollable.clientHeight, 1)
    const contentHeight = this.getGeminiCanvasMonacoContentHeight(editor)
    const maxScrollTop = Math.max(contentHeight - viewportHeight, scrollable.scrollHeight, 0)
    const step = Math.max(Math.floor(viewportHeight * 0.8), 120)
    const chunks: string[] = []

    for (let scrollTop = 0; scrollTop <= maxScrollTop; scrollTop += step) {
      scrollable.scrollTop = scrollTop
      scrollable.dispatchEvent(new Event("scroll", { bubbles: true }))
      await this.sleep(40)

      const lines = this.extractGeminiCanvasVisibleMonacoLines(editor)
      if (lines.length > 0) {
        chunks.push(lines.join("\n"))
      }
    }

    scrollable.scrollTop = originalScrollTop
    scrollable.dispatchEvent(new Event("scroll", { bubbles: true }))

    return this.normalizeGeminiCanvasCode(this.mergeGeminiCanvasRenderedCodeChunks(chunks))
  }

  private extractGeminiCanvasVisibleMonacoLines(editor: HTMLElement): string[] {
    const lineElements = Array.from(editor.querySelectorAll(".view-lines .view-line")).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    )

    return lineElements
      .sort((left, right) => this.getElementTop(left) - this.getElementTop(right))
      .map((line) => this.normalizeGeminiCanvasCodeLine(line.textContent || ""))
  }

  private getGeminiCanvasMonacoContentHeight(editor: HTMLElement): number {
    const heightCandidates = Array.from(
      editor.querySelectorAll(".view-lines, .margin, .lines-content"),
    ).flatMap((element) => {
      if (!(element instanceof HTMLElement)) return []
      return [
        element.scrollHeight,
        element.offsetHeight,
        this.parseCssPixelValue(element.style.height),
      ]
    })

    return Math.max(...heightCandidates, 0)
  }

  private mergeGeminiCanvasRenderedCodeChunks(chunks: string[]): string {
    const lines: string[] = []

    for (const chunk of chunks) {
      const chunkLines = chunk.split("\n")
      let overlap = 0
      const maxOverlap = Math.min(lines.length, chunkLines.length)

      for (let length = maxOverlap; length > 0; length -= 1) {
        const left = lines.slice(lines.length - length).join("\n")
        const right = chunkLines.slice(0, length).join("\n")
        if (left === right) {
          overlap = length
          break
        }
      }

      lines.push(...chunkLines.slice(overlap))
    }

    return lines.join("\n")
  }

  private getElementTop(element: HTMLElement): number {
    return this.parseCssPixelValue(element.style.top)
  }

  private parseCssPixelValue(value: string): number {
    const match = value.match(/-?\d+(?:\.\d+)?/)
    return match ? Number(match[0]) : 0
  }

  private extractGeminiCanvasTitle(element: Element, fallback = "Gemini Canvas"): string {
    const title =
      element.querySelector(".title-text, .card-title")?.textContent?.trim() ||
      element
        .closest(".immersive-artifact-container")
        ?.querySelector(".title-text")
        ?.textContent?.trim() ||
      element
        .closest(GEMINI_CANVAS_IMMERSIVE_PANEL_SELECTOR)
        ?.querySelector(".title-text")
        ?.textContent?.trim() ||
      fallback

    return title.replace(/\s+/g, " ").trim() || fallback
  }

  private extractGeminiCanvasCodeLanguage(element: Element): string {
    const label =
      element.querySelector(".code-block-decoration span")?.textContent ||
      element.closest("[data-mode-id]")?.getAttribute("data-mode-id") ||
      element.querySelector("[data-mode-id]")?.getAttribute("data-mode-id") ||
      ""
    const normalized = label.split(/\r?\n/)[0]?.trim().toLowerCase() || ""
    return normalized.replace(/[^a-z0-9_#+.-]/g, "")
  }

  private formatGeminiCanvasCodeArtifacts(artifacts: GeminiCanvasCodeArtifact[]): string {
    const deduped: GeminiCanvasCodeArtifact[] = []
    const seen = new Set<string>()

    for (const artifact of artifacts) {
      const key = `${artifact.title}\n${artifact.language}\n${artifact.code}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(artifact)
    }

    return deduped
      .map((artifact) => {
        const title = artifact.title ? `### Gemini Canvas: ${artifact.title}` : "### Gemini Canvas"
        return `${title}\n\n${this.formatGeminiCanvasCodeFence(artifact.code, artifact.language)}`
      })
      .join("\n\n")
  }

  private formatGeminiCanvasFallbackTitles(titles: string[]): string {
    const deduped = titles
      .map((title) => title.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((title, index, array) => array.indexOf(title) === index)

    return deduped.map((title) => `### Gemini Canvas: ${title}`).join("\n\n")
  }

  private formatGeminiCanvasCodeFence(code: string, language: string): string {
    let fence = "```"
    while (code.includes(fence)) {
      fence += "`"
    }

    return `${fence}${language || ""}\n${code}\n${fence}`
  }

  private normalizeGeminiCanvasCode(value: string): string {
    return value
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/^\n+/g, "")
      .replace(/\n+$/g, "")
  }

  private normalizeGeminiCanvasCodeLine(value: string): string {
    return value.replace(/\u00a0/g, " ").replace(/\s+$/g, "")
  }

  private joinExportSections(...sections: string[]): string {
    return sections
      .map((section) => section.trim())
      .filter(Boolean)
      .join("\n\n")
  }

  private isDeepResearchAppPage(): boolean {
    return (
      !this.isSharePage() &&
      (this.getDeepResearchAppDocumentElement() !== null ||
        this.getDeepResearchAppDocumentTrigger() !== null ||
        document.querySelector(`model-response ${GEMINI_DEEP_RESEARCH_CONFIRMATION_SELECTOR}`) !==
          null)
    )
  }

  private getDeepResearchAppDocumentElement(): Element | null {
    return document.querySelector(GEMINI_DEEP_RESEARCH_APP_DOCUMENT_MARKDOWN_SELECTOR)
  }

  private hasDeepResearchAppDocumentTrigger(): boolean {
    return this.getDeepResearchAppDocumentTrigger() !== null
  }

  private getDeepResearchAppDocumentTrigger(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll(GEMINI_DEEP_RESEARCH_APP_DOCUMENT_TRIGGER_SELECTOR),
    ).filter((node): node is HTMLElement => node instanceof HTMLElement)

    return (
      candidates.find((candidate) => {
        const card = candidate.matches('[data-test-id="gem-processing-card"]')
          ? candidate
          : candidate.querySelector('[data-test-id="gem-processing-card"]')
        if (!card?.querySelector(GEMINI_DEEP_RESEARCH_ICON_SELECTOR)) return false
        return candidate.closest("model-response") !== null
      }) || null
    )
  }

  private async openDeepResearchAppDocumentPanel(): Promise<boolean> {
    const trigger = this.getDeepResearchAppDocumentTrigger()
    if (!trigger) return false

    trigger.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    trigger.click()
    if (await this.waitForDeepResearchAppDocumentElement()) return true

    const card = trigger.matches('[data-test-id="gem-processing-card"]')
      ? trigger
      : trigger.querySelector('[data-test-id="gem-processing-card"]')
    if (card instanceof HTMLElement && card !== trigger) {
      card.click()
      return this.waitForDeepResearchAppDocumentElement()
    }

    return false
  }

  private async closeDeepResearchAppDocumentPanel(): Promise<void> {
    const closeButton = document.querySelector(
      `${GEMINI_DEEP_RESEARCH_IMMERSIVE_PANEL_SELECTOR} [data-test-id="close-button"], immersive-panel [data-test-id="close-button"]`,
    )
    if (!(closeButton instanceof HTMLElement)) return

    closeButton.click()
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  private async waitForDeepResearchAppDocumentElement(timeoutMs = 3000): Promise<boolean> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (this.getDeepResearchAppDocumentElement()) return true
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return this.getDeepResearchAppDocumentElement() !== null
  }

  private isGeminiExportLifecycleState(state: unknown): state is GeminiExportLifecycleState {
    return (
      typeof state === "object" &&
      state !== null &&
      "openedDeepResearchPanel" in state &&
      typeof (state as GeminiExportLifecycleState).openedDeepResearchPanel === "boolean"
    )
  }

  private isDeepResearchDocumentSharePage(): boolean {
    return (
      this.isSharePage() &&
      document.querySelector(GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_SELECTOR) !== null
    )
  }

  private isDeepResearchConversationSharePage(): boolean {
    return (
      this.isSharePage() &&
      document.querySelector(GEMINI_DEEP_RESEARCH_ARTIFACT_SHARE_SELECTOR) !== null
    )
  }

  private isGeminiConversationSharePage(): boolean {
    return this.isSharePage() && document.querySelector(GEMINI_SHARE_TURN_SELECTOR) !== null
  }

  private extractDeepResearchDocumentShareMessages(
    collector?: GeminiExportAssetCollector,
  ): ExportMessage[] {
    const markdown = document.querySelector(
      `${GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_SELECTOR} ${GEMINI_DEEP_RESEARCH_MARKDOWN_SELECTOR}`,
    )
    const content = markdown ? this.extractAssistantResponseTextWithAssets(markdown, collector) : ""
    const exportContent =
      content && collector
        ? this.appendDeepResearchReportAssetLink(
            collector,
            content,
            this.getDeepResearchDocumentShareTitle(),
          )
        : content
    return exportContent ? [{ role: "assistant", content: exportContent }] : []
  }

  private async extractDeepResearchAppMessages(
    collector?: GeminiExportAssetCollector,
  ): Promise<ExportMessage[]> {
    const documentElement = this.getDeepResearchAppDocumentElement()
    if (this.hasDeepResearchAppDocumentTrigger() && !documentElement) {
      console.warn("[GeminiAdapter] Deep Research report panel is not available for export")
      return []
    }

    const messages: ExportMessage[] = []
    const collectedElements = new Set<Element>()
    const root = this.getScrollContainer() || document

    const messageElements = Array.from(root.querySelectorAll("user-query, model-response")).sort(
      (left, right) => this.compareDomOrder(left, right),
    )

    for (const element of messageElements) {
      if (element.closest("immersive-panel")) continue

      const role = element.tagName.toLowerCase() === "user-query" ? "user" : "assistant"
      const content =
        role === "user"
          ? (collector
              ? await this.extractUserQueryExportContentWithResolvedAssets(element, collector)
              : this.extractUserQueryExportContentWithAssets(element)
            ).trim()
          : this.extractDeepResearchAppAssistantResponseContent(element, collector).trim()

      if (!content) continue

      collectedElements.add(element)
      messages.push({ role, content })
    }

    if (documentElement && !collectedElements.has(documentElement)) {
      const content = this.extractAssistantResponseTextWithAssets(documentElement, collector).trim()
      if (content) {
        messages.push({
          role: "assistant",
          content: collector ? this.appendDeepResearchReportAssetLink(collector, content) : content,
        })
      }
    }

    return this.dedupeAdjacentExportMessages(messages)
  }

  private extractDeepResearchAppAssistantResponseContent(
    element: Element,
    collector?: GeminiExportAssetCollector,
  ): string {
    const markdown = element.querySelector(GEMINI_DEEP_RESEARCH_MARKDOWN_SELECTOR)
    return this.extractAssistantResponseTextWithAssets(markdown || element, collector)
  }

  private async extractDeepResearchConversationShareMessages(
    collector?: GeminiExportAssetCollector,
  ): Promise<ExportMessage[]> {
    const { messages, collectedElements } = await this.collectGeminiShareTurnMessages(collector)

    this.collectDetachedDeepResearchArtifactMessages(collectedElements, collector).forEach(
      (message) => {
        messages.push(message)
      },
    )

    return this.dedupeAdjacentExportMessages(messages)
  }

  private async extractGeminiConversationShareMessages(
    collector?: GeminiExportAssetCollector,
  ): Promise<ExportMessage[]> {
    return (await this.collectGeminiShareTurnMessages(collector)).messages
  }

  private async collectGeminiShareTurnMessages(collector?: GeminiExportAssetCollector): Promise<{
    messages: ExportMessage[]
    collectedElements: Set<Element>
  }> {
    const messages: ExportMessage[] = []
    const collectedElements = new Set<Element>()
    const turns = Array.from(document.querySelectorAll(GEMINI_SHARE_TURN_SELECTOR))

    for (const turn of turns) {
      let canvasArtifactsAdded = false
      const turnMessages = [
        ...Array.from(turn.querySelectorAll("user-query")).map((element) => ({
          role: "user" as const,
          element,
        })),
        ...Array.from(turn.querySelectorAll(GEMINI_SHARE_ASSISTANT_MARKDOWN_SELECTOR)).map(
          (element) => ({
            role: "assistant" as const,
            element,
          }),
        ),
      ].sort((left, right) => this.compareDomOrder(left.element, right.element))

      for (const { role, element } of turnMessages) {
        const content =
          role === "user"
            ? (collector
                ? await this.extractUserQueryExportContentWithResolvedAssets(element, collector)
                : this.extractUserQueryExportContentWithAssets(element)
              ).trim()
            : this.joinExportSections(
                this.extractAssistantResponseTextWithAssets(element, collector),
                !canvasArtifactsAdded
                  ? await this.extractGeminiCanvasShareArtifactsFromTurn(turn, collector)
                  : "",
              )
        if (!content) continue
        if (role === "assistant") {
          canvasArtifactsAdded = true
        }
        collectedElements.add(element)
        messages.push({ role, content })
      }

      if (!canvasArtifactsAdded) {
        const canvasContent = await this.extractGeminiCanvasShareArtifactsFromTurn(turn, collector)
        if (canvasContent) {
          messages.push({ role: "assistant", content: canvasContent })
        }
      }
    }

    return {
      messages: this.dedupeAdjacentExportMessages(messages),
      collectedElements,
    }
  }

  private collectDetachedDeepResearchArtifactMessages(
    collectedElements: Set<Element>,
    collector?: GeminiExportAssetCollector,
  ): ExportMessage[] {
    return Array.from(
      document.querySelectorAll(
        `${GEMINI_DEEP_RESEARCH_ARTIFACT_SHARE_SELECTOR} ${GEMINI_DEEP_RESEARCH_MARKDOWN_SELECTOR}`,
      ),
    ).flatMap((element) => {
      if (collectedElements.has(element)) return []

      const content = this.extractAssistantResponseTextWithAssets(element, collector).trim()
      const exportContent =
        content && collector
          ? this.appendDeepResearchReportAssetLink(
              collector,
              content,
              this.getDeepResearchArtifactShareTitle(),
            )
          : content
      return exportContent ? [{ role: "assistant", content: exportContent }] : []
    })
  }

  private appendDeepResearchReportAssetLink(
    collector: GeminiExportAssetCollector,
    content: string,
    title?: string | null,
  ): string {
    return createMarkdownDocumentAssetLink(collector, content, {
      title,
      fallbackTitle: "deep-research-report",
      directory: "assets/documents",
      idPrefix: "gemini-deep-research-report",
    })
  }

  private createUniqueGeminiExportPath(
    path: string,
    collector: GeminiExportAssetCollector,
  ): string {
    return createUniqueExportAssetPath(path, collector.usedPaths)
  }

  private extractMarkdownExportContent(element: Element): string {
    const bodyMarkdown = htmlToMarkdown(element) || this.extractTextWithLineBreaks(element)
    return bodyMarkdown.trim()
  }

  private compareDomOrder(left: Element, right: Element): number {
    if (left === right) return 0
    const position = left.compareDocumentPosition(right)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private dedupeAdjacentExportMessages(messages: ExportMessage[]): ExportMessage[] {
    const deduped: ExportMessage[] = []
    messages.forEach((message) => {
      const previous = deduped[deduped.length - 1]
      if (previous?.role === message.role && previous.content === message.content) {
        return
      }
      deduped.push(message)
    })
    return deduped
  }

  private getDeepResearchDocumentShareTitle(): string | null {
    const title = document.querySelector(`${GEMINI_DEEP_RESEARCH_DOCUMENT_SHARE_SELECTOR} h1`)
    return title?.textContent?.trim() || null
  }

  private getDeepResearchArtifactShareTitle(): string | null {
    const title = document.querySelector(`${GEMINI_DEEP_RESEARCH_ARTIFACT_SHARE_SELECTOR} h1`)
    return title?.textContent?.trim() || null
  }

  /**
   * 将渲染后的 HTML 替换到用户提问元素中
   * Gemini 标准版：隐藏 .query-text 并插入渲染容器
   */
  replaceUserQueryContent(element: Element, html: string): boolean {
    const textContainer = element.querySelector(".query-text")
    if (!textContainer) return false

    // 检查是否已经处理过
    if (textContainer.nextElementSibling?.classList.contains("gh-user-query-markdown")) {
      return false
    }

    // 创建渲染容器
    const rendered = document.createElement("div")
    rendered.className = "gh-user-query-markdown gh-user-query-markdown-gemini gh-markdown-preview"
    if (!setSafeHTML(rendered, html)) {
      return false
    }

    // Gemini 使用 Angular ViewEncapsulation，其 [_ngcontent-*] pre { background !important }
    // 特异性高于任何样式表规则，只有内联 important 能可靠覆盖
    rendered.querySelectorAll("pre").forEach((pre) => {
      const preElement = pre as HTMLElement
      preElement.style.setProperty("background", "var(--gh-user-query-code-bg)", "important")
      preElement.style.setProperty("background-color", "var(--gh-user-query-code-bg)", "important")
      preElement.style.setProperty("color", "var(--gh-user-query-code-fg)", "important")
      preElement.querySelectorAll("code").forEach((code) => {
        const codeElement = code as HTMLElement
        codeElement.style.setProperty("background", "transparent", "important")
        codeElement.style.setProperty("background-color", "transparent", "important")
        codeElement.style.setProperty("color", "var(--gh-user-query-code-fg)", "important")
      })
    })

    // 隐藏原内容
    ;(textContainer as HTMLElement).style.display = "none"

    // 插入到原容器后面
    textContainer.after(rendered)
    return true
  }

  getExportConfig(): ExportConfig {
    return {
      userQuerySelector: "user-query",
      assistantResponseSelector: "model-response, .model-response-container .markdown",
      turnSelector: ".conversation-turn",
      useShadowDOM: false,
    }
  }

  extractOutline(maxLevel = 6, includeUserQueries = false, showWordCount = false): OutlineItem[] {
    const outline: OutlineItem[] = []
    const container = document.querySelector(this.getResponseContainerSelector())
    if (!container) return outline

    // 辅助函数：提取 AI 回复的消息 ID
    const getMessageId = (el: Element): string | null => {
      const msgContent = el.closest("message-content")
      if (msgContent && msgContent.id) {
        const match = msgContent.id.match(/(r_[a-f0-9]+)/)
        if (match) return match[1]
      }
      return null
    }

    // 辅助函数：提取用户提问的消息 ID
    const getUserQueryId = (el: Element): string | null => {
      const btn = el.querySelector('button[jslog*="BardVeMetadataKey"]')
      if (btn) {
        const jslog = btn.getAttribute("jslog") || ""
        const match = jslog.match(/BardVeMetadataKey.*?["'](r_[a-f0-9]+)["']/)
        if (match) return match[1]
      }
      return null
    }

    // 辅助函数：生成标题的稳定 ID
    const messageHeaderCounts: Record<string, Record<string, number>> = {}
    const generateHeaderId = (msgId: string, tagName: string, text: string): string => {
      if (!messageHeaderCounts[msgId]) {
        messageHeaderCounts[msgId] = {}
      }

      const key = `${tagName}-${text}`
      const count = messageHeaderCounts[msgId][key] || 0
      messageHeaderCounts[msgId][key] = count + 1

      return `${msgId}::${key}::${count}`
    }

    const textSignatureCache = new WeakMap<Element, string>()
    const getTextSignature = (element: Element | null): string => {
      if (!element) return "none"
      const cached = textSignatureCache.get(element)
      if (cached) return cached
      const signature = hashTextForCache(element.textContent || "")
      textSignatureCache.set(element, signature)
      return signature
    }

    // 辅助函数：计算字数
    const userQuerySelector = this.getUserQuerySelector()
    const calculateWordCount = (
      startEl: Element,
      nextEl: Element | null,
      isUserQueryItem: boolean,
    ): number => {
      if (!startEl) return 0
      const signature = [
        isUserQueryItem ? "user" : "heading",
        getTextSignature(startEl),
        getTextSignature(nextEl),
        getTextSignature(container),
      ].join("|")
      const cached = this.outlineWordCountCache.get(startEl)
      if (cached?.signature === signature) return cached.count

      try {
        if (isUserQueryItem) {
          // 对于用户提问，Gemini 的结构是：
          // <user-query>...</user-query>
          // <model-response>...</model-response> (AI 回复)
          // 它们是 siblings。为了兼容可能存在的多个回复块（例如工具调用、引用等）
          // 我们收集直到下一个 user-query 之前的所有内容
          let current = startEl.nextElementSibling
          let totalLength = 0

          while (current) {
            const tagName = current.tagName.toLowerCase()
            if (tagName === "user-query") {
              break // 遇到下一个用户提问，结束
            }

            if (tagName === "model-response") {
              // 获取 markdown 内容（排除思维链 model-thoughts）
              const markdownContent = current.querySelector(".model-response-text, message-content")
              if (markdownContent) {
                // 计算文本长度时排除思维链内容
                const thoughts = current.querySelector("model-thoughts")
                const thoughtsLength = thoughts?.textContent?.trim().length || 0
                const totalText = markdownContent.textContent?.trim().length || 0
                totalLength += Math.max(0, totalText - thoughtsLength)
              }
            }

            current = current.nextElementSibling
          }
          this.outlineWordCountCache.set(startEl, { signature, count: totalLength })
          return totalLength
        }

        // 对于标题（Heading），使用基类的 Range 工具方法
        const messageContent = startEl.closest("message-content")
        const count = this.calculateRangeWordCount(startEl, nextEl, messageContent || container)
        this.outlineWordCountCache.set(startEl, { signature, count })
        return count
      } catch {
        return 0
      }
    }

    // 统一收集逻辑：为了正确处理边界，即使不包含 userQueries，我们也最好获取它们作为边界参考
    // 但为了保持原有逻辑简单，我们分别处理
    // 实际上，如果不包含 userQueries，我们只需要在 Heading 之间计算
    // 用户提问本身就是一个自然的分割线，通常 Heading 不会跨越 User Query (因为是新的回复)
    // 所以如果不包含 UserQuery，boundary 只需要是下一个 Heading

    if (!includeUserQueries) {
      const headingSelectors: string[] = []
      for (let i = 1; i <= maxLevel; i++) {
        headingSelectors.push(`h${i}`)
      }

      const headings = Array.from(container.querySelectorAll(headingSelectors.join(", ")))

      headings.forEach((heading, index) => {
        if (this.shouldSkipOutlineHeading(heading)) return

        const level = parseInt(heading.tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: heading.textContent?.trim() || "",
            element: heading,
          }

          // 尝试生成稳定 ID
          const msgId = getMessageId(heading)
          if (msgId) {
            const tagName = heading.tagName.toLowerCase()
            item.id = generateHeaderId(msgId, tagName, item.text)
          }

          // 字数统计
          if (showWordCount) {
            let nextBoundaryEl: Element | null = null
            // 寻找下一个边界
            for (let i = index + 1; i < headings.length; i++) {
              const candidate = headings[i]
              const candidateLevel = parseInt(candidate.tagName.charAt(1), 10)
              if (candidateLevel <= level) {
                nextBoundaryEl = candidate
                break
              }
            }
            item.wordCount = calculateWordCount(heading, nextBoundaryEl, false)
          }

          outline.push(item)
        }
      })
      return outline
    }

    // 包含用户提问的模式
    const headingSelectors: string[] = []
    for (let i = 1; i <= maxLevel; i++) {
      headingSelectors.push(`h${i}`)
    }

    const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(", ")}`
    const allElements = Array.from(container.querySelectorAll(combinedSelector))

    allElements.forEach((element, index) => {
      const tagName = element.tagName.toLowerCase()

      if (tagName === "user-query") {
        let queryText = this.extractUserQueryText(element)
        let isTruncated = false
        if (queryText.length > 200) {
          queryText = queryText.substring(0, 200)
          isTruncated = true
        }

        const item: OutlineItem = {
          level: 0,
          text: queryText,
          element,
          isUserQuery: true,
          isTruncated,
        }

        const msgId = getUserQueryId(element)
        if (msgId) {
          item.id = msgId
        }

        if (showWordCount) {
          // 用户提问的 nextBoundary 实际上对于 calculateWordCount(isUserQuery=true) 不重要
          // 但我们可以传 null
          item.wordCount = calculateWordCount(element, null, true)
        }

        outline.push(item)
      } else if (/^h[1-6]$/.test(tagName)) {
        if (this.shouldSkipOutlineHeading(element)) return

        const level = parseInt(tagName.charAt(1), 10)
        if (level <= maxLevel) {
          const item: OutlineItem = {
            level,
            text: element.textContent?.trim() || "",
            element,
          }

          const msgId = getMessageId(element)
          if (msgId) {
            const tagName = element.tagName.toLowerCase()
            item.id = generateHeaderId(msgId, tagName, item.text)
          }

          if (showWordCount) {
            let nextBoundaryEl: Element | null = null
            for (let i = index + 1; i < allElements.length; i++) {
              const candidate = allElements[i]
              const candidateTagName = candidate.tagName.toLowerCase()

              if (candidateTagName === "user-query") {
                nextBoundaryEl = candidate
                break
              }

              if (/^h[1-6]$/.test(candidateTagName)) {
                const candidateLevel = parseInt(candidateTagName.charAt(1), 10)
                if (candidateLevel <= item.level) {
                  nextBoundaryEl = candidate
                  break
                }
              }
            }
            item.wordCount = calculateWordCount(element, nextBoundaryEl, false)
          }

          outline.push(item)
        }
      }
    })

    return outline
  }

  // ==================== 生成状态检测 ====================

  isGenerating(): boolean {
    const stopIcon = document.querySelector('mat-icon[fonticon="stop"]')
    return stopIcon !== null && (stopIcon as HTMLElement).offsetParent !== null
  }

  getStopButtonSelectors(): string[] {
    return ['button:has(mat-icon[fonticon="stop"])', 'mat-icon[fonticon="stop"]']
  }

  requiresDomConfirmationForNetworkGeneration(): boolean {
    return true
  }

  getModelName(): string | null {
    const switchLabel = document.querySelector(".input-area-switch-label")
    if (switchLabel) {
      const firstSpan = switchLabel.querySelector("span")
      if (firstSpan?.textContent) {
        const text = firstSpan.textContent.trim()
        if (text.length > 0 && text.length <= 20) {
          return text
        }
      }
    }
    return null
  }

  getNetworkMonitorConfig(): NetworkMonitorConfig {
    return {
      urlPatterns: ["BardFrontendService", "StreamGenerate"],
      silenceThreshold: 3000,
    }
  }

  afterPropertiesSet(
    options: { modelLockConfig?: { enabled: boolean; keyword: string } } = {},
  ): void {
    super.afterPropertiesSet(options)

    if (!this.myStuffEnhancer) {
      this.myStuffEnhancer = new GeminiMyStuffEnhancer({
        getUserPathPrefix: () => this.getUserPathPrefix(),
      })
      this.myStuffEnhancer.start()
    }

    this.startDeepResearchPanelActions()
    this.startGeminiCanvasPanelActions()
  }

  // ==================== 模型锁定 ====================

  getDefaultLockSettings(): { enabled: boolean; keyword: string } {
    return { enabled: false, keyword: "" }
  }

  getModelSwitcherConfig(keyword: string): ModelSwitcherConfig {
    return {
      targetModelKeyword: keyword,
      selectorButtonSelectors: [
        ".input-area-switch-label",
        ".model-selector",
        '[data-test-id="model-selector"]',
        '[aria-label*="model"]',
        'button[aria-haspopup="menu"]',
      ],
      menuItemSelector: '.mode-title, [role="menuitem"], [role="option"]',
      checkInterval: 1000,
      maxAttempts: 15,
      menuRenderDelay: 300,
    }
  }

  // ==================== 主题切换 ====================

  /**
   * 切换 Gemini 主题
   * 直接修改 localStorage + body.className 实现即时无感切换
   * @param targetMode 目标主题模式
   */
  async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
    try {
      // Gemini 使用 "Bard-Color-Theme" 键存储主题
      // 值域：Bard-Light-Theme / Bard-Dark-Theme
      // 当设置为跟随系统时，localStorage 里没有这个变量
      const themeValue = targetMode === "dark" ? "Bard-Dark-Theme" : "Bard-Light-Theme"
      localStorage.setItem("Bard-Color-Theme", themeValue)

      // 同时更新 body.className（Gemini 使用 body.dark-theme / body.light-theme）
      if (targetMode === "dark") {
        document.body.classList.add("dark-theme")
        document.body.classList.remove("light-theme")
      } else {
        document.body.classList.remove("dark-theme")
        document.body.classList.add("light-theme")
      }

      // 更新 colorScheme
      document.body.style.colorScheme = targetMode

      // 触发 storage 事件
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "Bard-Color-Theme",
          newValue: themeValue,
          storageArea: localStorage,
        }),
      )

      return true
    } catch (error) {
      console.error("[GeminiAdapter] toggleTheme error:", error)
      return false
    }
  }
}
