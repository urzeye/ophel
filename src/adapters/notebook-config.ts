import { SITE_IDS } from "~constants/defaults"

import type { BuiltinSiteConfig, SitePrivateSelectors } from "./declarative"
import { BUILTIN_FEATURE_CAPABILITIES } from "./feature-capabilities"

export interface NotebookSiteConfig extends BuiltinSiteConfig {
  sitePrivateSelectors: SitePrivateSelectors & {
    workspace: string
    sourceRoot: string
    sourceScroll: string
    studioRoot: string
    studioScroll: string
    headings: string
    sourceTitle: string
    studioTitle: string
  }
}

export const NOTEBOOK_CONFIG_VERSION = 1

export const NOTEBOOK_CONFIG: NotebookSiteConfig = {
  capabilities: [...BUILTIN_FEATURE_CAPABILITIES[SITE_IDS.NOTEBOOK]],
  theme: { primary: "#4285f4", secondary: "#6c63ff" },
  traits: {
    historyLazyLoad: false,
    strictCapabilities: true,
    minimalEnhancements: true,
    domSnapshotExport: true,
  },
  selectors: {
    textarea: ["chat-panel query-box textarea"],
    responseContainer: "chat-panel .chat-panel-content",
    scrollContainer: ["chat-panel .chat-panel-content"],
    userQuery: "chat-message .from-user-message-inner-content",
    assistantResponse: "chat-message .to-user-message-inner-content labs-tailwind-doc-viewer",
    chatContent: ["chat-message"],
  },
  input: { mode: "textarea", submitKey: "Enter" },
  supportsHostThemeSync: true,
  quickQuote: "disabled",
  mermaidSupport: "native",
  panelAvoidance: {
    scopeSelector: "notebook",
    widthSelectors: [
      {
        selector:
          "notebook > .panel-container > .source-panel:has(source-viewer), notebook > .panel-container > .studio-panel:has(artifact-viewer), notebook > .panel-container > .chat-panel",
        property: "max-inline-size",
        extraCss: "inline-size: auto !important; min-inline-size: 285px !important;",
      },
    ],
    insetSelectors: [
      {
        selector: "notebook > .panel-container",
        insetMode: "edge",
        leftProperty: "padding-left",
        rightProperty: "padding-right",
        extraCss: "box-sizing: border-box; min-width: 0 !important;",
      },
    ],
    gap: 12,
    minSafeWidth: 900,
    minViewportWidth: 1100,
  },
  sitePrivateSelectors: {
    workspace: "notebook > .panel-container",
    sourceRoot: "section.source-panel source-viewer .elements-container labs-tailwind-doc-viewer",
    sourceScroll: "section.source-panel source-viewer .scroll-area",
    studioRoot: "section.studio-panel artifact-viewer labs-tailwind-doc-viewer",
    studioScroll: "section.studio-panel artifact-viewer .artifact-content-scrollable",
    headings: 'h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]',
    sourceTitle: "section.source-panel .source-title",
    studioTitle: "section.studio-panel input.artifact-title",
  },
}
