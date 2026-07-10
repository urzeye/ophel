import React from "react"

interface ExtensionUpdateNoticeProps {
  kicker: string
  description: string
  actionLabel: string
  closeLabel: string
  onReload: () => void
  onDismiss: () => void
}

export const ExtensionUpdateNotice: React.FC<ExtensionUpdateNoticeProps> = ({
  kicker,
  description,
  actionLabel,
  closeLabel,
  onReload,
  onDismiss,
}) => (
  <section className="gh-update-notice gh-interactive" role="status" aria-live="polite">
    <button
      type="button"
      className="gh-update-notice-close"
      aria-label={closeLabel}
      onClick={onDismiss}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
    <div className="gh-update-notice-kicker">
      <svg
        className="gh-update-notice-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </svg>
      {kicker}
    </div>
    <p className="gh-update-notice-message">{description}</p>
    <div className="gh-update-notice-actions">
      <button
        type="button"
        className="gh-update-notice-button gh-update-notice-button--primary"
        onClick={onReload}>
        {actionLabel}
      </button>
    </div>
  </section>
)
