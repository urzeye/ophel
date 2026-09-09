import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8")

const compact = (source: string): string => source.replace(/\s+/g, " ")

const outlineTabSource = readSource("../../src/components/OutlineTab.tsx")

describe("outline locate scroll & highlight jitter prevention", () => {
  it("decouples locate retry limit from 3s highlight duration to prevent infinite scroll fighting", () => {
    expect(outlineTabSource).toContain("const OUTLINE_LOCATE_HIGHLIGHT_MS = 3000")
    expect(outlineTabSource).toContain("const OUTLINE_LOCATE_MAX_RETRIES = 20")
    expect(outlineTabSource).not.toContain(
      "const OUTLINE_LOCATE_MAX_RETRIES = Math.ceil(\n  OUTLINE_LOCATE_HIGHLIGHT_MS / OUTLINE_LOCATE_RETRY_DELAY_MS,\n)",
    )
  })

  it("manages locate retry timer handle and provides cancellation", () => {
    const source = compact(outlineTabSource)

    expect(source).toContain(
      "const locateRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)",
    )
    expect(source).toContain("const cancelLocateRetry = useCallback(() => {")
    expect(source).toContain("if (locateRetryTimerRef.current) {")
    expect(source).toContain("clearTimeout(locateRetryTimerRef.current)")
    expect(source).toContain("locateRetryTimerRef.current = null")
  })

  it("aborts locate retry immediately when user manually scrolls or touches the outline container", () => {
    const source = compact(outlineTabSource)

    expect(source).toContain(
      "// 用户手动滚动大纲面板时，暂停自动定位与跟随，并立即取消正在进行的定位重试，避免强制拉回造成抖动",
    )
    expect(source).toContain('el.addEventListener("wheel", handleUserScroll')
    expect(source).toContain('el.addEventListener("pointerdown", handleUserScroll')
    expect(source).toContain('el.addEventListener("touchstart", handleUserScroll')
    expect(source).toContain('el.addEventListener("touchmove", handleUserScroll')

    expect(source).toContain("const handleUserScroll = () => {")
    expect(source).toContain("userScrollingOutlineRef.current = true")
    expect(source).toContain("cancelLocateRetry()")
  })

  it("checks userScrollingOutline and active locate highlight before scrolling to prevent pulling back", () => {
    const source = compact(outlineTabSource)

    // Entry check inside tryScrollAndHighlight
    expect(source).toContain(
      "if (userScrollingOutlineRef.current) { cancelLocateRetry() abortPendingLocate() return }",
    )
    expect(source).toContain(
      "if (activeLocateHighlightRef.current?.requestId === locateHighlightRequestId) { cancelLocateRetry() return }",
    )

    // Check inside requestAnimationFrame
    expect(source).toContain(
      "if (applyPendingLocateHighlight(currentItem!.index)) { cancelLocateRetry() return }",
    )
  })

  it("restores highlight class when item re-mounts during the 3s highlight period and cleans up on unmount", () => {
    const source = compact(outlineTabSource)

    // setItemRef re-mount preservation
    expect(source).toContain(
      'if (activeLocateHighlightRef.current?.index === index) { el.classList.add("highlight")',
    )

    // unmount cleanup
    expect(source).toContain(
      "useEffect( () => () => { cancelLocateRetry() clearLocateHighlight({ clearForceVisible: true }) }, [cancelLocateRetry, clearLocateHighlight], )",
    )
  })

  it("resets the 1.5s user-scroll suppression when locate is triggered explicitly", () => {
    const source = compact(outlineTabSource)
    const locateFn = source.split("const handleLocateCurrent = useCallback(() => {")[1] ?? ""
    // The reset must happen before any scroll/highlight attempt inside the locate handler
    const locateHead = locateFn.slice(0, 1200)

    expect(locateHead).toContain("userScrollingOutlineRef.current = false")
    expect(locateHead).toContain("clearTimeout(userScrollTimerRef.current)")
    expect(locateHead).toContain("userScrollTimerRef.current = null")
  })

  it("clears stale pending locate highlight and forceVisible when user scroll aborts the retry", () => {
    const source = compact(outlineTabSource)

    // abortPendingLocate guards against clearing an already-active highlight
    expect(source).toContain("const abortPendingLocate = useCallback(() => {")
    expect(source).toContain(
      "if (activeLocateHighlightRef.current?.requestId === pending.requestId) return",
    )
    expect(source).toContain("pendingLocateHighlightRef.current = null manager.clearForceVisible()")

    // wired into user scroll handling so pending cannot fire a delayed highlight later
    const userScrollSection = source.split("const handleUserScroll = () => {")[1] ?? ""
    expect(userScrollSection.slice(0, 400)).toContain("abortPendingLocate()")

    // and into both user-scroll abort branches of the retry loop
    const abortBranch =
      "if (userScrollingOutlineRef.current) { cancelLocateRetry() abortPendingLocate() return }"
    expect(source.split(abortBranch).length - 1).toBe(2)
  })
})
