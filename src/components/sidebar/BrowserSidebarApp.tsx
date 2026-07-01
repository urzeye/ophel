import React, { useCallback, useEffect, useState } from "react"

import { APP_DISPLAY_NAME, APP_ICON_URL } from "~utils/config"
import { setLanguage, t } from "~utils/i18n"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import {
  MSG_GET_SIDEBAR_CONTEXT,
  MSG_GET_SIDEBAR_CONVERSATIONS,
  MSG_GET_SIDEBAR_OUTLINE,
  MSG_SIDEBAR_CONVERSATION_COMMAND,
  MSG_SIDEBAR_OUTLINE_COMMAND,
  MSG_SIDEBAR_PROMPT_COMMAND,
  type SidebarConversationCommand,
  type SidebarConversationSnapshot,
  type SidebarOutlineCommand,
  type SidebarOutlineSnapshot,
  type SidebarPageContext,
  type SidebarPromptCommand,
} from "~utils/messaging"

import { SidebarConversationsTab } from "./SidebarConversationsTab"
import { SidebarHeader } from "./SidebarHeader"
import { SidebarOutlineTab } from "./SidebarOutlineTab"
import { SidebarPromptsTab } from "./SidebarPromptsTab"
import { SidebarStatus } from "./SidebarStatus"
import { SidebarTabs, type SidebarTabId } from "./SidebarTabs"
import { sendSidebarMessage } from "./sidebarMessages"

export const BrowserSidebarApp: React.FC = () => {
  const { settings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()
  const [activeTab, setActiveTab] = useState<SidebarTabId>("outline")
  const [languageReady, setLanguageReady] = useState(false)
  const [context, setContext] = useState<SidebarPageContext | null>(null)
  const [contextError, setContextError] = useState("")
  const [outlineSnapshot, setOutlineSnapshot] = useState<SidebarOutlineSnapshot | null>(null)
  const [conversationsSnapshot, setConversationsSnapshot] =
    useState<SidebarConversationSnapshot | null>(null)
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [conversationsLoading, setConversationsLoading] = useState(false)

  useEffect(() => {
    if (!isHydrated || !settings?.language) return
    setLanguage(settings.language)
    setLanguageReady(true)
  }, [isHydrated, settings?.language])

  const openOptionsPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("tabs/options.html") })
  }

  const refreshContext = useCallback(async () => {
    const response = await sendSidebarMessage<SidebarPageContext>({
      type: MSG_GET_SIDEBAR_CONTEXT,
    })

    if ("error" in response) {
      setContext(null)
      setContextError(response.error)
      return false
    }

    setContext(response.data)
    setContextError("")
    return true
  }, [])

  const refreshOutline = useCallback(async () => {
    setOutlineLoading(true)
    try {
      await refreshContext()
      const response = await sendSidebarMessage<SidebarOutlineSnapshot>({
        type: MSG_GET_SIDEBAR_OUTLINE,
      })
      if ("error" in response) {
        setContextError(response.error)
        return false
      }
      setOutlineSnapshot(response.data)
      return true
    } finally {
      setOutlineLoading(false)
    }
  }, [refreshContext])

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true)
    try {
      await refreshContext()
      const response = await sendSidebarMessage<SidebarConversationSnapshot>({
        type: MSG_GET_SIDEBAR_CONVERSATIONS,
      })
      if ("error" in response) {
        setContextError(response.error)
        return false
      }
      setConversationsSnapshot(response.data)
      return true
    } finally {
      setConversationsLoading(false)
    }
  }, [refreshContext])

  const runOutlineCommand = useCallback((command: SidebarOutlineCommand) => {
    void (async () => {
      setOutlineLoading(true)
      try {
        const response = await sendSidebarMessage<SidebarOutlineSnapshot>({
          type: MSG_SIDEBAR_OUTLINE_COMMAND,
          command,
        })
        if ("error" in response) {
          setContextError(response.error)
        } else {
          setOutlineSnapshot(response.data)
        }
      } finally {
        setOutlineLoading(false)
      }
    })()
  }, [])

  const runPromptCommand = useCallback(async (command: SidebarPromptCommand) => {
    const response = await sendSidebarMessage<{ promptId: string }>({
      type: MSG_SIDEBAR_PROMPT_COMMAND,
      command,
    })
    if ("error" in response) {
      setContextError(response.error)
    }
    return !("error" in response)
  }, [])

  const runConversationCommand = useCallback(async (command: SidebarConversationCommand) => {
    setConversationsLoading(true)
    try {
      const response = await sendSidebarMessage<SidebarConversationSnapshot>({
        type: MSG_SIDEBAR_CONVERSATION_COMMAND,
        command,
      })
      if ("error" in response) {
        setContextError(response.error)
        return false
      }
      setConversationsSnapshot(response.data)
      return true
    } finally {
      setConversationsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshContext()
  }, [refreshContext])

  useEffect(() => {
    if (!languageReady) return
    if (activeTab === "outline") {
      void refreshOutline()
    } else if (activeTab === "conversations") {
      void refreshConversations()
    }
  }, [activeTab, languageReady, refreshConversations, refreshOutline])

  if (!isHydrated || !settings || !languageReady) {
    return (
      <div className="gh-browser-sidebar">
        <SidebarHeader
          iconUrl={APP_ICON_URL}
          title={APP_DISPLAY_NAME}
          onOpenSettings={openOptionsPage}
        />
        <main className="gh-browser-sidebar-content">
          <div className="gh-browser-sidebar-placeholder">{t("loading")}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="gh-browser-sidebar">
      <SidebarHeader
        iconUrl={APP_ICON_URL}
        title={APP_DISPLAY_NAME}
        onOpenSettings={openOptionsPage}
      />
      <SidebarStatus context={context} error={contextError} />
      <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="gh-browser-sidebar-content">
        {activeTab === "outline" ? (
          <SidebarOutlineTab
            snapshot={outlineSnapshot}
            loading={outlineLoading}
            onRefresh={refreshOutline}
            onCommand={runOutlineCommand}
          />
        ) : activeTab === "conversations" ? (
          <SidebarConversationsTab
            snapshot={conversationsSnapshot}
            loading={conversationsLoading}
            onRefresh={refreshConversations}
            onCommand={runConversationCommand}
          />
        ) : (
          <SidebarPromptsTab onCommand={runPromptCommand} />
        )}
      </main>
    </div>
  )
}
