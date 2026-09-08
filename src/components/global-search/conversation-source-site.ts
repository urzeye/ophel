import type { Conversation } from "~core/conversation-manager"
import { resolvePersistedSiteInstanceKey } from "~utils/site-identity"

import type { GlobalSearchSourceSite } from "./types"

interface ConversationSourcePlatform {
  name: string
  icon?: string
  faviconUrl?: string
}

interface ResolveConversationSourceSiteParams {
  conversation: Conversation
  currentSiteInstanceKey: string
  platformBySiteId: ReadonlyMap<string, ConversationSourcePlatform>
}

const packSiteIdFallback = (siteId: string): string => siteId.replace(/^pack:/, "")

/** 解析对话搜索结果的来源站点：本站/站外共用，保证标题行都能占同一图标槽。 */
export const resolveConversationSourceSite = ({
  conversation,
  currentSiteInstanceKey,
  platformBySiteId,
}: ResolveConversationSourceSiteParams): GlobalSearchSourceSite => {
  const instanceKey = resolvePersistedSiteInstanceKey(conversation) ?? conversation.siteId
  const isOffsite = instanceKey !== currentSiteInstanceKey
  const platformInfo = platformBySiteId.get(conversation.siteId)

  if (platformInfo) {
    return {
      name: platformInfo.name,
      icon: platformInfo.icon,
      faviconUrl: platformInfo.faviconUrl,
      isOffsite,
    }
  }

  // 适配包已卸载等目录缺失场景：从实例 key 的 origin 回退出站点名与 favicon
  const origin = instanceKey.includes("@") ? instanceKey.slice(instanceKey.indexOf("@") + 1) : null
  if (origin) {
    try {
      return {
        name: new URL(origin).hostname,
        faviconUrl: `${origin}/favicon.ico`,
        isOffsite,
      }
    } catch {
      // origin 非法时落到 siteId 兜底
    }
  }

  return {
    name: packSiteIdFallback(conversation.siteId),
    isOffsite,
  }
}
