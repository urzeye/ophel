import { INTER_LOCAL_FONT_FACE, getPlatformFontFamily } from "~utils/font"
import { t } from "~utils/i18n"

const HOST_ID = "ophel-binding-issue-notice"

interface BindingIssueNoticeOptions {
  packId: string
  onOpenSettings: () => void
}

/**
 * 当前站点的显式 SitePack 绑定失效(包被卸载/损坏)时,在主文档注入一次性提示卡片。
 * 该场景下面板不会挂载,不能依赖 Shadow DOM 面板与主题变量,样式自包含。
 */
export function showSitePackBindingIssueNotice(options: BindingIssueNoticeOptions): void {
  if (typeof document === "undefined") return
  if (document.getElementById(HOST_ID)) return

  const host = document.createElement("div")
  host.id = HOST_ID
  host.style.cssText = [
    "position: fixed",
    "right: 24px",
    "bottom: 24px",
    "z-index: 2147483647",
    "pointer-events: auto",
  ].join(";")

  const title = t("sitePackBindingNoticeTitle")
  const message = t("sitePackBindingNoticeMessage", { packId: options.packId })
  const actionLabel = t("sitePackBindingNoticeAction")
  const closeLabel = t("close")

  const shadowRoot = host.attachShadow({ mode: "open" })
  shadowRoot.innerHTML = `
    <style>
      ${INTER_LOCAL_FONT_FACE}
      :host {
        all: initial;
      }
      .ophel-binding-card {
        width: min(360px, calc(100vw - 32px));
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.18);
        color: #111827;
        font-family: ${getPlatformFontFamily()};
        padding: 16px 20px;
        position: relative;
        animation: ophel-binding-notice-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @media (prefers-color-scheme: dark) {
        .ophel-binding-card {
          background: rgba(17, 24, 39, 0.92);
          border-color: rgba(148, 163, 184, 0.3);
          color: #f3f4f6;
        }
        .ophel-binding-message {
          color: #d1d5db;
        }
        .ophel-binding-close {
          background: rgba(156, 163, 175, 0.15);
          color: #9ca3af;
        }
        .ophel-binding-close:hover {
          background: rgba(156, 163, 175, 0.25);
          color: #f3f4f6;
        }
      }
      .ophel-binding-title {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #b45309;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      @media (prefers-color-scheme: dark) {
        .ophel-binding-title {
          color: #fbbf24;
        }
      }
      .ophel-binding-message {
        color: #374151;
        font-size: 13px;
        line-height: 1.6;
        margin: 0 0 14px;
        padding-right: 24px;
        word-break: break-word;
      }
      .ophel-binding-actions {
        display: flex;
        justify-content: flex-end;
      }
      .ophel-binding-button {
        appearance: none;
        border: none;
        border-radius: 10px;
        background: #2563eb;
        color: #ffffff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 16px;
        transition: background 0.2s;
      }
      .ophel-binding-button:hover {
        background: #1d4ed8;
      }
      .ophel-binding-close {
        position: absolute;
        top: 12px;
        right: 12px;
        appearance: none;
        border: none;
        background: rgba(107, 114, 128, 0.1);
        color: #6b7280;
        cursor: pointer;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.2s;
      }
      .ophel-binding-close:hover {
        background: rgba(107, 114, 128, 0.2);
        color: #111827;
      }
      @keyframes ophel-binding-notice-enter {
        0% { opacity: 0; transform: translateY(16px); }
        100% { opacity: 1; transform: translateY(0); }
      }
    </style>
    <section class="ophel-binding-card" role="alert">
      <button class="ophel-binding-close" type="button" aria-label="${closeLabel}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
      <div class="ophel-binding-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/>
        </svg>
        ${title}
      </div>
      <p class="ophel-binding-message"></p>
      <div class="ophel-binding-actions">
        <button class="ophel-binding-button" type="button">${actionLabel}</button>
      </div>
    </section>
  `

  // message 含用户可输入的 packId,用 textContent 注入,避免 HTML 注入
  const messageEl = shadowRoot.querySelector<HTMLParagraphElement>(".ophel-binding-message")
  if (messageEl) messageEl.textContent = message

  shadowRoot
    .querySelector<HTMLButtonElement>(".ophel-binding-button")
    ?.addEventListener("click", () => {
      options.onOpenSettings()
      host.remove()
    })

  shadowRoot
    .querySelector<HTMLButtonElement>(".ophel-binding-close")
    ?.addEventListener("click", () => {
      host.remove()
    })
  ;(document.body || document.documentElement).appendChild(host)
}
