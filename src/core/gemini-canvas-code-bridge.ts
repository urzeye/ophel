export const GEMINI_CANVAS_CODE_REQUEST_EVENT = "OPHEL_GEMINI_CANVAS_CODE_REQUEST"
export const GEMINI_CANVAS_CODE_RESPONSE_EVENT = "OPHEL_GEMINI_CANVAS_CODE_RESPONSE"

interface MonacoModelLike {
  uri?: {
    toString?: () => string
  }
  getValue?: () => string
  getLanguageId?: () => string
}

interface MonacoEditorLike {
  getModel?: () => MonacoModelLike | null
  getDomNode?: () => HTMLElement | null
  getContainerDomNode?: () => HTMLElement | null
}

export interface GeminiCanvasCodeBridgeWindow extends Window {
  __ophelGeminiCanvasMainInitialized?: boolean
  monaco?: {
    editor?: {
      getModels?: () => unknown[]
      getEditors?: () => unknown[]
    }
  }
}

export function installGeminiCanvasCodeBridge(pageWindow: GeminiCanvasCodeBridgeWindow): void {
  if (pageWindow.__ophelGeminiCanvasMainInitialized) return

  pageWindow.__ophelGeminiCanvasMainInitialized = true
  const markMainReady = () => {
    try {
      pageWindow.document?.documentElement?.setAttribute("data-ophel-gemini-canvas-main", "1")
    } catch {
      // 忽略 document 尚未准备好的异常
    }
  }
  markMainReady()
  if (!pageWindow.document?.documentElement && typeof pageWindow.addEventListener === "function") {
    pageWindow.addEventListener("DOMContentLoaded", markMainReady, { once: true })
  }

  const readMonacoModelData = (editorUri: string): { code: string; language: string } => {
    // 1. 全局 monaco 实例查找（含 AMD require 与全局 monaco）
    const monacoCandidates: Array<{
      getModels?: () => unknown[]
      getEditors?: () => unknown[]
    }> = []

    if (pageWindow.monaco?.editor) {
      monacoCandidates.push(pageWindow.monaco.editor)
    }
    try {
      const requireFunc = (pageWindow as unknown as { require?: (name: string) => unknown }).require
      if (typeof requireFunc === "function") {
        const amdEditor = (requireFunc("vs/editor/editor.main") as { editor?: unknown })?.editor
        if (amdEditor && typeof amdEditor === "object") {
          monacoCandidates.push(
            amdEditor as { getModels?: () => unknown[]; getEditors?: () => unknown[] },
          )
        }
      }
    } catch {
      // 忽略 AMD 解析错误
    }

    for (const monacoEditor of monacoCandidates) {
      // 优先尝试 getEditors()（活动 DOM 绑定的编辑器实例）
      const editors = Array.isArray(monacoEditor.getEditors?.())
        ? (monacoEditor.getEditors!() as MonacoEditorLike[])
        : []

      if (editors.length > 0) {
        if (editorUri) {
          const matchingEditor = editors.find((ed) => {
            const m = ed.getModel?.()
            const uriStr = m?.uri?.toString?.() || ""
            return uriStr === editorUri || uriStr.endsWith(editorUri)
          })
          if (matchingEditor) {
            const model = matchingEditor.getModel?.()
            const code = model?.getValue?.() || ""
            if (code) {
              return { code, language: model?.getLanguageId?.() || "" }
            }
          }
        } else {
          // 若未指定 editorUri，检查是否有任意非空模型的 editor
          for (const ed of editors) {
            const model = ed.getModel?.()
            const code = model?.getValue?.() || ""
            if (code) {
              return { code, language: model?.getLanguageId?.() || "" }
            }
          }
        }
      }

      // 回退到 getModels()
      const models = Array.isArray(monacoEditor.getModels?.())
        ? (monacoEditor.getModels!() as MonacoModelLike[])
        : []
      if (models.length > 0) {
        if (editorUri) {
          const matchingModel = models.find((m) => {
            const uriStr = m.uri?.toString?.() || ""
            return uriStr === editorUri || uriStr.endsWith(editorUri)
          })
          if (matchingModel && typeof matchingModel.getValue === "function") {
            const code = matchingModel.getValue() || ""
            if (code) {
              return { code, language: matchingModel.getLanguageId?.() || "" }
            }
          }
        } else {
          // 若未指定 editorUri，选取最长非空内容的 model
          let bestModel: MonacoModelLike | null = null
          let maxLen = 0
          for (const m of models) {
            if (typeof m?.getValue === "function") {
              const val = m.getValue() || ""
              if (val.length > maxLen) {
                maxLen = val.length
                bestModel = m
              }
            }
          }

          if (bestModel && typeof bestModel.getValue === "function") {
            return {
              code: bestModel.getValue() || "",
              language: bestModel.getLanguageId?.() || "",
            }
          }
        }
      }
    }

    // 2. DOM 树及 Angular 组件探查
    try {
      const doc = pageWindow.document
      if (doc) {
        const editorElements = Array.from(
          doc.querySelectorAll("xap-code-editor, .xap-monaco-container, .monaco-editor"),
        )
        for (const el of editorElements) {
          // Angular 组件探测
          const ng = (
            pageWindow as unknown as {
              ng?: { getComponent?: (element: Element) => Record<string, unknown> }
            }
          ).ng
          const comp = ng?.getComponent?.(el)
          if (comp) {
            const compCode =
              typeof comp.code === "string"
                ? comp.code
                : typeof comp.value === "string"
                  ? comp.value
                  : typeof comp.content === "string"
                    ? comp.content
                    : (comp.model as { getValue?: () => string })?.getValue?.() ||
                      (comp.editor as { getValue?: () => string })?.getValue?.() ||
                      ""
            if (compCode && compCode.trim()) {
              const lang = comp.language || comp.modeId || el.getAttribute("data-mode-id") || ""
              return { code: compCode, language: typeof lang === "string" ? lang : "" }
            }
          }

          // DOM 元素自定义挂载探测
          const directCandidate = el as unknown as Record<string, unknown>
          const modelOrEditor =
            directCandidate._editor ||
            directCandidate.__editor ||
            directCandidate.editor ||
            directCandidate.model ||
            directCandidate._model
          if (modelOrEditor && typeof modelOrEditor === "object") {
            const target = modelOrEditor as {
              getValue?: () => string
              getModel?: () => { getValue?: () => string }
            }
            const val =
              typeof target.getValue === "function"
                ? target.getValue()
                : typeof target.getModel === "function"
                  ? target.getModel()?.getValue?.()
                  : ""
            if (typeof val === "string" && val.trim()) {
              return { code: val, language: el.getAttribute("data-mode-id") || "" }
            }
          }

          // Angular Ivy __ngContext__ 数组探测
          const ngContext = directCandidate.__ngContext__
          if (Array.isArray(ngContext)) {
            for (const item of ngContext) {
              if (!item || typeof item !== "object") continue
              const itemRecord = item as {
                getValue?: () => string
                getModel?: () => { getValue?: () => string }
              }
              if (typeof itemRecord.getValue === "function") {
                const val = itemRecord.getValue()
                if (typeof val === "string" && val.trim()) {
                  return { code: val, language: el.getAttribute("data-mode-id") || "" }
                }
              }
              if (typeof itemRecord.getModel === "function") {
                const val = itemRecord.getModel()?.getValue?.()
                if (typeof val === "string" && val.trim()) {
                  return { code: val, language: el.getAttribute("data-mode-id") || "" }
                }
              }
            }
          }
        }
      }
    } catch {
      // 忽略 DOM/Angular 探查异常
    }

    return { code: "", language: "" }
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
    const { code, language } = readMonacoModelData(editorUri)

    pageWindow.postMessage(
      {
        type: GEMINI_CANVAS_CODE_RESPONSE_EVENT,
        requestId,
        code,
        language,
      },
      "*",
    )
  })
}
