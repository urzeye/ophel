import React, { useEffect, useState } from "react"

import {
  type SidebarOutlineCommand,
  type SidebarOutlineNode,
  type SidebarOutlineSnapshot,
} from "~utils/messaging"
import { t } from "~utils/i18n"

interface SidebarOutlineTabProps {
  snapshot: SidebarOutlineSnapshot | null
  loading: boolean
  onRefresh: () => void
  onCommand: (command: SidebarOutlineCommand) => void
}

interface OutlineNodeRowProps {
  node: SidebarOutlineNode
  depth: number
  onCommand: (command: SidebarOutlineCommand) => void
}

const OutlineNodeRow: React.FC<OutlineNodeRowProps> = ({ node, depth, onCommand }) => (
  <>
    <div
      className={`gh-browser-sidebar-row ${node.isMatch ? "is-match" : ""}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}>
      <button
        className="gh-browser-sidebar-icon-button"
        type="button"
        aria-label={node.isBookmarked ? t("removeBookmark") : t("addBookmark")}
        title={node.isBookmarked ? t("removeBookmark") : t("addBookmark")}
        onClick={() => onCommand({ action: "toggleBookmark", nodeId: node.id })}>
        {node.isBookmarked ? "*" : "+"}
      </button>
      <button
        className="gh-browser-sidebar-row-main"
        type="button"
        title={node.text}
        onClick={() => onCommand({ action: "locate", nodeId: node.id })}>
        <span className="gh-browser-sidebar-row-title">{node.text}</span>
        <span className="gh-browser-sidebar-row-meta">L{node.relativeLevel}</span>
      </button>
    </div>
    {!node.collapsed &&
      node.children.map((child) => (
        <OutlineNodeRow key={child.id} node={child} depth={depth + 1} onCommand={onCommand} />
      ))}
  </>
)

export const SidebarOutlineTab: React.FC<SidebarOutlineTabProps> = ({
  snapshot,
  loading,
  onRefresh,
  onCommand,
}) => {
  const [query, setQuery] = useState("")

  useEffect(() => {
    setQuery(snapshot?.searchQuery ?? "")
  }, [snapshot?.searchQuery])

  const handleSearchChange = (value: string) => {
    setQuery(value)
    onCommand({ action: "setSearchQuery", query: value })
  }

  if (!snapshot) {
    return (
      <div className="gh-browser-sidebar-empty">
        <button className="gh-browser-sidebar-command" type="button" onClick={onRefresh}>
          {loading ? t("refreshing") : t("refreshOutline")}
        </button>
      </div>
    )
  }

  return (
    <section className="gh-browser-sidebar-panel">
      <div className="gh-browser-sidebar-toolbar">
        <button className="gh-browser-sidebar-command" type="button" onClick={onRefresh}>
          {loading ? t("refreshing") : t("refresh")}
        </button>
        <select
          className="gh-browser-sidebar-select"
          value={snapshot.activeSourceId}
          aria-label={t("outlineSourceSwitchLabel")}
          onChange={(event) =>
            onCommand({ action: "setActiveSource", sourceId: event.currentTarget.value })
          }>
          {snapshot.sources.map((source) => (
            <option key={source.id} value={source.id} disabled={!source.available}>
              {source.label}
            </option>
          ))}
        </select>
        <select
          className="gh-browser-sidebar-select gh-browser-sidebar-level"
          value={snapshot.level}
          aria-label={t("outlineMaxLevel")}
          onChange={(event) =>
            onCommand({ action: "setLevel", level: Number(event.currentTarget.value) })
          }>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>
      <input
        className="gh-browser-sidebar-input"
        value={query}
        placeholder={t("outlineSearch")}
        onChange={(event) => handleSearchChange(event.currentTarget.value)}
      />
      <div className="gh-browser-sidebar-list">
        {snapshot.nodes.length === 0 ? (
          <div className="gh-browser-sidebar-empty">{t("outlineEmpty")}</div>
        ) : (
          snapshot.nodes.map((node) => (
            <OutlineNodeRow key={node.id} node={node} depth={0} onCommand={onCommand} />
          ))
        )}
      </div>
    </section>
  )
}
