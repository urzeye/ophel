import type { ExtensionMessage, SidebarBridgeResponse } from "~utils/messaging"

export const sendSidebarMessage = async <T>(
  message: ExtensionMessage,
): Promise<SidebarBridgeResponse<T>> => {
  const response = (await chrome.runtime.sendMessage(message)) as
    | SidebarBridgeResponse<T>
    | undefined

  if (!response) {
    return { success: false, error: "EMPTY_RESPONSE" }
  }

  return response
}
