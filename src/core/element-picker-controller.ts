export type ElementPickerCancelReason = "escape" | "programmatic" | "unmounted"

export type ElementPickerResult =
  | { status: "selected"; element: Element }
  | { status: "cancelled"; reason: ElementPickerCancelReason }

export type ElementPickerHoverKind = "element" | "unsupported-iframe"

export interface ElementPickerRect {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
  readonly width: number
  readonly height: number
}

export interface ElementPickerIdleSnapshot {
  readonly phase: "idle"
  readonly hoveredElement: null
  readonly hoverKind: null
  readonly rect: null
}

export interface ElementPickerActiveSnapshot {
  readonly phase: "picking"
  readonly hoveredElement: Element | null
  readonly hoverKind: ElementPickerHoverKind | null
  readonly rect: ElementPickerRect | null
}

export type ElementPickerSnapshot = ElementPickerIdleSnapshot | ElementPickerActiveSnapshot

type ElementPickerListener = () => void
type ElementPickerResolver = (result: ElementPickerResult) => void
type ElementPickerRectSource = Pick<
  DOMRectReadOnly,
  "top" | "right" | "bottom" | "left" | "width" | "height"
>

export class ElementPickerBusyError extends Error {
  constructor() {
    super("Element picker is already active")
    this.name = "ElementPickerBusyError"
  }
}

const IDLE_ELEMENT_PICKER_SNAPSHOT: ElementPickerIdleSnapshot = Object.freeze({
  phase: "idle",
  hoveredElement: null,
  hoverKind: null,
  rect: null,
})

const createActiveSnapshot = (
  hoveredElement: Element | null = null,
  hoverKind: ElementPickerHoverKind | null = null,
  rect: ElementPickerRect | null = null,
): ElementPickerActiveSnapshot =>
  Object.freeze({
    phase: "picking",
    hoveredElement,
    hoverKind,
    rect,
  })

const copyRect = (rect: ElementPickerRectSource): ElementPickerRect =>
  Object.freeze({
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  })

export class ElementPickerController {
  private snapshot: ElementPickerSnapshot = IDLE_ELEMENT_PICKER_SNAPSHOT
  private readonly listeners = new Set<ElementPickerListener>()
  private pendingResolver: ElementPickerResolver | null = null

  readonly subscribe = (listener: ElementPickerListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): ElementPickerSnapshot => this.snapshot

  start(): Promise<ElementPickerResult> {
    if (this.pendingResolver) {
      return Promise.reject(new ElementPickerBusyError())
    }

    let resolver!: ElementPickerResolver
    const result = new Promise<ElementPickerResult>((resolve) => {
      resolver = resolve
    })

    this.pendingResolver = resolver
    this.updateSnapshot(createActiveSnapshot())
    return result
  }

  setHoveredElement(
    element: Element,
    rect: ElementPickerRectSource,
    hoverKind: ElementPickerHoverKind = "element",
  ): void {
    this.requireActiveSnapshot()
    this.updateSnapshot(createActiveSnapshot(element, hoverKind, copyRect(rect)))
  }

  clearHoveredElement(): void {
    const snapshot = this.requireActiveSnapshot()
    if (!snapshot.hoveredElement && !snapshot.rect) return
    this.updateSnapshot(createActiveSnapshot())
  }

  select(element: Element): void {
    const snapshot = this.requireActiveSnapshot()
    if (snapshot.hoverKind === "unsupported-iframe") {
      throw new Error("Iframe elements cannot be selected")
    }
    if (element !== snapshot.hoveredElement) {
      throw new Error("Selected element must match the current picker target")
    }

    this.finish({ status: "selected", element })
  }

  cancel(reason: ElementPickerCancelReason = "programmatic"): void {
    this.requireActiveSnapshot()
    this.finish({ status: "cancelled", reason })
  }

  private requireActiveSnapshot(): ElementPickerActiveSnapshot {
    if (this.snapshot.phase !== "picking" || !this.pendingResolver) {
      throw new Error("Element picker is not active")
    }
    return this.snapshot
  }

  private finish(result: ElementPickerResult): void {
    const resolve = this.pendingResolver
    if (!resolve) {
      throw new Error("Element picker has no pending request")
    }

    this.pendingResolver = null
    this.updateSnapshot(IDLE_ELEMENT_PICKER_SNAPSHOT)
    resolve(result)
  }

  private updateSnapshot(snapshot: ElementPickerSnapshot): void {
    if (this.snapshot === snapshot) return
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}

export const elementPickerController = new ElementPickerController()

export const startElementPicker = (): Promise<ElementPickerResult> =>
  elementPickerController.start()
