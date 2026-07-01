import type { SiteAdapter } from "~adapters/base"
import type { ConversationManager } from "~core/conversation-manager"
import type { OutlineManager, OutlineNode } from "~core/outline-manager"
import { enqueuePrompt } from "~core/prompt-actions"
import type { PromptManager } from "~core/prompt-manager"
import {
  MSG_GET_SIDEBAR_CONTEXT,
  MSG_GET_SIDEBAR_CONVERSATIONS,
  MSG_GET_SIDEBAR_OUTLINE,
  MSG_SIDEBAR_CONVERSATION_COMMAND,
  MSG_SIDEBAR_OUTLINE_COMMAND,
  MSG_SIDEBAR_PROMPT_COMMAND,
  type ExtensionMessage,
  type SidebarBridgeResponse,
  type SidebarConversationCommand,
  type SidebarConversationSnapshot,
  type SidebarConversationSnapshotItem,
  type SidebarOutlineCommand,
  type SidebarOutlineNode,
  type SidebarOutlineSnapshot,
  type SidebarPageContext,
  type SidebarPromptCommand,
} from "~utils/messaging"
import { DEFAULT_SETTINGS, type Settings } from "~utils/storage"

interface SidebarBridgeManagers {
  adapter: SiteAdapter
  promptManager: PromptManager
  conversationManager: ConversationManager
  outlineManager: OutlineManager
  getSettings: () => Settings | undefined
}

type SidebarMessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: SidebarBridgeResponse<unknown>) => void,
) => boolean | void

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error || "Operation failed")

const hashText = (value: string): string => {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

const getNodeId = (node: OutlineNode, sourceId: string): string =>
  node.id ||
  node.navigationId ||
  `${sourceId}:${node.index}:${node.level}:${hashText(node.text || "")}`

const createSuccess = <T>(data: T): SidebarBridgeResponse<T> => ({ success: true, data })

const createFailure = (error: string): SidebarBridgeResponse<never> => ({
  success: false,
  error,
})

const findNodeById = (
  nodes: OutlineNode[],
  sourceId: string,
  nodeId: string,
): OutlineNode | null => {
  for (const node of nodes) {
    if (getNodeId(node, sourceId) === nodeId) {
      return node
    }

    const child = findNodeById(node.children || [], sourceId, nodeId)
    if (child) return child
  }

  return null
}

const serializeOutlineNodes = (
  nodes: OutlineNode[],
  sourceId: string,
  parentId?: string,
): SidebarOutlineNode[] =>
  nodes.map((node) => {
    const id = getNodeId(node, sourceId)
    return {
      id,
      text: node.text,
      level: node.level,
      relativeLevel: node.relativeLevel,
      index: node.index,
      parentId,
      children: serializeOutlineNodes(node.children || [], sourceId, id),
      collapsed: node.collapsed,
      isBookmarked: node.isBookmarked,
      isGhost: node.isGhost,
      isMatch: node.isMatch,
      hasMatchedDescendant: node.hasMatchedDescendant,
      isUserQuery: node.isUserQuery,
      wordCount: node.wordCount,
    }
  })

const getCurrentSettings = (getSettings: () => Settings | undefined): Settings =>
  getSettings() ?? DEFAULT_SETTINGS

const createContextSnapshot = ({
  adapter,
  getSettings,
}: SidebarBridgeManagers): SidebarPageContext => {
  const settings = getCurrentSettings(getSettings)

  return {
    supported: true,
    siteId: adapter.getSiteId(),
    siteName: adapter.getName(),
    url: window.location.href,
    title: document.title,
    sessionId: adapter.getSessionId?.() ?? null,
    placement: settings.panel?.panelPlacement ?? DEFAULT_SETTINGS.panel.panelPlacement,
    panelMode: settings.panel?.panelMode ?? DEFAULT_SETTINGS.panel.panelMode,
  }
}

const createOutlineSnapshot = ({
  adapter,
  outlineManager,
}: SidebarBridgeManagers): SidebarOutlineSnapshot => {
  outlineManager.refresh(undefined, true)
  const state = outlineManager.getState()
  const sourceId = state.activeSourceId

  return {
    siteId: adapter.getSiteId(),
    sessionId: adapter.getSessionId?.() ?? null,
    activeSourceId: sourceId,
    sources: state.sources.map((source) => ({
      id: source.id,
      label: source.label,
      available: source.available,
      count: source.count,
    })),
    nodes: serializeOutlineNodes(state.tree, sourceId),
    searchQuery: outlineManager.getSearchQuery(),
    level: state.expandLevel,
    isLoading: false,
    updatedAt: Date.now(),
  }
}

const createConversationSnapshot = ({
  adapter,
  conversationManager,
}: SidebarBridgeManagers): SidebarConversationSnapshot => {
  const currentConversationId = adapter.getSessionId?.() ?? null
  const conversations = conversationManager
    .getConversations()
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      return (right.updatedAt || 0) - (left.updatedAt || 0)
    })
    .map(
      (conversation): SidebarConversationSnapshotItem => ({
        id: conversation.id,
        title: conversation.title,
        url: conversation.url,
        folderId: conversation.folderId,
        pinned: conversation.pinned,
        updatedAt: conversation.updatedAt,
        isActive: conversation.id === currentConversationId,
        tagIds: conversation.tagIds,
      }),
    )

  return {
    siteId: adapter.getSiteId(),
    currentConversationId,
    folders: conversationManager.getFolders().map((folder) => ({
      id: folder.id,
      name: folder.name,
      icon: folder.icon,
      color: folder.color,
    })),
    conversations,
    updatedAt: Date.now(),
  }
}

