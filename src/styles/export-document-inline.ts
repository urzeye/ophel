// 独立导出表面使用已有 HTML 文档的语义颜色，不继承宿主页样式。
export const EXPORT_IMAGE_DOCUMENT_CSS = `
.gh-export-document {
  --gh-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  width: 800px; font-size: 16px; line-height: 1.75;
}
.gh-export-document *, .gh-export-document *::before, .gh-export-document *::after {
  animation: none !important; transition: none !important; caret-color: transparent !important;
}
.gh-export-document .gh-shell {
  width: 100%; max-width: none; margin: 0; padding: 40px 44px 32px;
  border: 0; border-radius: 0; box-shadow: none;
}
.gh-export-document .gh-doc-header { padding: 0 0 24px; border-bottom: 1px solid var(--gh-border); }
.gh-export-document .gh-doc-header h1 {
  font-size: 32px; font-weight: 750; line-height: 1.25; letter-spacing: -0.025em;
  text-wrap: balance; overflow-wrap: anywhere;
}
.gh-export-document .gh-doc-meta { font-size: 13px; color: var(--gh-text-secondary); }
.gh-export-document .gh-conversation { margin: 28px 0 0; }
.gh-export-document .gh-message {
  padding: 0; margin: 0 0 32px; border: 0; border-radius: 0; box-shadow: none;
  background: transparent; overflow-wrap: anywhere;
}
.gh-export-document .gh-message:last-child { margin-bottom: 0; }
.gh-export-document .gh-message[data-role="user"] {
  padding: 20px 24px; border-radius: 12px; background: var(--gh-primary-soft);
}
.gh-export-document .gh-msg-head { margin-bottom: 12px; }
.gh-export-document .gh-msg-name { font-size: 13px; }
.gh-export-document .gh-markdown-preview { font-size: 16px; line-height: 1.8; }
.gh-export-document .gh-markdown-preview p { margin: 16px 0; }
.gh-export-document .gh-markdown-preview h1,
.gh-export-document .gh-markdown-preview h2,
.gh-export-document .gh-markdown-preview h3 { margin-top: 28px; text-wrap: balance; }
.gh-export-document .gh-markdown-preview pre,
.gh-export-document .gh-code-wrapper pre code {
  white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; overflow: visible;
}
.gh-export-document .gh-code-wrapper { overflow: hidden; }
.gh-export-document .gh-code-header { padding: 8px 16px; }
.gh-export-document .gh-markdown-preview table {
  display: table; width: 100%; table-layout: fixed; overflow: visible; font-size: 14px;
}
.gh-export-document th, .gh-export-document td { overflow-wrap: anywhere; word-break: break-word; }
.gh-export-document img { display: block; max-width: 100%; height: auto; object-fit: contain; }
.gh-export-document .math-block { overflow: visible; }
.gh-export-document math { max-width: 100%; }
.gh-export-document .gh-export-diagram { margin: 24px 0; text-align: center; }
.gh-export-document .gh-export-diagram svg { display: block; max-width: 100%; height: auto; margin: auto; }
.gh-export-document .gh-export-slice { overflow: hidden; position: relative; }
.gh-export-document .gh-export-slice .gh-conversation { margin: 0; transform-origin: top left; }
.gh-export-document .gh-export-slice + .gh-export-brand { margin-top: 28px; }
.gh-export-document .gh-export-brand {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding-top: 20px; border-top: 1px solid var(--gh-border);
  color: var(--gh-text-secondary); font-size: 12px; line-height: 1.5;
}
.gh-export-document .gh-export-brand-signature { display: flex; align-items: center; gap: 8px; }
.gh-export-document .gh-export-brand img { width: 24px; height: 24px; flex: 0 0 auto; }
.gh-export-document .gh-export-brand strong { font-weight: 600; color: var(--gh-text); }
.gh-export-document .gh-export-brand-site { white-space: nowrap; font-variant-numeric: tabular-nums; }
`
