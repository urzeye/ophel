export const USERSCRIPT_ASSET_REPOSITORY = "urzeye/ophel"
export const USERSCRIPT_ASSET_BRANCH = "userscript-assets"
export const USERSCRIPT_MERMAID_RUNNER_REPOSITORY = "urzeye/ophel"
export const USERSCRIPT_MERMAID_RUNNER_BRANCH = "main"
export const USERSCRIPT_MERMAID_TINY_VERSION = "11.13.0"
export const USERSCRIPT_MERMAID_RUNNER_CDN_URL = `https://cdn.jsdelivr.net/gh/${USERSCRIPT_MERMAID_RUNNER_REPOSITORY}@${USERSCRIPT_MERMAID_RUNNER_BRANCH}/assets/assistant-mermaid-runner.js`
export const USERSCRIPT_MERMAID_VENDOR_CDN_URL = `https://cdn.jsdelivr.net/npm/@mermaid-js/tiny@${USERSCRIPT_MERMAID_TINY_VERSION}/dist/mermaid.tiny.js`

export const USERSCRIPT_RESOURCE_DEFINITIONS = {
  styles: {
    metaName: "ophelStyles",
    fileName: "ophel.user.css",
  },
  icon: {
    metaName: "ophelIcon",
    fileName: "ophel-icon.png",
  },
  notificationDefault: {
    metaName: "ophelNotificationDefault",
    fileName: "ophel-sound-default.mp3",
  },
  notificationSoftChime: {
    metaName: "ophelNotificationSoftChime",
    fileName: "ophel-sound-soft-chime.ogg",
  },
  notificationGlassPing: {
    metaName: "ophelNotificationGlassPing",
    fileName: "ophel-sound-glass-ping.ogg",
  },
  notificationBrightAlert: {
    metaName: "ophelNotificationBrightAlert",
    fileName: "ophel-sound-bright-alert.ogg",
  },
  watermarkBg48: {
    metaName: "ophelWatermarkBg48",
    fileName: "ophel-watermark-bg-48.png",
  },
  watermarkBg96: {
    metaName: "ophelWatermarkBg96",
    fileName: "ophel-watermark-bg-96.png",
  },
  assistantMermaidRunner: {
    metaName: "ophelAssistantMermaidRunner",
    fileName: "ophel-assistant-mermaid-runner.js",
    externalUrl: USERSCRIPT_MERMAID_RUNNER_CDN_URL,
  },
  assistantMermaidVendor: {
    metaName: "ophelAssistantMermaidVendor",
    fileName: "ophel-assistant-mermaid-vendor.js",
    externalUrl: USERSCRIPT_MERMAID_VENDOR_CDN_URL,
  },
} as const

export type UserscriptResourceKey = keyof typeof USERSCRIPT_RESOURCE_DEFINITIONS

export type UserscriptResourceMetaName =
  (typeof USERSCRIPT_RESOURCE_DEFINITIONS)[UserscriptResourceKey]["metaName"]

export function getUserscriptAssetBaseUrl(): string {
  const explicitBaseUrl =
    typeof process !== "undefined" ? process.env.USERSCRIPT_ASSET_BASE_URL : undefined

  if (explicitBaseUrl && explicitBaseUrl.trim().length > 0) {
    return explicitBaseUrl.replace(/\/+$/, "")
  }

  return `https://cdn.jsdelivr.net/gh/${USERSCRIPT_ASSET_REPOSITORY}@${USERSCRIPT_ASSET_BRANCH}`
}

export function getUserscriptResourceUrls(
  resourcePaths: Partial<Record<UserscriptResourceMetaName, string>>,
): Record<UserscriptResourceMetaName, string> {
  const baseUrl = getUserscriptAssetBaseUrl()

  return Object.fromEntries(
    Object.values(USERSCRIPT_RESOURCE_DEFINITIONS).map((definition) => {
      const externalUrl = "externalUrl" in definition ? definition.externalUrl : undefined

      return [
        definition.metaName,
        externalUrl || `${baseUrl}/${resourcePaths[definition.metaName]}`,
      ]
    }),
  ) as Record<UserscriptResourceMetaName, string>
}
