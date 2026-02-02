import { GithubIcon, ShieldCheckIcon } from "~components/icons"
import { useSettingsStore } from "~stores/settings-store"
import { APP_ICON_URL } from "~utils/config"
import { getStoreInfo } from "~utils/getStoreInfo"
import { t } from "~utils/i18n"

export const DisclaimerModal: React.FC = () => {
  const { settings, setSettings } = useSettingsStore()

  // 如果已经同意或者 settings 还没加载，不显示
  if (!settings || settings.hasAgreedToTerms) {
    return null
  }

  const handleAgree = () => {
    setSettings({ hasAgreedToTerms: true })
  }

  return (
    <div className="disclaimer-modal-overlay">
      <div className="disclaimer-modal">
        <div className="disclaimer-header">
          <img src={APP_ICON_URL} alt="Ophel" className="disclaimer-icon-img" />
          <div className="disclaimer-slogan-container">
            <span className="sparkle">✨</span>
            <h2 className="disclaimer-title">{t("welcomeSlogan") || "AI 之益，触手可及"}</h2>
            <span className="sparkle">✨</span>
          </div>
        </div>

        <div className="disclaimer-content">
          <div className="disclaimer-section">
            <p>
              {t("disclaimerText") ||
                "本插件为通用辅助工具，依赖于第三方站点的页面结构和布局。如果原网站更新导致功能失效，恳请前往 GitHub 提交 Issue 反馈，我们将尽快修复。"}
            </p>
            <p className="disclaimer-warning">
              {t("disclaimerWarning") ||
                "请勿因第三方站点改版导致的问题在应用商店给出差评，感谢您的理解与支持！"}
            </p>
          </div>

          <div className="disclaimer-section privacy-section">
            <div className="privacy-header">
              <ShieldCheckIcon size={20} className="privacy-icon" />
              <h3 className="privacy-title">{t("privacyTitle") || "隐私保护"}</h3>
            </div>
            <p className="privacy-content">
              {t("privacyText") ||
                "本插件所有数据均存储在本地浏览器中，不会主动上传到任何服务器。您的账号信息和使用数据完全由您自己掌控，确保隐私安全。"}
            </p>
          </div>

          <div className="disclaimer-section quote-section">
            <p className="disclaimer-quote-text">
              {t("communityMotto") || "一个人可以走的更快，但一群人可以走得更远。"}
            </p>

            <div className="action-row">
              <a
                href="https://github.com/urzeye/ophel"
                target="_blank"
                rel="noopener noreferrer"
                className="star-btn">
                <GithubIcon size={18} />
                <span>{t("giveStar") || "点个 Star"}</span>
              </a>

              <a
                href={getStoreInfo().url}
                target="_blank"
                rel="noopener noreferrer"
                className="star-btn review-btn">
                {getStoreInfo().icon}
                <span>{getStoreInfo().label}</span>
              </a>
            </div>

            <div className="secondary-links">
              <a
                href="https://github.com/urzeye/ophel/pulls"
                target="_blank"
                rel="noopener noreferrer"
                className="sec-link">
                PR
              </a>
              <span className="divider">/</span>
              <a
                href="https://github.com/urzeye/ophel/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="sec-link">
                Issue
              </a>
            </div>
          </div>
        </div>

        <div className="disclaimer-footer">
          <button className="disclaimer-agree-btn" onClick={handleAgree}>
            {t("agreeButton") || "我已知晓并同意"}
          </button>
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
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
          margin-bottom: 20px;
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
          color: #ef4444 !important;
          font-weight: 500;
          background: rgba(239, 68, 68, 0.1);
          padding: 8px 12px;
          border-radius: 6px;
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
          margin-bottom: 20px;
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

        .action-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .star-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #24292e; /* GitHub Dark */
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .star-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
          background: #2f363d;
          border-color: rgba(255,255,255,0.2);
          color: white;
        }

        .review-btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        }

        .review-btn:hover {
          background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
        }

        .star-btn:active {
          transform: scale(0.96);
        }

        :host-context([data-gh-mode="dark"]) .star-btn {
          background: #3b82f6;
          border: none;
        }

        :host-context([data-gh-mode="dark"]) .star-btn:hover {
          background: #2563eb;
        }

        :host-context([data-gh-mode="dark"]) .review-btn {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
        }

        :host-context([data-gh-mode="dark"]) .review-btn:hover {
           background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
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
