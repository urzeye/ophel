import type { OutlineItem } from "~adapters/base"

export interface HeadingOutlineOptions {
  maxLevel?: number
  showWordCount?: boolean
  idPrefix?: string
  maxTextLength?: number
  shouldSkipHeading?: (heading: Element) => boolean
  calculateWordCount?: (start: Element, end: Element | null, root: Element) => number
}

function getHeadingSelector(maxLevel = 6): string {
  const cappedLevel = Math.min(Math.max(maxLevel, 1), 6)
  return Array.from({ length: cappedLevel }, (_, index) => `h${index + 1}`).join(", ")
}

export function getHeadingOutlineElements(
  root: ParentNode,
  maxLevel = 6,
  shouldSkipHeading?: (heading: Element) => boolean,
): Element[] {
  return Array.from(root.querySelectorAll(getHeadingSelector(maxLevel))).filter(
    (heading) => !shouldSkipHeading?.(heading),
  )
}

export function extractHeadingOutline(
  root: Element,
  options: HeadingOutlineOptions = {},
): OutlineItem[] {
  const {
    maxLevel = 6,
    showWordCount = false,
    idPrefix,
    maxTextLength,
    shouldSkipHeading,
    calculateWordCount,
  } = options
  const headings = getHeadingOutlineElements(root, maxLevel, shouldSkipHeading)

  return headings.map((heading, index) => {
    const level = parseInt(heading.tagName.charAt(1), 10)
    const rawText = heading.textContent?.trim() || ""
    const text =
      maxTextLength && rawText.length > maxTextLength ? rawText.slice(0, maxTextLength) : rawText
    const item: OutlineItem = {
      level,
      text,
      element: heading,
      isTruncated: maxTextLength ? rawText.length > maxTextLength : undefined,
    }

    if (idPrefix) {
      item.id = `${idPrefix}:${level}:${rawText}:${index}`
    }

    if (showWordCount && calculateWordCount) {
      let nextBoundaryEl: Element | null = null
      for (let i = index + 1; i < headings.length; i += 1) {
        const candidate = headings[i]
        const candidateLevel = parseInt(candidate.tagName.charAt(1), 10)
        if (candidateLevel <= level) {
          nextBoundaryEl = candidate
          break
        }
      }
      item.wordCount = calculateWordCount(heading, nextBoundaryEl, root)
    }

    return item
  })
}

export function findHeadingByText(
  root: ParentNode,
  level: number,
  text: string,
  shouldSkipHeading?: (heading: Element) => boolean,
): Element | null {
  const headings = Array.from(root.querySelectorAll(`h${level}`)).filter(
    (heading) => !shouldSkipHeading?.(heading),
  )
  return headings.find((heading) => heading.textContent?.trim() === text) || null
}

export function findScrollableAncestor(element: Element | null): HTMLElement | null {
  let current = element?.parentElement || null
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const canScroll =
      current.scrollHeight > current.clientHeight &&
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")

    if (canScroll) return current
    current = current.parentElement
  }

  return null
}

export function scrollElementInContainer(
  element: HTMLElement,
  container: HTMLElement | null,
  offset = 12,
): boolean {
  if (!container || container === element) return false

  const containerRect = container.getBoundingClientRect()
  const targetRect = element.getBoundingClientRect()
  container.scrollTo({
    top: container.scrollTop + targetRect.top - containerRect.top - offset,
    behavior: "instant" as ScrollBehavior,
  })
  return true
}
