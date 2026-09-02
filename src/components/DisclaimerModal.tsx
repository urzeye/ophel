import { ShieldCheckIcon } from "~components/icons"
import { useSettingsHydrated, useSettingsStore } from "~stores/settings-store"
import { getAppIconUrl } from "~utils/config"
import { GITHUB_REPO_URL } from "~utils/donate-channels"
import { OPHEL_FONT_FAMILY_CSS_VAR } from "~utils/font"
import { t } from "~utils/i18n"

export const DisclaimerModal: React.FC = () => {
  const { settings, setSettings } = useSettingsStore()
  const isHydrated = useSettingsHydrated()

  // 等待 settings hydration 完成，避免默认值短暂覆盖时误弹免责声明。
  if (!isHydrated || !settings || settings.hasAgreedToTerms) {
    return null
  }

  const handleAgree = () => {
    setSettings({ hasAgreedToTerms: true })
  }

  return (
    <div
      className="disclaimer-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("disclaimerTitle")}>
      <div className="disclaimer-modal">
        <div className="disclaimer-header">
          <img src={getAppIconUrl()} alt="Ophel" className="disclaimer-icon-img" />
          <div className="disclaimer-slogan-container">
            <span className="sparkle" aria-hidden="true">
              ✨
            </span>
            <h2 className="disclaimer-title">{t("welcomeSlogan")}</h2>
            <span className="sparkle" aria-hidden="true">
              ✨
            </span>
          </div>
        </div>

        <div className="disclaimer-content">
          <div className="disclaimer-section">
            <p>{t("disclaimerText")}</p>
            <p className="disclaimer-warning">{t("disclaimerWarning")}</p>
            <p className="disclaimer-affiliation">{t("disclaimerAffiliation")}</p>
          </div>

          <div className="disclaimer-section privacy-section">
            <div className="privacy-header">
              <ShieldCheckIcon size={20} className="privacy-icon" />
              <h3 className="privacy-title">{t("privacyTitle")}</h3>
            </div>
            <p className="privacy-content">{t("privacyText")}</p>
          </div>

          <div className="disclaimer-section quote-section">
            <p className="disclaimer-quote-text">{t("communityMotto")}</p>

            <div className="secondary-links">
              <a
                href={`${GITHUB_REPO_URL}/pulls`}
                target="_blank"
                rel="noopener noreferrer"
                className="sec-link">
                {t("disclaimerContribute")}
              </a>
              <span className="divider">/</span>
              <a
                href={`${GITHUB_REPO_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="sec-link">
                {t("reportIssue")}
              </a>
            </div>
          </div>
        </div>

        <div className="disclaimer-footer">
          <button className="disclaimer-agree-btn" autoFocus onClick={handleAgree}>
            {t("agreeButton")}
          </button>
          <p className="disclaimer-agree-note">{t("disclaimerAgreeNote")}</p>
        </div>
      </div>

      <style>{`
        .disclaimer-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          font-family: ${OPHEL_FONT_FAMILY_CSS_VAR};
          pointer-events: auto;
        }

        .disclaimer-modal {
          background: var(--gh-bg, #ffffff);
          border-radius: 16px;
          width: 90%;
          max-width: 600px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          color: var(--gh-text, #1f2937);
          border: 1px solid var(--gh-border, rgba(0,0,0,0.1));
          animation: modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .disclaimer-header {
          padding: 24px 24px 0;
          text-align: center;
        }

        .disclaimer-icon-img {
          width: 64px;
          height: 64px;
          margin-bottom: 20px;
          object-fit: contain;
          border-radius: 50%;
          background: var(--gh-bg, #ffffff);
          padding: 6px;
          border: 1px solid var(--gh-border, rgba(0,0,0,0.1));
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
          /* Ensure centering if parent is flex or block */
          display: inline-block;
        }

        .disclaimer-icon-img:hover {
          transform: rotate(360deg) scale(1.1);
          border-color: #3b82f6;
          box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.2);
        }

        .disclaimer-slogan-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .sparkle {
          font-size: 18px;
        }

        .disclaimer-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .disclaimer-content {
          padding: 24px;
        }

        .disclaimer-section {
          margin-bottom: 16px;
        }

        .disclaimer-section h3 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .disclaimer-section p {
          font-size: 14px;
          line-height: 1.6;
          margin: 0;
          color: var(--gh-text-secondary, #4b5563);
        }

        .disclaimer-warning {
          margin-top: 8px !important;
          /* 请求类提示用 amber 而非错误红，避免抢占免责正文的视觉权重 */
          color: #b45309 !important;
          font-weight: 500;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.25);
          padding: 8px 12px;
          border-radius: 6px;
        }

        :host-context([data-gh-mode="dark"]) .disclaimer-warning {
          color: #fbbf24 !important;
          background: rgba(245, 158, 11, 0.14);
          border-color: rgba(245, 158, 11, 0.3);
        }

        .disclaimer-affiliation {
          margin-top: 12px !important;
          font-size: 12px !important;
          color: var(--gh-text-secondary, #6b7280) !important;
          line-height: 1.5 !important;
        }

        .quote-section {
          text-align: center;
          background: var(--gh-bg-secondary, #f3f4f6);
          padding: 20px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-bottom: 0;
        }

        .privacy-section {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .privacy-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: #10b981;
        }

        .privacy-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
        }

        .privacy-content {
          font-size: 13px !important;
          color: #059669 !important;
          line-height: 1.5 !important;
          margin: 0;
        }

        :host-context([data-gh-mode="dark"]) .privacy-content {
          color: #34d399 !important;
        }

        .disclaimer-quote-text {
           font-size: 15px;
           font-weight: 600;
           line-height: 1.5;
           color: var(--gh-text, #1f2937) !important;
           margin: 0 !important;
           font-style: italic;
        }

        .secondary-links {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--gh-text-secondary, #6b7280);
        }

        .sec-link {
          color: var(--gh-text-secondary, #6b7280);
          text-decoration: none;
          transition: color 0.2s;
        }

        .sec-link:hover {
          color: #3b82f6;
          text-decoration: underline;
        }

        .divider {
          opacity: 0.5;
        }

        .disclaimer-footer {
          padding: 0 24px 24px;
        }

        .disclaimer-agree-btn {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
        }

        .disclaimer-agree-btn:hover {
          opacity: 0.9;
        }

        .disclaimer-agree-btn:active {
          transform: scale(0.98);
        }

        .disclaimer-agree-btn:focus-visible {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }

        .disclaimer-agree-note {
          margin: 10px 0 0;
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
          color: var(--gh-text-secondary, #6b7280);
        }

        @keyframes modal-pop {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
