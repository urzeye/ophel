export const GEMINI_CANVAS_CODE_REQUEST_EVENT = "OPHEL_GEMINI_CANVAS_CODE_REQUEST"
export const GEMINI_CANVAS_CODE_RESPONSE_EVENT = "OPHEL_GEMINI_CANVAS_CODE_RESPONSE"

interface MonacoModelLike {
  uri?: {
    toString?: () => string
  }
  getValue?: () => string
}

export interface GeminiCanvasCodeBridgeWindow extends Window {
  __ophelGeminiCanvasMainInitialized?: boolean
  monaco?: {
    editor?: {
      getModels?: () => unknown[]
    }
  }
}

export function installGeminiCanvasCodeBridge(pageWindow: GeminiCanvasCodeBridgeWindow): void {
  if (pageWindow.__ophelGeminiCanvasMainInitialized) return

  pageWindow.__ophelGeminiCanvasMainInitialized = true
  pageWindow.document.documentElement.setAttribute("data-ophel-gemini-canvas-main", "1")

  const readMonacoModelCode = (editorUri: string): string => {
    const models = pageWindow.monaco?.editor?.getModels?.()
    if (!Array.isArray(models) || models.length === 0) return ""

    const matchingModel = models.find((model) => {
      const candidate = model as MonacoModelLike
      return editorUri && candidate.uri?.toString?.() === editorUri
    })

    const model = (matchingModel ||
      (models.length === 1 ? models[0] : null)) as MonacoModelLike | null
    if (typeof model?.getValue !== "function") return ""

    return model.getValue()
  }

  pageWindow.addEventListener("message", (event) => {
    if (event.origin && event.origin !== pageWindow.location.origin) return

    const data = event.data as {
      type?: unknown
      requestId?: unknown
      editorUri?: unknown
    }

    if (data?.type !== GEMINI_CANVAS_CODE_REQUEST_EVENT) return

    const requestId = typeof data.requestId === "string" ? data.requestId : ""
    if (!requestId) return

    const editorUri = typeof data.editorUri === "string" ? data.editorUri : ""
    const code = readMonacoModelCode(editorUri)

    pageWindow.postMessage(
      {
        type: GEMINI_CANVAS_CODE_RESPONSE_EVENT,
        requestId,
        code,
      },
      "*",
    )
  })
}
