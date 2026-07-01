import React, { useMemo, useState } from "react"

import {
  type SidebarConversationCommand,
  type SidebarConversationSnapshot,
  type SidebarConversationSnapshotItem,
} from "~utils/messaging"
import { t } from "~utils/i18n"

interface SidebarConversationsTabProps {
  snapshot: SidebarConversationSnapshot | null
  loading: boolean
  onRefresh: () => void
  onCommand: (command: SidebarConversationCommand) => Promise<boolean>
}

const formatUpdatedAt = (timestamp: number): string => {
  if (!timestamp) return ""
  return new Date(timestamp).toLocaleDateString()
}

export const SidebarConversationsTab: React.FC<SidebarConversationsTabProps> = ({
  snapshot,
  loading,
  onRefresh,
  onCommand,
}) => {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")

  const conversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const items = snapshot?.conversations ?? []
    if (!normalizedQuery) return items
    return items.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalizedQuery),
    )
  }, [query, snapshot?.conversations])

  const runCommand = async (command: SidebarConversationCommand, successText?: string) => {
    const ok = await onCommand(command)
    setStatus(ok ? successText || t("refreshed") : t("operationFailed"))
  }

  const renameConversation = async (conversation: SidebarConversationSnapshotItem) => {
    const title = window.prompt(t("rename"), conversation.title)
    if (!title || title === conversation.title) return
    await runCommand({ action: "rename", conversationId: conversation.id, title }, t("rename"))
  }

  if (!snapshot) {
    return (
      <div className="gh-browser-sidebar-empty">
        <button className="gh-browser-sidebar-command" type="button" onClick={onRefresh}>
          {loading ? t("refreshing") : t("refreshConversations")}
        </button>
      </div>
    )
  }

  return (
    <section className="gh-browser-sidebar-panel">
      <div className="gh-browser-sidebar-toolbar">
        <button
          className="gh-browser-sidebar-command"
          type="button"
          onClick={() => runCommand({ action: "sync" }, t("conversationsSynced"))}>
          {loading ? t("refreshing") : t("conversationsSync")}
        </button>
      </div>
      <input
        className="gh-browser-sidebar-input"
        value={query}
        placeholder={t("conversationsSearchPlaceholder")}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {status ? <div className="gh-browser-sidebar-inline-status">{status}</div> : null}
      <div className="gh-browser-sidebar-list">
        {conversations.length === 0 ? (
          <div className="gh-browser-sidebar-empty">{t("conversationsEmpty")}</div>
        ) : (
          conversations.map((conversation) => (
            <article
              key={conversation.id}
              className={`gh-browser-sidebar-card ${conversation.isActive ? "is-active" : ""}`}>
              <button
                className="gh-browser-sidebar-card-main as-button"
                type="button"
                title={conversation.title}
                onClick={() =>
                  runCommand({
                    action: "navigate",
                    conversationId: conversation.id,
                    url: conversation.url,
                  })
                }>
                <h3 className="gh-browser-sidebar-card-title">{conversation.title}</h3>
                <div className="gh-browser-sidebar-card-meta">
                  {conversation.pinned ? "* " : ""}
                  {formatUpdatedAt(conversation.updatedAt)}
                </div>
              </button>
              <div className="gh-browser-sidebar-card-actions">
                <button
                  className="gh-browser-sidebar-icon-button"
                  type="button"
                  title={t("exportToMarkdown")}
                  aria-label={t("exportToMarkdown")}
                  onClick={() =>
                    runCommand({
                      action: "export",
                      conversationId: conversation.id,
                      format: "markdown",
                    })
                  }>
                  M
                </button>
                <button
                  className="gh-browser-sidebar-icon-button"
                  type="button"
                  title={t("exportToJSON")}
                  aria-label={t("exportToJSON")}
                  onClick={() =>
                    runCommand({
                      action: "export",
                      conversationId: conversation.id,
                      format: "json",
                    })
                  }>
                  J
                </button>
                <button
                  className="gh-browser-sidebar-icon-button"
                  type="button"
                  title={t("rename")}
                  aria-label={t("rename")}
                  onClick={() => renameConversation(conversation)}>
                  R
                </button>
              </div>
              <select
                className="gh-browser-sidebar-select"
                value={conversation.folderId}
                aria-label={t("conversationsMoveTo")}
                onChange={(event) =>
                  runCommand({
                    action: "move",
                    conversationId: conversation.id,
                    folderId: event.currentTarget.value,
                  })
                }>
                {snapshot.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.icon ? `${folder.icon} ` : ""}
                    {folder.name}
                  </option>
                ))}
              </select>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
