import type { PackManager } from "~core/pack-manager"

import {
  createSitePackRegistrationManager,
  type ManifestContentScriptDescriptor,
  type SitePackOriginPermissionRequestContext,
} from "./site-pack-registration"
import { extensionStorage } from "./storage"

const SITE_PACK_PERMISSION_WINDOW_TIMEOUT_MS = 120_000

type PermissionAddedListener = Parameters<typeof chrome.permissions.onAdded.addListener>[0]

const permissionAddedEvent = chrome.permissions.onAdded as typeof chrome.permissions.onAdded & {
  removeListener(callback: PermissionAddedListener): void
}

const getPermissionWindowPosition = async (): Promise<{
  left?: number
  top?: number
}> => {
  const currentWindow = await chrome.windows.getCurrent()
  const width = 450
  const height = 380
  return {
    ...(currentWindow.left !== undefined && currentWindow.width !== undefined
      ? { left: currentWindow.left + Math.round((currentWindow.width - width) / 2) }
      : {}),
    ...(currentWindow.top !== undefined && currentWindow.height !== undefined
      ? { top: currentWindow.top + Math.round((currentWindow.height - height) / 2) }
      : {}),
  }
}

const waitForPermissionWindow = async (
  windowId: number,
  origins: readonly string[],
): Promise<boolean> =>
  new Promise<boolean>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      permissionAddedEvent.removeListener(handlePermissionAdded)
      chrome.windows.onRemoved.removeListener(handleWindowRemoved)
      clearTimeout(timeoutId)
    }

    const finish = (granted: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(granted)
    }

    const verify = async (finishWhenMissing: boolean) => {
      try {
        const granted = await chrome.permissions.contains({ origins: [...origins] })
        if (granted || finishWhenMissing) finish(granted)
      } catch (error) {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
    }

    const handlePermissionAdded = () => {
      void verify(false)
    }

    const handleWindowRemoved = (removedWindowId: number) => {
      if (removedWindowId === windowId) void verify(true)
    }

    const handleTimeout = async () => {
      try {
        await chrome.windows.remove(windowId)
        await verify(true)
      } catch (error) {
        console.error("[Ophel] Failed to close timed-out SitePack permission window:", error)
        finish(false)
      }
    }

    const timeoutId = setTimeout(() => void handleTimeout(), SITE_PACK_PERMISSION_WINDOW_TIMEOUT_MS)
    permissionAddedEvent.addListener(handlePermissionAdded)
    chrome.windows.onRemoved.addListener(handleWindowRemoved)
    void verify(false)
  })

const requestSitePackOrigins = async (
  context: SitePackOriginPermissionRequestContext,
  origins: readonly string[],
): Promise<boolean> => {
  const params = new URLSearchParams({
    type: "sitePack",
    name: context.name,
  })
  origins.forEach((origin) => params.append("origin", origin))
  const position = await getPermissionWindowPosition()
  const permissionWindow = await chrome.windows.create({
    url: chrome.runtime.getURL(`tabs/perm-request.html?${params.toString()}`),
    type: "popup",
    width: 450,
    height: 380,
    ...position,
    focused: true,
  })
  if (permissionWindow.id === undefined) {
    throw new Error("SitePack permission window was created without an id")
  }
  return waitForPermissionWindow(permissionWindow.id, origins)
}

export const createRuntimeSitePackRegistrationManager = (packManager: PackManager) =>
  createSitePackRegistrationManager({
    packManager,
    storage: extensionStorage,
    scripting: {
      getRegisteredContentScripts: () => chrome.scripting.getRegisteredContentScripts(),
      registerContentScripts: (scripts) => chrome.scripting.registerContentScripts(scripts),
      unregisterContentScripts: (filter) => chrome.scripting.unregisterContentScripts(filter),
    },
    permissions: {
      contains: (origins) => chrome.permissions.contains({ origins }),
      remove: (origins) => chrome.permissions.remove({ origins }),
    },
    getManifestContentScripts: () =>
      (chrome.runtime.getManifest().content_scripts ?? []) as ManifestContentScriptDescriptor[],
    requestOrigins: requestSitePackOrigins,
  })
