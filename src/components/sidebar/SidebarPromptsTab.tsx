import React, { useMemo, useState } from "react"

import { usePromptsStore } from "~stores/prompts-store"
import type { SidebarPromptCommand } from "~utils/messaging"
import { t } from "~utils/i18n"

interface SidebarPromptsTabProps {
  onCommand: (command: SidebarPromptCommand) => Promise<boolean>
}

export const SidebarPromptsTab: React.FC<SidebarPromptsTabProps> = ({ onCommand }) => {
  const prompts = usePromptsStore((state) => state.prompts)
  const hydrated = usePromptsStore((state) => state._hasHydrated)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")

  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const sorted = [...prompts].sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1
      return (right.lastUsedAt || 0) - (left.lastUsedAt || 0)
    })

    if (!normalizedQuery) return sorted

    return sorted.filter((prompt) =>
      [prompt.title, prompt.content, prompt.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    )
  }, [prompts, query])

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setStatus(t("copySuccess"))
    } catch {
      setStatus(t("copyFailed"))
    }
  }

  const runCommand = async (command: SidebarPromptCommand, successText: string) => {
    const ok = await onCommand(command)
    setStatus(ok ? successText : t("operationFailed"))
  }

  if (!hydrated) {
    return <div className="gh-browser-sidebar-empty">{t("loading")}</div>
  }

  return (
    <section className="gh-browser-sidebar-panel">
      <input
        className="gh-browser-sidebar-input"
        value={query}
        placeholder={t("searchPlaceholder")}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {status ? <div className="gh-browser-sidebar-inline-status">{status}</div> : null}
      <div className="gh-browser-sidebar-list">
        {filteredPrompts.length === 0 ? (
          <div className="gh-browser-sidebar-empty">{t("queueBatchLibraryEmpty")}</div>
        ) : (
          filteredPrompts.map((prompt) => (
            <article key={prompt.id} className="gh-browser-sidebar-card">
              <div className="gh-browser-sidebar-card-main">
                <h3 className="gh-browser-sidebar-card-title">{prompt.title}</h3>
                {prompt.category ? (
                  <div className="gh-browser-sidebar-card-meta">{prompt.category}</div>
                ) : null}
                <p className="gh-browser-sidebar-card-preview">{prompt.content}</p>
              </div>
              <div className="gh-browser-sidebar-card-actions">
                <button
                  className="gh-browser-sidebar-icon-button"
                  type="button"
                  title={t("inserted")}
                  aria-label={t("inserted")}
                  onClick={() =>
                    runCommand({ action: "insert", promptId: prompt.id }, t("inserted"))
                  }>
                  {"↵"}
                </button>
                <button
                  className="gh-browser-sidebar-icon-button"
                  type="button"
                  title={t("queueSettingLabel")}
                  aria-label={t("queueSettingLabel")}
                  onClick={() =>
                    runCommand({ action: "enqueue", promptId: prompt.id }, t("queueSettingLabel"))
                  }>
                  +
                </button>
                <button
                  className="gh-browser-sidebar-icon-button"
                  type="button"
                  title={t("copy")}
                  aria-label={t("copy")}
                  onClick={() => handleCopy(prompt.content)}>
                  C
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
