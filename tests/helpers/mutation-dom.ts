/** Small structural DOM double; browser performance checks cover real layout and selectors. */
export class MutationElement {
  parentElement: MutationElement | null = null
  children: MutationElement[] = []
  isConnected = true

  constructor(readonly selector: string) {}

  append(child: MutationElement) {
    child.parentElement = this
    this.children.push(child)
  }

  matches(selectors: string) {
    return selectors.split(",").some((selector) => selector.trim() === this.selector)
  }

  closest(selectors: string): MutationElement | null {
    return this.matches(selectors) ? this : this.parentElement?.closest(selectors) ?? null
  }

  querySelectorAll(selectors: string): MutationElement[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selectors) ? [child] : []),
      ...child.querySelectorAll(selectors),
    ])
  }
}

export function mutationRecord(
  target: object,
  options: { type?: MutationRecord["type"]; added?: object[]; removed?: object[] } = {},
): MutationRecord {
  return {
    target,
    type: options.type ?? "childList",
    addedNodes: options.added ?? [],
    removedNodes: options.removed ?? [],
  } as unknown as MutationRecord
}
