import React, { useEffect, useId, useMemo, useRef, useState } from "react"

import { CheckIcon, ClearIcon, NewTabIcon } from "~components/icons"
import { SparkleIcon } from "~components/icons/SparkleIcon"
import { getReleaseNotesMediaAlt, getReleaseNotesMediaCaption } from "~release-notes"
import type { ReleaseNotesMedia } from "~release-notes/types"
import { OPHEL_INTERACTION_LAYER_PROPS } from "~utils/dom-toolkit"
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

const isAbsoluteAssetUrl = (value: string): boolean =>
  /^(?:https?:|data:|blob:)/i.test(value.trim())

const resolveReleaseNotesAssetUrl = (source: string): string => {
  if (isAbsoluteAssetUrl(source)) return source

  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(source)
  }

  return source
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
  const releaseNotesHtml = useMemo(
    () => createSafeHTML(renderMarkdown(markdown, false, { linkGithubReferences: true })),
    [markdown],
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

  const activeMediaUrl = activeMedia ? resolveReleaseNotesAssetUrl(activeMedia.src) : ""

  return (
    <div
      className="gh-release-notes-overlay gh-interactive"
      role="presentation"
      {...OPHEL_INTERACTION_LAYER_PROPS}
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
          {media.length > 0 ? (
            <div className="gh-release-notes-media-grid">
              {media.map((item) => {
                const imageUrl = resolveReleaseNotesAssetUrl(item.src)
                const caption = getReleaseNotesMediaCaption(item.caption, language)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="gh-release-notes-media"
                    onClick={() => setActiveMedia(item)}>
                    <img src={imageUrl} alt={getReleaseNotesMediaAlt(item.alt, language)} />
                    {caption ? <span>{caption}</span> : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          <div
            className="gh-release-notes-markdown"
            dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
          />
          <style>{getHighlightStyles()}</style>
        </div>

        <footer className="gh-release-notes-footer">
          <button
            type="button"
            className="gh-release-notes-secondary"
            title={fullChangelogUrl}
            onClick={onOpenFullChangelog}>
            <NewTabIcon size={14} />
            <span>{t("releaseNotesViewFull")}</span>
          </button>
          <button type="button" className="gh-release-notes-primary" onClick={onClose}>
            <CheckIcon size={14} />
            <span>{t("releaseNotesGotIt")}</span>
          </button>
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
