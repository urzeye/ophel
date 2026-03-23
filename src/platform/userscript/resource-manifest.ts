export const USERSCRIPT_ASSET_REPOSITORY = "urzeye/ophel"
export const USERSCRIPT_ASSET_BRANCH = "userscript-assets"

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
  resourcePaths: Record<UserscriptResourceMetaName, string>,
): Record<UserscriptResourceMetaName, string> {
  const baseUrl = getUserscriptAssetBaseUrl()

  return Object.fromEntries(
    Object.values(USERSCRIPT_RESOURCE_DEFINITIONS).map(({ metaName }) => [
      metaName,
      `${baseUrl}/${resourcePaths[metaName]}`,
    ]),
  ) as Record<UserscriptResourceMetaName, string>
}
