const YUANBAO_HOSTNAME = "yuanbao.tencent.com"
const YUANBAO_CANVAS_SELECTOR = "#yuanbao-canvas-container, #yb-canvas-container"
const YUANBAO_MONACO_EDITOR_SELECTOR = `${YUANBAO_CANVAS_SELECTOR} .monaco-editor`

interface MonacoEditorWrapOptions {
  wordWrap: "on"
  scrollBeyondLastColumn: number
  wrappingIndent: "same"
  scrollbar: {
    horizontal: "hidden"
  }
}

interface MonacoEditorLike {
  getDomNode?: () => HTMLElement | null
  updateOptions?: (options: MonacoEditorWrapOptions) => void
  layout?: () => void
  onDidDispose?: (listener: () => void) => { dispose?: () => void }
}

type MonacoCreate = (...args: unknown[]) => MonacoEditorLike

interface PatchedMonacoCreate extends MonacoCreate {
  __ophelYuanbaoMonacoWrapPatched?: boolean
}

interface MonacoEditorNamespaceLike {
  create?: MonacoCreate
  getEditors?: () => MonacoEditorLike[]
}

export interface YuanbaoMonacoWrapWindow extends Window {
  __ophelYuanbaoMonacoWrapInitialized?: boolean
  HTMLElement: typeof HTMLElement
  MutationObserver: typeof MutationObserver
  ResizeObserver?: typeof ResizeObserver
  monaco?: {
    editor?: MonacoEditorNamespaceLike
  }
}

export function installYuanbaoMonacoWrap(pageWindow: YuanbaoMonacoWrapWindow): void {
  if (pageWindow.__ophelYuanbaoMonacoWrapInitialized) return
  if (pageWindow.location.hostname !== YUANBAO_HOSTNAME) return

  pageWindow.__ophelYuanbaoMonacoWrapInitialized = true
  pageWindow.document.documentElement.setAttribute("data-ophel-yuanbao-monaco-wrap", "1")

  const trackedEditors = new Set<MonacoEditorLike>()
  const appliedEditors = new WeakSet<MonacoEditorLike>()
  const observedElements = new WeakSet<Element>()
  let resizeObserver: ResizeObserver | null = null
  let scheduled = false
  let monacoPatched = false
  let monacoPollId: number | null = null

  const isHTMLElement = (value: unknown): value is HTMLElement => {
    return value instanceof pageWindow.HTMLElement
  }

  const isEditorInYuanbaoCanvas = (editor: MonacoEditorLike): boolean => {
    const domNode = editor.getDomNode?.()
    return isHTMLElement(domNode) && domNode.closest(YUANBAO_CANVAS_SELECTOR) !== null
  }

  const applyEditor = (editor: MonacoEditorLike): void => {
    if (!isEditorInYuanbaoCanvas(editor)) return

    if (!appliedEditors.has(editor)) {
      editor.updateOptions?.({
        wordWrap: "on",
        scrollBeyondLastColumn: 0,
        wrappingIndent: "same",
        scrollbar: {
          horizontal: "hidden",
        },
      })
      appliedEditors.add(editor)
    }

    editor.layout?.()
  }

  const trackEditor = (editor: MonacoEditorLike): void => {
    if (trackedEditors.has(editor)) return

    trackedEditors.add(editor)
    editor.onDidDispose?.(() => {
      trackedEditors.delete(editor)
    })
  }

  const collectExistingEditors = (): void => {
    const editors = pageWindow.monaco?.editor?.getEditors?.()
    if (!Array.isArray(editors)) return

    editors.forEach(trackEditor)
  }

  const syncResizeObserver = (): void => {
    if (!pageWindow.ResizeObserver) return

    resizeObserver ||= new pageWindow.ResizeObserver(scheduleRefresh)
    pageWindow.document
      .querySelectorAll(`${YUANBAO_CANVAS_SELECTOR}, ${YUANBAO_MONACO_EDITOR_SELECTOR}`)
      .forEach((element) => {
        if (observedElements.has(element)) return
        observedElements.add(element)
        resizeObserver?.observe(element)
      })
  }

  const refresh = (): void => {
    patchMonacoCreate()
    collectExistingEditors()
    trackedEditors.forEach(applyEditor)
    syncResizeObserver()
  }

  function scheduleRefresh(): void {
    if (scheduled) return

    scheduled = true
    pageWindow.setTimeout(() => {
      scheduled = false
      refresh()
    }, 80)
  }

  function patchMonacoCreate(): void {
    const editorNamespace = pageWindow.monaco?.editor
    const currentCreate = editorNamespace?.create as PatchedMonacoCreate | undefined
    if (!editorNamespace || !currentCreate || currentCreate.__ophelYuanbaoMonacoWrapPatched) {
      return
    }

    const patchedCreate = function (this: unknown, ...args: unknown[]): MonacoEditorLike {
      const editor = currentCreate.apply(this, args)
      trackEditor(editor)
      scheduleRefresh()
      return editor
    } as PatchedMonacoCreate

    patchedCreate.__ophelYuanbaoMonacoWrapPatched = true
    editorNamespace.create = patchedCreate
    monacoPatched = true

    if (monacoPollId !== null) {
      pageWindow.clearInterval(monacoPollId)
      monacoPollId = null
    }
  }

  const observer = new pageWindow.MutationObserver(scheduleRefresh)
  observer.observe(pageWindow.document.documentElement, {
    childList: true,
    subtree: true,
  })

  monacoPollId = pageWindow.setInterval(() => {
    patchMonacoCreate()
    if (monacoPatched) refresh()
  }, 500)

  refresh()
}
