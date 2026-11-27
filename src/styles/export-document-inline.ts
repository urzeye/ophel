// 独立导出表面使用自洽的编辑级配色与排版，不继承宿主页样式。
// 注意：成品经 html-to-image 白名单内联样式捕获，新增样式只使用白名单内的属性。
export const EXPORT_IMAGE_DOCUMENT_CSS = `
.gh-export-document {
  --gh-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --gh-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --gh-bg: #faf9f6;
  --gh-surface: #ffffff;
  --gh-border: #e7e5e0;
  --gh-border-strong: #d3cfc7;
  --gh-text: #18181b;
  --gh-text-secondary: #52525b;
  --gh-text-tertiary: #8c8c96;
  --gh-primary: #2563eb;
  --gh-primary-soft: #eff6ff;
  --gh-primary-soft-border: #dbeafe;
  --gh-hover: #f3f2ee;
  --gh-export-canvas: #faf9f6;
  --gh-export-card: #ffffff;
  --gh-export-card-frame: #eef1f5;
  --gh-export-card-border: rgba(15, 23, 42, 0.08);
  --gh-export-bubble: #eef4ff;
  --gh-export-bubble-border: #d7e5fe;
  --gh-export-bubble-name: #1d4ed8;
  --gh-export-code-bg: #16181f;
  --gh-export-code-header: #1e212b;
  --gh-export-code-border: #2a2f3d;
  --gh-export-table-stripe: #faf9f7;
  --gh-export-thought-bg: #f4f3ef;
  --gh-export-head-gap: 28px;
  --gh-export-pad-top: 40px;
  --gh-export-pad-x: 44px;
  --gh-export-pad-bottom: 28px;
  --gh-export-card-pad: 24px;
  --gh-export-shadow-pad: 38px;
  width: 800px;
  color: var(--gh-text);
  background: var(--gh-export-canvas);
  font-family: var(--gh-font);
  font-size: var(--gh-export-font-size, 16px);
  line-height: 1.75;
}
.gh-export-document[data-theme="dark"] {
  --gh-bg: #12141a;
  --gh-surface: #181b22;
  --gh-border: #272b36;
  --gh-border-strong: #373c4b;
  --gh-text: #eceef3;
  --gh-text-secondary: #9ca3b0;
  --gh-text-tertiary: #6d7483;
  --gh-primary: #7aa2f7;
  --gh-primary-soft: rgba(122, 162, 247, 0.14);
  --gh-primary-soft-border: rgba(122, 162, 247, 0.28);
  --gh-hover: #1f232e;
  --gh-export-canvas: #12141a;
  --gh-export-card: #181b22;
  --gh-export-card-frame: #0b0d12;
  --gh-export-card-border: rgba(255, 255, 255, 0.08);
  --gh-export-bubble: rgba(122, 162, 247, 0.12);
  --gh-export-bubble-border: rgba(122, 162, 247, 0.25);
  --gh-export-bubble-name: #9bb8fb;
  --gh-export-code-bg: #0f1117;
  --gh-export-code-header: #141821;
  --gh-export-code-border: #2c3242;
  --gh-export-table-stripe: rgba(255, 255, 255, 0.025);
  --gh-export-thought-bg: #171a22;
}

/* 三档宽度黄金留白 */
.gh-export-document[data-width="640"] {
  --gh-export-pad-top: 30px;
  --gh-export-pad-x: 32px;
  --gh-export-pad-bottom: 24px;
  --gh-export-card-pad: 18px;
  --gh-export-shadow-pad: 26px;
  --gh-export-head-gap: 24px;
}
.gh-export-document[data-width="1000"] {
  --gh-export-pad-top: 48px;
  --gh-export-pad-x: 56px;
  --gh-export-pad-bottom: 34px;
  --gh-export-card-pad: 28px;
  --gh-export-shadow-pad: 44px;
  --gh-export-head-gap: 32px;
}

.gh-export-document *,
.gh-export-document *::before,
.gh-export-document *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}

.gh-export-document .gh-shell {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: var(--gh-export-pad-top) var(--gh-export-pad-x) var(--gh-export-pad-bottom);
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

/* 外观预设：纸面 / 卡片 / 阴影 */
.gh-export-document[data-appearance="card"] {
  padding: var(--gh-export-card-pad);
  background-color: var(--gh-export-card-frame);
}
.gh-export-document[data-appearance="card"] .gh-shell {
  border-radius: 16px;
  background: var(--gh-export-card);
  border: 1px solid var(--gh-export-card-border);
}

.gh-export-document[data-appearance="shadow"] {
  padding: var(--gh-export-shadow-pad);
  background-color: #ebeef4;
  background-image: linear-gradient(145deg, #e7edf7 0%, #f2f0eb 52%, #ece9f5 100%);
}
.gh-export-document[data-theme="dark"][data-appearance="shadow"] {
  background-color: #0d1017;
  background-image: linear-gradient(145deg, #0b0e17 0%, #11131b 52%, #13101d 100%);
}
.gh-export-document[data-appearance="shadow"] .gh-shell {
  border-radius: 16px;
  background: var(--gh-export-card);
  border: 1px solid var(--gh-export-card-border);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 12px 28px -6px rgba(15, 23, 42, 0.1),
    0 28px 56px -14px rgba(15, 23, 42, 0.13);
}
.gh-export-document[data-theme="dark"][data-appearance="shadow"] .gh-shell {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 14px 32px -6px rgba(0, 0, 0, 0.48),
    0 32px 64px -14px rgba(0, 0, 0, 0.56);
}

.gh-export-document[data-has-header="false"] .gh-conversation,
.gh-export-document[data-has-header="false"] .gh-export-slice {
  margin-top: 0;
}

/* 文档头部：按正文字号等比缩放的杂志级刊头 */
.gh-export-document .gh-doc-header {
  padding: 0 0 20px;
  border-bottom: 1px solid var(--gh-border);
}
.gh-export-document .gh-doc-header h1 {
  margin: 0 0 12px;
  font-size: calc(var(--gh-export-font-size, 16px) * 1.65);
  font-weight: 760;
  line-height: 1.28;
  letter-spacing: -0.025em;
  color: var(--gh-text);
  text-wrap: balance;
  overflow-wrap: break-word;
}
.gh-export-document .gh-doc-header h1:last-child {
  margin-bottom: 0;
}
.gh-export-document .gh-doc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--gh-text-secondary);
}
.gh-export-document .gh-doc-source {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--gh-hover);
  border: 1px solid var(--gh-border);
  color: var(--gh-text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.4;
}
.gh-export-document .gh-meta-dot {
  color: var(--gh-text-tertiary);
}

/* 对话流：自适应右对齐精巧用户气泡 + 宽敞干净的回答阅读流 */
.gh-export-document .gh-conversation {
  margin: var(--gh-export-head-gap) 0 0;
}
.gh-export-document .gh-message {
  padding: 0;
  margin: 0 0 30px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  overflow-wrap: break-word;
}
.gh-export-document .gh-message:last-child {
  margin-bottom: 0;
}
.gh-export-document .gh-message[data-role="assistant"] + .gh-message[data-role="assistant"] {
  padding-top: 24px;
  border-top: 1px solid var(--gh-border);
}
.gh-export-document .gh-message[data-role="user"] {
  width: fit-content;
  min-width: 160px;
  max-width: 86%;
  margin-left: auto;
  padding: 14px 18px;
  border: 1px solid var(--gh-export-bubble-border);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  border-bottom-right-radius: 4px;
  border-bottom-left-radius: 16px;
  border-radius: 16px 16px 4px 16px;
  background: var(--gh-export-bubble);
}
.gh-export-document[data-width="640"] .gh-message[data-role="user"] {
  max-width: 90%;
  padding: 12px 16px;
}
.gh-export-document .gh-msg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
}
.gh-export-document .gh-msg-head + .gh-markdown-preview {
  margin-top: 10px;
}
.gh-export-document .gh-message[data-role="user"] .gh-msg-head + .gh-markdown-preview {
  margin-top: 8px;
}
.gh-export-document .gh-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
  color: var(--gh-text-secondary);
}
.gh-export-document .gh-avatar svg {
  width: 14px;
  height: 14px;
}
.gh-export-document .gh-message[data-role="user"] .gh-avatar {
  width: 22px;
  height: 22px;
  background: var(--gh-primary);
  color: #ffffff;
}
.gh-export-document .gh-message[data-role="user"] .gh-avatar svg {
  width: 12px;
  height: 12px;
}
.gh-export-document .gh-message[data-role="assistant"] .gh-avatar {
  background: var(--gh-primary-soft);
  color: var(--gh-primary);
}
.gh-export-document .gh-msg-name {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--gh-text);
}
.gh-export-document .gh-message[data-role="user"] .gh-msg-name {
  font-size: 12px;
  color: var(--gh-export-bubble-name);
}

/* 正文排版 */
.gh-export-document .gh-markdown-preview {
  font-size: var(--gh-export-font-size, 16px);
  line-height: 1.75;
  color: var(--gh-text);
  text-wrap: pretty;
}
.gh-export-document .gh-markdown-preview p {
  margin: 13px 0;
}
.gh-export-document .gh-markdown-preview h1,
.gh-export-document .gh-markdown-preview h2,
.gh-export-document .gh-markdown-preview h3,
.gh-export-document .gh-markdown-preview h4 {
  margin: 26px 0 10px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: var(--gh-text);
  text-wrap: balance;
}
.gh-export-document .gh-markdown-preview h1 { font-size: 1.38em; }
.gh-export-document .gh-markdown-preview h2 {
  font-size: 1.22em;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--gh-border);
}
.gh-export-document .gh-markdown-preview h3 { font-size: 1.08em; }
.gh-export-document .gh-markdown-preview h4 { font-size: 1em; }
.gh-export-document .gh-markdown-preview ul,
.gh-export-document .gh-markdown-preview ol {
  margin: 13px 0;
  padding-left: 24px;
}
.gh-export-document .gh-markdown-preview li {
  margin: 6px 0;
}
.gh-export-document .gh-markdown-preview li > p {
  margin: 6px 0;
}
.gh-export-document .gh-markdown-preview a {
  color: var(--gh-primary);
  border-bottom: 0;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--gh-primary) 40%, transparent);
  text-underline-offset: 3px;
}
.gh-export-document .gh-markdown-preview blockquote {
  margin: 16px 0;
  padding: 4px 0 4px 16px;
  border-left: 2px solid var(--gh-border-strong);
  border-radius: 0;
  background: transparent;
  color: var(--gh-text-secondary);
}
.gh-export-document .gh-markdown-preview blockquote > :first-child { margin-top: 0; }
.gh-export-document .gh-markdown-preview blockquote > :last-child { margin-bottom: 0; }
.gh-export-document .gh-markdown-preview :not(pre) > code:not(.hljs) {
  padding: 1.5px 6px;
  border: 1px solid var(--gh-border);
  border-radius: 6px;
  background: var(--gh-hover);
  font-family: var(--gh-mono);
  font-size: 0.86em;
  color: var(--gh-text);
}
.gh-export-document .gh-markdown-preview hr {
  margin: 24px 0;
  border: 0;
  border-top: 1px solid var(--gh-border);
}

/* 思维链：柔和低干扰容器区分思考过程与正式结论 */
.gh-export-document .gh-thought {
  margin: 14px 0 18px;
  border: 1px solid var(--gh-border);
  border-radius: 12px;
  background: var(--gh-export-thought-bg);
}
.gh-export-document .gh-thought-summary {
  padding: 10px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gh-text-secondary);
}
.gh-export-document .gh-thought-body blockquote {
  margin: 0;
  padding: 10px 14px 12px;
  border-left: 0;
  border-radius: 0;
  background: transparent;
  font-size: 0.9em;
  line-height: 1.65;
  color: var(--gh-text-secondary);
}

/* 媒体：统一装裱，透明底图片落在卡片面上 */
.gh-export-document .gh-markdown-preview img,
.gh-export-document .gh-export-diagram {
  background: var(--gh-export-card);
  border: 1px solid var(--gh-border);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 20px rgba(15, 23, 42, 0.06);
}
.gh-export-document .gh-markdown-preview img {
  display: block;
  max-width: 100%;
  height: auto;
  object-fit: contain;
}
.gh-export-document .gh-export-diagram {
  margin: 18px 0;
  padding: 20px;
  text-align: center;
}
.gh-export-document .gh-export-diagram svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: auto;
}
.gh-export-document[data-theme="dark"] .gh-markdown-preview img,
.gh-export-document[data-theme="dark"] .gh-export-diagram {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.35);
}

/* 代码块：精致深石板代码面板 */
.gh-export-document .gh-code-wrapper {
  margin: 18px 0;
  border: 1px solid var(--gh-export-code-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--gh-export-code-bg);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 24px rgba(15, 23, 42, 0.09);
}
.gh-export-document[data-theme="dark"] .gh-code-wrapper {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.32), 0 10px 26px rgba(0, 0, 0, 0.42);
}
.gh-export-document .gh-code-header {
  height: 36px;
  padding: 0 16px;
  background: var(--gh-export-code-header);
  border-bottom: 1px solid var(--gh-export-code-border);
}
.gh-export-document .gh-code-lang {
  font-family: var(--gh-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #9aa3b2;
}
.gh-export-document .gh-code-wrapper pre code {
  padding: 15px 18px;
  font-size: calc(var(--gh-export-font-size, 16px) * 0.8125);
  line-height: 1.68;
  background: var(--gh-export-code-bg);
  color: #e6eaf2;
}
.gh-export-document .gh-markdown-preview pre,
.gh-export-document .gh-code-wrapper pre code {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  overflow: visible;
}

/* 表格：自适应列宽 + 圆角外框 + 轻表头与斑马纹 */
.gh-export-document .gh-markdown-preview table {
  display: table;
  width: 100%;
  table-layout: auto;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--gh-border);
  border-radius: 10px;
  overflow: hidden;
  margin: 18px 0;
  font-size: calc(var(--gh-export-font-size, 16px) * 0.875);
  line-height: 1.6;
}
.gh-export-document .gh-markdown-preview th,
.gh-export-document .gh-markdown-preview td {
  padding: 9px 13px;
  border: 0;
  border-right: 1px solid var(--gh-border);
  border-bottom: 1px solid var(--gh-border);
  overflow-wrap: break-word;
  word-break: break-word;
}
.gh-export-document .gh-markdown-preview th:last-child,
.gh-export-document .gh-markdown-preview td:last-child {
  border-right: 0;
}
.gh-export-document .gh-markdown-preview tbody tr:last-child td {
  border-bottom: 0;
}
.gh-export-document .gh-markdown-preview th {
  background: var(--gh-hover);
  font-weight: 650;
  color: var(--gh-text);
}
.gh-export-document .gh-markdown-preview tbody tr:nth-child(even) td {
  background: var(--gh-export-table-stripe);
}

.gh-export-document .math-block { overflow: visible; }
.gh-export-document math { max-width: 100%; }

/* 分页切片框架 */
.gh-export-document .gh-export-slice {
  overflow: hidden;
  position: relative;
  margin-top: var(--gh-export-head-gap);
}
.gh-export-document .gh-export-slice .gh-conversation {
  margin: 0;
  transform-origin: top left;
}
.gh-export-document .gh-export-slice + .gh-export-brand {
  margin-top: 28px;
}

/* 品牌页脚与水印页脚 */
.gh-export-document .gh-export-brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--gh-border);
  color: var(--gh-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.gh-export-document .gh-export-brand-signature {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gh-export-document .gh-export-brand img {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 4px;
  box-shadow: none;
  background: transparent;
}
.gh-export-document .gh-export-brand strong {
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--gh-text);
}
.gh-export-document .gh-export-brand-site {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: var(--gh-text-tertiary);
}
.gh-export-document .gh-export-watermark-slot {
  margin-top: 14px;
}
.gh-export-document .gh-export-slice + .gh-export-watermark-slot {
  margin-top: 26px;
  border-top: 1px solid var(--gh-border);
}
`