const runOutlineCommand = async (
  managers: SidebarBridgeManagers,
  command: SidebarOutlineCommand,
): Promise<SidebarBridgeResponse<SidebarOutlineSnapshot>> => {
  const { outlineManager } = managers
  const sourceId = outlineManager.getActiveSourceId()

  if (command.action === "refresh") {
    return createSuccess(createOutlineSnapshot(managers))
  }

  if (command.action === "setLevel") {
    outlineManager.setLevel(command.level)
    return createSuccess(createOutlineSnapshot(managers))
  }

  if (command.action === "setSearchQuery") {
    outlineManager.setSearchQuery(command.query)
    return createSuccess(createOutlineSnapshot(managers))
  }

  if (command.action === "setActiveSource") {
    outlineManager.setActiveSource(command.sourceId)
    return createSuccess(createOutlineSnapshot(managers))
  }

  const node = findNodeById(outlineManager.getTree(), sourceId, command.nodeId)
  if (!node) {
    return createFailure("OUTLINE_NODE_NOT_FOUND")
  }

  if (command.action === "toggleBookmark") {
    outlineManager.toggleBookmark(node)
    return createSuccess(createOutlineSnapshot(managers))
  }

  if (command.action === "locate") {
    outlineManager.revealNode(node.index)
    const target = await outlineManager.resolveOutlineTarget(node, node.queryIndex)
    if (!(target instanceof HTMLElement)) {
      return createFailure("OUTLINE_TARGET_NOT_FOUND")
    }
    outlineManager.scrollToOutlineTarget(target)
    return createSuccess(createOutlineSnapshot(managers))
  }

  return createFailure("UNSUPPORTED_OUTLINE_COMMAND")
}

