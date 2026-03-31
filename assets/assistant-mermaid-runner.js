;(function () {
  "use strict"

  const REQUEST_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_REQUEST"
  const RESPONSE_EVENT = "OPHEL_ASSISTANT_MERMAID_RENDER_RESPONSE"
  const PREVIEW_ATTR = "data-ophel-assistant-mermaid-preview-id"
  const PREVIEW_TOKEN_ATTR = "data-ophel-assistant-mermaid-render-token"
  const ROOT_ATTR = "data-ophel-assistant-mermaid-runner"
  const READY_FLAG = "__ophelAssistantMermaidRunnerReady"

  if (window[READY_FLAG]) {
    return
  }

  window[READY_FLAG] = true
  document.documentElement?.setAttribute(ROOT_ATTR, "1")

  let initializedTheme = null

  function getMermaid() {
    const mermaid = window.mermaid
    if (!mermaid || typeof mermaid.render !== "function") {
      throw new Error("Mermaid runtime is unavailable")
    }
    return mermaid
  }

  function findPreviewElement(previewId) {
    if (!previewId) return null

    const visitedRoots = new Set()
    const rootStack = [document]

    while (rootStack.length > 0) {
      const root = rootStack.pop()
      if (!root || visitedRoots.has(root)) continue
      visitedRoots.add(root)

      const candidates = root.querySelectorAll ? root.querySelectorAll(`[${PREVIEW_ATTR}]`) : []
      for (const candidate of candidates) {
        if (candidate.getAttribute(PREVIEW_ATTR) === previewId) {
          return candidate
        }
      }

      const descendants = root.querySelectorAll ? root.querySelectorAll("*") : []
      for (const element of descendants) {
        if (element.shadowRoot) {
          rootStack.push(element.shadowRoot)
        }
      }
    }

    return null
  }

  function isLatestRequest(previewElement, requestId) {
    return previewElement?.getAttribute(PREVIEW_TOKEN_ATTR) === requestId
  }

  function postResponse(requestId, success, error) {
    window.postMessage(
      {
        type: RESPONSE_EVENT,
        requestId,
        success,
        error,
      },
      "*",
    )
  }

  async function renderMermaid(payload) {
    const { requestId, previewId, source, theme } = payload || {}

    try {
      const previewElement = findPreviewElement(previewId)
      if (!previewElement) {
        throw new Error("Preview container not found")
      }

      if (!isLatestRequest(previewElement, requestId)) {
        postResponse(requestId, true)
        return
      }

      const mermaid = getMermaid()
      if (initializedTheme !== theme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
        })
        initializedTheme = theme
      }

      if (typeof mermaid.parse === "function") {
        const parsed = await mermaid.parse(source, { suppressErrors: true })
        if (parsed === false) {
          throw new Error("Mermaid parse rejected")
        }
      }

      const renderId = `ophel-assistant-mermaid-${requestId}`
      const result = await mermaid.render(renderId, source)
      if (!isLatestRequest(previewElement, requestId)) {
        postResponse(requestId, true)
        return
      }

      previewElement.innerHTML = result.svg
      if (typeof result.bindFunctions === "function" && isLatestRequest(previewElement, requestId)) {
        result.bindFunctions(previewElement)
      }

      postResponse(requestId, true)
    } catch (error) {
      postResponse(requestId, false, error instanceof Error ? error.message : String(error))
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (event.data?.type !== REQUEST_EVENT) return

    void renderMermaid(event.data)
  })
})()
