import React from "react"

import type { SiteAdapter } from "~adapters/base"
import { ConversationIcon, OutlineIcon, PromptIcon } from "~components/icons"
import { TAB_IDS } from "~constants"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager } from "~core/outline-manager"
import type { PromptManager } from "~core/prompt-manager"
import { t } from "~utils/i18n"
import type { Prompt } from "~utils/storage"

import { ConversationsTab } from "../ConversationsTab"
import { OutlineTab } from "../OutlineTab"
import { PromptsTab } from "../PromptsTab"

interface PanelWorkspaceProps {
  visibleTabs: string[]
  activeTab: string
  canDragTabs: boolean
  draggedTab: string | null
  dragOverTab: string | null
  promptManager: PromptManager
  conversationManager: ConversationManager
  outlineManager: OutlineManager
  adapter?: SiteAdapter | null
  selectedPromptId?: string | null
  onPromptSelect?: (prompt: Prompt | null) => void
  onInteractionStateChange?: (isActive: boolean) => void
  onJumpBefore: () => void
  isCodexOpen: boolean
  onTabClick: (tab: string) => void
  onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, tab: string) => void
  onTabDragStart: (event: React.DragEvent<HTMLButtonElement>, tab: string) => void
  onTabDragOver: (event: React.DragEvent<HTMLButtonElement>, tab: string) => void
  onTabDragLeave: (tab: string) => void
  onTabDrop: (event: React.DragEvent<HTMLButtonElement>, tab: string) => void
  onTabDragEnd: () => void
}

const getPanelTabIcon = (tab: string): React.FC<{ size?: number }> | null => {
  if (tab === TAB_IDS.OUTLINE) return OutlineIcon
  if (tab === TAB_IDS.PROMPTS) return PromptIcon
  if (tab === TAB_IDS.CONVERSATIONS) return ConversationIcon
  return null
}

const getPanelTabTipTarget = (tab: string): string | undefined => {
  if (tab === TAB_IDS.OUTLINE) return "outline-tab"
  if (tab === TAB_IDS.CONVERSATIONS) return "conversations-tab"
  if (tab === TAB_IDS.PROMPTS) return "prompts-tab"
  return undefined
}

export const PanelWorkspace: React.FC<PanelWorkspaceProps> = ({
  visibleTabs,
  activeTab,
  canDragTabs,
  draggedTab,
  dragOverTab,
  promptManager,
  conversationManager,
  outlineManager,
  adapter,
  selectedPromptId,
  onPromptSelect,
  onInteractionStateChange,
  onJumpBefore,
  isCodexOpen,
  onTabClick,
  onTabKeyDown,
  onTabDragStart,
  onTabDragOver,
  onTabDragLeave,
  onTabDrop,
  onTabDragEnd,
}) => (
  <>
    <div className="gh-panel-tabs" role="tablist" aria-label={t("panelTitle")}>
      {visibleTabs.map((tab) => {
        const Icon = getPanelTabIcon(tab)

        return (
          <button
            type="button"
            key={tab}
            id={`gh-panel-tab-${tab}`}
            role="tab"
            draggable={canDragTabs}
            aria-selected={activeTab === tab}
            aria-controls={`gh-panel-tabpanel-${tab}`}
            aria-grabbed={draggedTab === tab}
            className={`gh-panel-tab-btn ${activeTab === tab ? "active" : ""} ${canDragTabs ? "is-draggable" : ""} ${draggedTab === tab ? "is-dragging" : ""} ${dragOverTab === tab ? "is-drag-over" : ""}`}
            data-tip-target={getPanelTabTipTarget(tab)}
            onClick={() => onTabClick(tab)}
            onKeyDown={(event) => onTabKeyDown(event, tab)}
            onDragStart={(event) => onTabDragStart(event, tab)}
            onDragOver={(event) => onTabDragOver(event, tab)}
            onDragEnter={(event) => onTabDragOver(event, tab)}
            onDragLeave={() => onTabDragLeave(tab)}
            onDrop={(event) => onTabDrop(event, tab)}
            onDragEnd={onTabDragEnd}>
            <span className="gh-panel-tab-btn-icon">{Icon && <Icon size={16} />}</span>
            <span className="gh-panel-tab-btn-label">
              {t(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
            </span>
          </button>
        )
      })}
    </div>

    <div
      id={`gh-panel-tabpanel-${activeTab}`}
      className="gh-panel-content"
      role="tabpanel"
      aria-labelledby={`gh-panel-tab-${activeTab}`}>
      {activeTab === TAB_IDS.PROMPTS && (
        <PromptsTab
          manager={promptManager}
          adapter={adapter}
          selectedPromptId={selectedPromptId}
          onPromptSelect={onPromptSelect}
        />
      )}
      {activeTab === TAB_IDS.CONVERSATIONS && (
        <ConversationsTab
          manager={conversationManager}
          onInteractionStateChange={onInteractionStateChange}
        />
      )}
      {activeTab === TAB_IDS.OUTLINE && (
        <OutlineTab
          manager={outlineManager}
          conversationManager={conversationManager}
          onJumpBefore={onJumpBefore}
          isCodexOpen={isCodexOpen}
        />
      )}
    </div>
  </>
)