const runPromptCommand = async (
  { promptManager, adapter, getSettings }: SidebarBridgeManagers,
  command: SidebarPromptCommand,
): Promise<SidebarBridgeResponse<{ promptId: string }>> => {
  const prompt = promptManager.getPrompts().find((item) => item.id === command.promptId)
  if (!prompt) {
    return createFailure("PROMPT_NOT_FOUND")
  }

  if (command.action === "enqueue") {
    const result = enqueuePrompt({
      content: prompt.content,
      context: { source: "prompt-library", prompt },
    })
    if (result.status !== "queued") {
      return createFailure(result.status)
    }
    promptManager.updateLastUsed(prompt.id)
    return createSuccess({ promptId: prompt.id })
  }

  const inserted = await promptManager.insertPrompt(prompt.content)
  if (!inserted) {
    return createFailure("INSERT_FAILED")
  }

  promptManager.updateLastUsed(prompt.id)

  if (command.submitAfterInsert) {
    const submitShortcut =
      getCurrentSettings(getSettings).features?.prompts?.submitShortcut ?? "enter"
    const submitted = await promptManager.submitPrompt(submitShortcut)
    if (!submitted) {
      return createFailure("SUBMIT_FAILED")
    }
  } else if (adapter.getSiteId() === "aistudio") {
    promptManager.syncAiStudioSubmitShortcut(
      getCurrentSettings(getSettings).features?.prompts?.submitShortcut ?? "enter",
    )
  }

  return createSuccess({ promptId: prompt.id })
}

const runConversationCommand = async (
  managers: SidebarBridgeManagers,
  command: SidebarConversationCommand,
): Promise<SidebarBridgeResponse<SidebarConversationSnapshot>> => {
  const { adapter, conversationManager } = managers

  if (command.action === "sync") {
    conversationManager.syncConversations()
    conversationManager.notifyDataChange()
    return createSuccess(createConversationSnapshot(managers))
  }

  const conversation = conversationManager.getConversation(command.conversationId)
  if (!conversation) {
    return createFailure("CONVERSATION_NOT_FOUND")
  }

  if (command.action === "navigate") {
    const navigated = adapter.navigateToConversation(
      conversation.id,
      command.url || conversation.url,
    )
    if (!navigated) {
      return createFailure("NAVIGATE_FAILED")
    }
    return createSuccess(createConversationSnapshot(managers))
  }

  if (command.action === "export") {
    const exported = await conversationManager.exportConversation(conversation.id, command.format)
    if (!exported) {
      return createFailure("EXPORT_FAILED")
    }
    return createSuccess(createConversationSnapshot(managers))
  }

  if (command.action === "rename") {
    conversationManager.renameConversation(conversation.id, command.title)
    return createSuccess(createConversationSnapshot(managers))
  }

  if (command.action === "move") {
    conversationManager.moveConversation(conversation.id, command.folderId)
    return createSuccess(createConversationSnapshot(managers))
  }

  return createFailure("UNSUPPORTED_CONVERSATION_COMMAND")
}

export const registerSidebarBridge = (managers: SidebarBridgeManagers): (() => void) => {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return () => {}
  }

  const handler: SidebarMessageHandler = (message, _sender, sendResponse) => {
    const respond = <T>(
      operation: () => Promise<SidebarBridgeResponse<T>> | SidebarBridgeResponse<T>,
    ) => {
      Promise.resolve()
        .then(operation)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse(createFailure(toErrorMessage(error))))
    }

    switch (message.type) {
      case MSG_GET_SIDEBAR_CONTEXT:
        respond(() => createSuccess(createContextSnapshot(managers)))
        return true

      case MSG_GET_SIDEBAR_OUTLINE:
        respond(() => createSuccess(createOutlineSnapshot(managers)))
        return true

      case MSG_GET_SIDEBAR_CONVERSATIONS:
        respond(() => createSuccess(createConversationSnapshot(managers)))
        return true

      case MSG_SIDEBAR_OUTLINE_COMMAND:
        respond(() => runOutlineCommand(managers, message.command))
        return true

      case MSG_SIDEBAR_PROMPT_COMMAND:
        respond(() => runPromptCommand(managers, message.command))
        return true

      case MSG_SIDEBAR_CONVERSATION_COMMAND:
        respond(() => runConversationCommand(managers, message.command))
        return true

      default:
        return false
    }
  }

  chrome.runtime.onMessage.addListener(handler)
  return () => chrome.runtime.onMessage.removeListener(handler)
}
