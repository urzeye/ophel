// 独立导出表面使用已有 HTML 文档的语义颜色，不继承宿主页样式。
// 注意：成品经 html-to-image 白名单内联样式捕获，新增样式只使用白名单内的属性。
export const EXPORT_IMAGE_DOCUMENT_CSS = `
.gh-export-document {
  --gh-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --gh-export-canvas: #f5f3ef;
  --gh-export-card: #ffffff;
  --gh-export-bubble: #e9f1fd;
  --gh-export-bubble-border: #d7e4fb;
  --gh-export-bubble-name: #3367d6;
  --gh-export-head-gap: 30px;
  width: 800px; font-size: 16px; line-height: 1.75;
}
.gh-export-document[data-theme="dark"] {
  --gh-export-canvas: #131315;
  --gh-export-card: #1d1d21;
  --gh-export-bubble: rgba(129, 140, 248, 0.15);
  --gh-export-bubble-border: rgba(129, 140, 248, 0.3);
  --gh-export-bubble-name: #a5b0fa;
}
.gh-export-document *, .gh-export-document *::before, .gh-export-document *::after {
  animation: none !important; transition: none !important; caret-color: transparent !important;
}
.gh-export-document {
  background: var(--gh-export-canvas);
}
.gh-export-document .gh-shell {
  width: 100%; max-width: none; margin: 0; padding: 44px 48px 30px;
  border: 0; border-radius: 0; box-shadow: none; background: transparent;
}

/* 文档头部：展示级标题 + 安静元信息 */
.gh-export-document .gh-doc-header {
  padding: 0 0 22px; border-bottom: 1px solid var(--gh-border);
}
.gh-export-document .gh-doc-header h1 {
  margin: 0 0 12px; font-size: 34px; font-weight: 800; line-height: 1.22;
  letter-spacing: -0.03em; text-wrap: balance; overflow-wrap: anywhere;
}
.gh-export-document .gh-doc-meta {
  font-size: 13px; font-weight: 500; letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums; color: var(--gh-text-secondary);
}

/* 对话流：靠对齐与着色区分角色，而不是堆卡片 */
.gh-export-document .gh-conversation { margin: var(--gh-export-head-gap) 0 0; }
.gh-export-document .gh-message {
  padding: 0; margin: 0 0 30px; border: 0; border-radius: 0; box-shadow: none;
  background: transparent; overflow-wrap: anywhere;
}
.gh-export-document .gh-message:last-child { margin-bottom: 0; }
.gh-export-document .gh-message[data-role="user"] {
  margin-left: 72px; padding: 16px 20px;
  border: 1px solid var(--gh-export-bubble-border); border-radius: 14px 14px 5px 14px;
  background: var(--gh-export-bubble);
}
.gh-export-document .gh-msg-head { gap: 9px; margin-bottom: 0; }
.gh-export-document .gh-msg-head + .gh-markdown-preview { margin-top: 12px; }
.gh-export-document .gh-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: transparent; color: var(--gh-text-secondary);
}
.gh-export-document .gh-avatar svg { width: 15px; height: 15px; }
.gh-export-document .gh-message[data-role="user"] .gh-avatar {
  background: var(--gh-primary); color: #ffffff;
}
.gh-export-document .gh-message[data-role="user"] .gh-avatar svg { width: 13px; height: 13px; }
.gh-export-document .gh-message[data-role="assistant"] .gh-avatar {
  background: var(--gh-primary-soft); color: var(--gh-primary);
}
.gh-export-document .gh-msg-name {
  font-size: 12.5px; font-weight: 650; letter-spacing: 0.02em; color: var(--gh-text-secondary);
}
.gh-export-document .gh-message[data-role="user"] .gh-msg-name { color: var(--gh-export-bubble-name); }

/* 正文排版 */
.gh-export-document .gh-markdown-preview { font-size: 16px; line-height: 1.75; text-wrap: pretty; }
.gh-export-document .gh-markdown-preview p { margin: 14px 0; }
.gh-export-document .gh-markdown-preview h1,
.gh-export-document .gh-markdown-preview h2,
.gh-export-document .gh-markdown-preview h3,
.gh-export-document .gh-markdown-preview h4 {
  margin: 26px 0 10px; letter-spacing: -0.02em; text-wrap: balance;
}
.gh-export-document .gh-markdown-preview h2 { padding-bottom: 8px; border-bottom: 1px solid var(--gh-border); }
.gh-export-document .gh-markdown-preview blockquote {
  margin: 16px 0; padding: 10px 16px;
  border-left: 2px solid var(--gh-border-strong); border-radius: 0 10px 10px 0;
  background: color-mix(in srgb, var(--gh-hover) 60%, transparent);
}
.gh-export-document .gh-markdown-preview :not(pre) > code:not(.hljs) {
  padding: 2px 6px; border: 1px solid var(--gh-border); border-radius: 6px;
  font-size: 0.85em;
}

/* 媒体：统一装裱，透明底图片落在纸面卡片上 */
.gh-export-document .gh-markdown-preview img,
.gh-export-document .gh-export-diagram {
  background: var(--gh-export-card);
  border: 1px solid var(--gh-border); border-radius: 12px;
  box-shadow: 0 1px 2px rgba(28, 25, 23, 0.04), 0 8px 24px rgba(28, 25, 23, 0.06);
}
.gh-export-document .gh-markdown-preview img { display: block; max-width: 100%; height: auto; object-fit: contain; }
.gh-export-document .gh-export-diagram { margin: 20px 0; padding: 20px; text-align: center; }
.gh-export-document .gh-export-diagram svg { display: block; max-width: 100%; height: auto; margin: auto; }
.gh-export-document[data-theme="dark"] .gh-markdown-preview img,
.gh-export-document[data-theme="dark"] .gh-export-diagram {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35);
}

/* 代码块：纸面上的深色面板是唯一重色，作为视觉锚点保留 */
.gh-export-document .gh-code-wrapper {
  margin: 20px 0; border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 2px rgba(28, 25, 23, 0.05), 0 10px 28px rgba(28, 25, 23, 0.1);
}
.gh-export-document[data-theme="dark"] .gh-code-wrapper {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 10px 28px rgba(0, 0, 0, 0.45);
}
.gh-export-document .gh-code-header { height: 40px; padding: 0 16px; }
.gh-export-document .gh-code-lang { font-size: 11px; letter-spacing: 0.08em; }
.gh-export-document .gh-code-wrapper pre code { padding: 16px 20px; font-size: 13px; line-height: 1.7; }
.gh-export-document .gh-markdown-preview pre,
.gh-export-document .gh-code-wrapper pre code {
  white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; overflow: visible;
}

/* 表格 */
.gh-export-document .gh-markdown-preview table {
  display: table; width: 100%; table-layout: fixed; overflow: visible; margin: 18px 0; font-size: 14px;
}
.gh-export-document .gh-markdown-preview th, .gh-export-document .gh-markdown-preview td { padding: 9px 14px; }
.gh-export-document th, .gh-export-document td { overflow-wrap: anywhere; word-break: break-word; }

.gh-export-document .math-block { overflow: visible; }
.gh-export-document math { max-width: 100%; }
.gh-export-document .gh-thought { border-radius: 12px; }

/* 分页切片框架 */
.gh-export-document .gh-export-slice { overflow: hidden; position: relative; margin-top: var(--gh-export-head-gap); }
.gh-export-document .gh-export-slice .gh-conversation { margin: 0; transform-origin: top left; }
.gh-export-document .gh-export-slice + .gh-export-brand { margin-top: 30px; }

/* 品牌页脚：一根发丝线 + 安静的双端信息 */
.gh-export-document .gh-export-brand {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding-top: 18px; border-top: 1px solid var(--gh-border);
  color: var(--gh-text-secondary); font-size: 12px; line-height: 1.5;
}
.gh-export-document .gh-export-brand-signature { display: flex; align-items: center; gap: 8px; }
.gh-export-document .gh-export-brand img {
  width: 18px; height: 18px; flex: 0 0 auto; border: 0; border-radius: 4px; box-shadow: none; background: transparent;
}
.gh-export-document .gh-export-brand strong { font-weight: 600; letter-spacing: 0.01em; color: var(--gh-text); }
.gh-export-document .gh-export-brand-site { white-space: nowrap; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
`
