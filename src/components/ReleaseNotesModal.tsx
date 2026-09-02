import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import {
  CheckIcon,
  ClearIcon,
  ExternalLinkIcon,
  GithubIcon,
  HeartIcon,
  KofiIcon,
} from "~components/icons"
import { SparkleIcon } from "~components/icons/SparkleIcon"
import { getReleaseNotesMediaAlt, getReleaseNotesMediaCaption } from "~release-notes"
import type { ReleaseNotesMedia } from "~release-notes/types"
import { Tooltip } from "~components/ui/Tooltip"
import { OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS } from "~utils/dom-toolkit"
import { GITHUB_REPO_URL, getDonateChannels } from "~utils/donate-channels"
import { t } from "~utils/i18n"
import { getHighlightStyles, renderMarkdown } from "~utils/markdown"
import { createSafeHTML } from "~utils/trusted-types"

interface ReleaseNotesModalProps {
  version: string
  date?: string
  markdown: string
  language: string
  media?: readonly ReleaseNotesMedia[]
  fullChangelogUrl: string
  onClose: () => void
  onOpenFullChangelog: () => void
}

type ReleaseNotesContentBlock =
  | {
      key: string
      type: "markdown"
      html: string
    }
  | {
      key: string
      type: "media"
      item: ReleaseNotesMedia
    }

const RELEASE_NOTES_MEDIA_MARKER_PATTERN = /<!--\s*release-note-media:\s*([A-Za-z0-9_-]+)\s*-->/g

const isAbsoluteAssetUrl = (value: string): boolean =>
  /^(?:https?:|data:|blob:)/i.test(value.trim())

const resolveReleaseNotesAssetUrl = (source: string): string => {
  if (isAbsoluteAssetUrl(source)) return source

  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(source)
  }

  return source
}

const renderReleaseNotesMarkdown = (content: string): string =>
  createSafeHTML(renderMarkdown(content, false, { linkGithubReferences: true }))

const createMarkdownBlock = (key: string, content: string): ReleaseNotesContentBlock => ({
  key,
  type: "markdown",
  html: renderReleaseNotesMarkdown(content),
})

