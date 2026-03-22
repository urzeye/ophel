export const USERSCRIPT_RELEASE_REPOSITORY = "urzeye/ophel"

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

export function getUserscriptReleaseAssetBaseUrl(version: string): string {
  const normalizedVersion = version.startsWith("v") ? version : `v${version}`
  return `https://github.com/${USERSCRIPT_RELEASE_REPOSITORY}/releases/download/${normalizedVersion}`
}

export function getUserscriptResourceUrls(
  version: string,
): Record<UserscriptResourceMetaName, string> {
  const baseUrl = getUserscriptReleaseAssetBaseUrl(version)

  return Object.fromEntries(
    Object.values(USERSCRIPT_RESOURCE_DEFINITIONS).map(({ metaName, fileName }) => [
      metaName,
      `${baseUrl}/${fileName}`,
    ]),
  ) as Record<UserscriptResourceMetaName, string>
}
