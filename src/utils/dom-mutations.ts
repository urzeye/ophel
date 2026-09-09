function getElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement
}

/** Ignore our own insertions/removals as well as changes inside their detached subtrees. */
export function isIgnoredMutation(mutation: MutationRecord, selector: string): boolean {
  const isIgnored = (node: Node) => Boolean(getElement(node)?.closest(selector))
  if (isIgnored(mutation.target)) return true
  if (mutation.type !== "childList") return false

  const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes]
  return changedNodes.length > 0 && changedNodes.every(isIgnored)
}

/** Collect only affected matching containers, never rescan an unchanged document. */
export function collectChangedElements(
  mutations: MutationRecord[],
  selector: string,
  ignoreSelector?: string,
): Set<Element> {
  const elements = new Set<Element>()

  for (const mutation of mutations) {
    if (ignoreSelector && isIgnoredMutation(mutation, ignoreSelector)) continue

    const target = getElement(mutation.target)?.closest(selector)
    if (target) elements.add(target)

    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue
      if (ignoreSelector && node.closest(ignoreSelector)) continue
      if (node.matches(selector)) elements.add(node)
      for (const element of node.querySelectorAll(selector)) {
        if (!ignoreSelector || !element.closest(ignoreSelector)) elements.add(element)
      }
    }
  }

  return elements
}
