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

  // 页脚四控件在长文案语言里可能一行放不下：临时切到 nowrap 实测内容宽度，
  // 溢出时隐藏 Star/赞助按钮的文案只留图标；仍放不下则由 flex-wrap 换行兜底。
  // 测量必须按完整内容宽度（is-measuring 临时禁用紧凑样式），
  // 否则紧凑后按图标宽度判定"不溢出"会来回振荡（页脚抖动）
  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return

    const checkOverflow = () => {
      const prevWrap = footer.style.flexWrap
      footer.style.flexWrap = "nowrap"
      footer.classList.add("is-measuring")
      const overflowing = footer.scrollWidth > footer.clientWidth + 1
      footer.classList.remove("is-measuring")
      footer.style.flexWrap = prevWrap
      setIsFooterCompact((prev) => (prev === overflowing ? prev : overflowing))
    }

    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(footer)
    return () => observer.disconnect()
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
            <a
              className="gh-release-notes-secondary gh-release-notes-star-link"
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer">
              <GithubIcon size={16} />
              <span>{t("giveStar")}</span>
            </a>
            {/* 赞助入口按产品语言分流：zh-CN 走爱发电，其余走 Ko-fi */}
            <a
              className="gh-release-notes-secondary gh-release-notes-star-link"
              href={donateChannels.primaryUrl}
              target="_blank"
              rel="noopener noreferrer">
              {donateChannels.kind === "zh-CN" ? <HeartIcon size={16} /> : <KofiIcon size={16} />}
              <span>{donateChannels.kind === "zh-CN" ? t("afdianSupport") : t("kofiSupport")}</span>
            </a>
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
