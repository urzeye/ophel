export const USERSCRIPT_ASSET_REPOSITORY = "urzeye/ophel"
export const USERSCRIPT_ASSET_BRANCH = "userscript-assets"
export const USERSCRIPT_MERMAID_RUNNER_REPOSITORY = "urzeye/ophel"
export const USERSCRIPT_MERMAID_RUNNER_BRANCH = "main"
export const USERSCRIPT_MERMAID_TINY_VERSION = "11.13.0"
export const USERSCRIPT_MERMAID_RUNNER_CDN_URL = `https://cdn.jsdelivr.net/gh/${USERSCRIPT_MERMAID_RUNNER_REPOSITORY}@${USERSCRIPT_MERMAID_RUNNER_BRANCH}/assets/assistant-mermaid-runner.js`
export const USERSCRIPT_MERMAID_VENDOR_CDN_URL = `https://cdn.jsdelivr.net/npm/@mermaid-js/tiny@${USERSCRIPT_MERMAID_TINY_VERSION}/dist/mermaid.tiny.js`
export const USERSCRIPT_SUPPORTED_LOCALES = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "ru",
  "es",
  "pt",
] as const

export type UserscriptLocale = (typeof USERSCRIPT_SUPPORTED_LOCALES)[number]

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

export const USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS = {
  "zh-CN": {
    metaName: "ophelLocaleZhCN",
    fileName: "ophel.locale.zh-CN.json",
  },
  "zh-TW": {
    metaName: "ophelLocaleZhTW",
    fileName: "ophel.locale.zh-TW.json",
  },
  en: {
    metaName: "ophelLocaleEn",
    fileName: "ophel.locale.en.json",
  },
  ja: {
    metaName: "ophelLocaleJa",
    fileName: "ophel.locale.ja.json",
  },
  ko: {
    metaName: "ophelLocaleKo",
    fileName: "ophel.locale.ko.json",
  },
  fr: {
    metaName: "ophelLocaleFr",
    fileName: "ophel.locale.fr.json",
  },
  de: {
    metaName: "ophelLocaleDe",
    fileName: "ophel.locale.de.json",
  },
  ru: {
    metaName: "ophelLocaleRu",
    fileName: "ophel.locale.ru.json",
  },
  es: {
    metaName: "ophelLocaleEs",
    fileName: "ophel.locale.es.json",
  },
  pt: {
    metaName: "ophelLocalePt",
    fileName: "ophel.locale.pt.json",
  },
} as const

export type UserscriptResourceKey = keyof typeof USERSCRIPT_RESOURCE_DEFINITIONS

export type UserscriptResourceMetaName =
  (typeof USERSCRIPT_RESOURCE_DEFINITIONS)[UserscriptResourceKey]["metaName"]

export type UserscriptLocaleResourceMetaName =
  (typeof USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS)[UserscriptLocale]["metaName"]

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

export function getUserscriptLocaleResourceUrls(
  resourcePaths: Partial<Record<UserscriptLocaleResourceMetaName, string>>,
): Record<UserscriptLocaleResourceMetaName, string> {
  const baseUrl = getUserscriptAssetBaseUrl()

  return Object.fromEntries(
    USERSCRIPT_SUPPORTED_LOCALES.map((locale) => {
      const definition = USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS[locale]
      return [definition.metaName, `${baseUrl}/${resourcePaths[definition.metaName]}`]
    }),
  ) as Record<UserscriptLocaleResourceMetaName, string>
}

export function isUserscriptLocale(value: string): value is UserscriptLocale {
  return Object.prototype.hasOwnProperty.call(USERSCRIPT_LOCALE_RESOURCE_DEFINITIONS, value)
}