const createReleaseNotesContentBlocks = (
  markdown: string,
  media: readonly ReleaseNotesMedia[],
): { blocks: ReleaseNotesContentBlock[]; topMedia: readonly ReleaseNotesMedia[] } => {
  RELEASE_NOTES_MEDIA_MARKER_PATTERN.lastIndex = 0

  const mediaById = new Map(media.map((item) => [item.id, item]))
  const inlineMediaIds = new Set<string>()
  const blocks: ReleaseNotesContentBlock[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = RELEASE_NOTES_MEDIA_MARKER_PATTERN.exec(markdown)) !== null) {
    const markdownBeforeMarker = markdown.slice(lastIndex, match.index)
    if (markdownBeforeMarker.trim()) {
      blocks.push(createMarkdownBlock(`markdown-${blocks.length}`, markdownBeforeMarker))
    }

    const mediaItem = mediaById.get(match[1])
    if (mediaItem) {
      inlineMediaIds.add(mediaItem.id)
      blocks.push({
        key: `media-${mediaItem.id}-${blocks.length}`,
        type: "media",
        item: mediaItem,
      })
    }

    lastIndex = match.index + match[0].length
  }

  const markdownAfterLastMarker = markdown.slice(lastIndex)
  if (markdownAfterLastMarker.trim()) {
    blocks.push(createMarkdownBlock(`markdown-${blocks.length}`, markdownAfterLastMarker))
  }

  return {
    blocks,
    topMedia: media.filter((item) => !inlineMediaIds.has(item.id)),
  }
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({
  version,
  date,
  markdown,
  language,
  media = [],
  fullChangelogUrl,
  onClose,
  onOpenFullChangelog,
}) => {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [activeMedia, setActiveMedia] = useState<ReleaseNotesMedia | null>(null)
  const donateChannels = getDonateChannels(language)
  const footerRef = useRef<HTMLElement | null>(null)
  const [isFooterCompact, setIsFooterCompact] = useState(false)
  const releaseNotesContent = useMemo(
    () => createReleaseNotesContentBlocks(markdown, media),
    [markdown, media],
  )

  useEffect(() => {
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeMedia) {
          setActiveMedia(null)
          return
        }
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [activeMedia, onClose])

  // 页脚四控件在长文案语言里可能一行放不下：实测两组按钮的内容宽度之和，
  // 超过“可用宽度 - 20px 余量”就隐藏 Star/赞助按钮的文案只留图标（贴近放满也降级，
  // 避免视觉拥挤）；仍放不下则由 flex-wrap 换行兜底。
  // 判定是页脚宽度的纯函数，同一宽度下结果确定；
  // 紧凑切换只改变页脚高度、不改变宽度，因此只在宽度真正变化（视口 resize）时复测，
  // 从结构上排除“测量→切换紧凑→高度变化→触发再测量”的自反馈抖动。
  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const checkOverflow = () => {
      footer.classList.add("is-measuring")
      const style = getComputedStyle(footer)
      // 竖排（移动端 column-reverse）是正常布局，不做紧凑降级
      const isRow = style.flexDirection === "row"
      // nowrap + flex-shrink:0 下每组的 offsetWidth 即其完整内容宽度
      const groups = Array.from(footer.children) as HTMLElement[]
      const gapWidth = Math.max(groups.length - 1, 0) * (parseFloat(style.columnGap) || 0)
      const contentWidth = groups.reduce((sum, el) => sum + el.offsetWidth, 0) + gapWidth
      const availableWidth =
        footer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      footer.classList.remove("is-measuring")
      const overflowing = isRow && contentWidth > availableWidth - 20
      setIsFooterCompact((prev) => (prev === overflowing ? prev : overflowing))
    }

    checkOverflow()
    // 网页字体加载完成后按钮文案可能变宽，补一次复测
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) checkOverflow()
    })

    let lastWidth = footer.clientWidth
    const observer = new ResizeObserver(() => {
      if (footer.clientWidth === lastWidth) return
      lastWidth = footer.clientWidth
      checkOverflow()
    })
    observer.observe(footer)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [language])

  const activeMediaUrl = activeMedia ? resolveReleaseNotesAssetUrl(activeMedia.src) : ""

  const renderMediaItem = (item: ReleaseNotesMedia) => {
    const mediaUrl = resolveReleaseNotesAssetUrl(item.src)
    const posterUrl = item.poster ? resolveReleaseNotesAssetUrl(item.poster) : undefined
    const alt = getReleaseNotesMediaAlt(item.alt, language)
    const caption = getReleaseNotesMediaCaption(item.caption, language)

    if (item.type === "video") {
      return (
        <figure key={item.id} className="gh-release-notes-media gh-release-notes-media-video">
          <video
            src={mediaUrl}
            poster={posterUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={alt}
          />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      )
    }

    return (
      <button
        key={item.id}
        type="button"
        className="gh-release-notes-media gh-release-notes-media-button"
        onClick={() => setActiveMedia(item)}>
        <img src={mediaUrl} alt={alt} />
        {caption ? <span>{caption}</span> : null}
      </button>
    )
  }

  return (
    <div
      className="gh-release-notes-overlay gh-interactive"
      role="presentation"
      {...OPHEL_HOVER_WIDTH_RETAIN_LAYER_PROPS}
      onClick={onClose}>
      <section
        className="gh-release-notes-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}>
        <header className="gh-release-notes-header">
          <div className="gh-release-notes-kicker">
            <SparkleIcon size={16} color="brand" />
            <span>{t("releaseNotesKicker")}</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="gh-release-notes-close"
            aria-label={t("close")}
            onClick={onClose}>
            <ClearIcon size={16} />
          </button>
          <h2 id={titleId} className="gh-release-notes-title">
            {t("releaseNotesTitle", { version })}
          </h2>
          {date ? (
            <div className="gh-release-notes-meta">{t("releaseNotesPublishedOn", { date })}</div>
          ) : null}
        </header>

        <div className="gh-release-notes-body">
          {releaseNotesContent.topMedia.length > 0 ? (
            <div className="gh-release-notes-media-grid">
              {releaseNotesContent.topMedia.map(renderMediaItem)}
            </div>
          ) : null}

          {releaseNotesContent.blocks.map((block) =>
            block.type === "media" ? (
              <div key={block.key} className="gh-release-notes-media-grid">
                {renderMediaItem(block.item)}
              </div>
            ) : (
              <div
                key={block.key}
                className="gh-release-notes-markdown"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            ),
          )}
          <style>{getHighlightStyles()}</style>
        </div>

        <footer
          ref={footerRef}
          className={`gh-release-notes-footer${isFooterCompact ? " is-compact" : ""}`}>
          <div className="gh-release-notes-footer-support">
            {/* 紧凑模式只剩图标时，用 tooltip 兜底文案 */}
            <Tooltip content={t("giveStar")} disabled={!isFooterCompact}>
              <a
                className="gh-release-notes-secondary gh-release-notes-star-link"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer">
                <GithubIcon size={16} />
                <span>{t("giveStar")}</span>
              </a>
            </Tooltip>
            {/* 赞助入口按产品语言分流：zh-CN 走爱发电，其余走 Ko-fi */}
            <Tooltip content={t("kofiSupport")} disabled={!isFooterCompact}>
              <a
                className="gh-release-notes-secondary gh-release-notes-star-link"
                href={donateChannels.primaryUrl}
                target="_blank"
                rel="noopener noreferrer">
                {donateChannels.kind === "zh-CN" ? <HeartIcon size={16} /> : <KofiIcon size={16} />}
                <span>{t("kofiSupport")}</span>
              </a>
            </Tooltip>
          </div>
          <div className="gh-release-notes-footer-actions">
            <button
              type="button"
              className="gh-release-notes-secondary"
              title={fullChangelogUrl}
              onClick={onOpenFullChangelog}>
              <ExternalLinkIcon size={14} />
              <span>{t("releaseNotesViewFull")}</span>
            </button>
            <button type="button" className="gh-release-notes-primary" onClick={onClose}>
              <CheckIcon size={14} />
              <span>{t("releaseNotesGotIt")}</span>
            </button>
          </div>
        </footer>
      </section>

      {activeMedia ? (
        <div
          className="gh-release-notes-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={getReleaseNotesMediaAlt(activeMedia.alt, language)}
          onClick={(event) => {
            event.stopPropagation()
            setActiveMedia(null)
          }}>
          <img src={activeMediaUrl} alt={getReleaseNotesMediaAlt(activeMedia.alt, language)} />
        </div>
      ) : null}
    </div>
  )
}
