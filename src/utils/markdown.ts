/**
 * Markdown 渲染工具
 *
 * 基于 markdown-it + highlight.js 实现
 * 支持代码高亮和变量占位符高亮
 */

import hljs from "highlight.js/lib/core"
// 按需加载语言
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import diff from "highlight.js/lib/languages/diff"
import dockerfile from "highlight.js/lib/languages/dockerfile"
import go from "highlight.js/lib/languages/go"
import java from "highlight.js/lib/languages/java"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import python from "highlight.js/lib/languages/python"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"
import MarkdownIt from "markdown-it"
import anchor from "markdown-it-anchor"
import container from "markdown-it-container"
import { full as emoji } from "markdown-it-emoji"
import mark from "markdown-it-mark"
import taskLists from "markdown-it-task-lists"

// 注册语言
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("js", javascript)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("ts", typescript)
hljs.registerLanguage("python", python)
hljs.registerLanguage("css", css)
hljs.registerLanguage("html", xml)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("vue", xml)
hljs.registerLanguage("json", json)
hljs.registerLanguage("java", java)
hljs.registerLanguage("go", go)
hljs.registerLanguage("rust", rust)
hljs.registerLanguage("bash", bash)
hljs.registerLanguage("shell", bash)
hljs.registerLanguage("sh", bash)
hljs.registerLanguage("sql", sql)
hljs.registerLanguage("yaml", yaml)
hljs.registerLanguage("yml", yaml)
hljs.registerLanguage("diff", diff)
hljs.registerLanguage("git", diff)
hljs.registerLanguage("dockerfile", dockerfile)
hljs.registerLanguage("docker", dockerfile)

// 创建 markdown-it 实例
const md = new MarkdownIt({
  html: false, // 禁用 HTML 标签（安全）
  breaks: true, // 换行转 <br>
  linkify: true, // 自动识别链接
  highlight: (str: string, lang: string) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch {
        // 忽略错误
      }
    }
    // 自动检测语言
    try {
      return hljs.highlightAuto(str).value
    } catch {
      return "" // 使用默认转义
    }
  },
})

// 使用任务列表插件（关闭 label 选项避免重复渲染）
md.use(taskLists, { enabled: true, label: false })
// 使用 emoji 插件
md.use(emoji)
// 使用高亮插件 ==text==
md.use(mark)
// 使用标题锚点插件
md.use(anchor, { permalink: false })
// 使用容器插件 :::info, :::warning, :::danger
md.use(container, "info", {
  render: (tokens: { nesting: number }[], idx: number) =>
    tokens[idx].nesting === 1 ? '<div class="gh-container gh-container-info">' : "</div>\n",
})
md.use(container, "warning", {
  render: (tokens: { nesting: number }[], idx: number) =>
    tokens[idx].nesting === 1 ? '<div class="gh-container gh-container-warning">' : "</div>\n",
})
md.use(container, "danger", {
  render: (tokens: { nesting: number }[], idx: number) =>
    tokens[idx].nesting === 1 ? '<div class="gh-container gh-container-danger">' : "</div>\n",
})

/**
 * 渲染 Markdown 内容
 * @param content 原始内容
 * @param highlightVariables 是否高亮变量占位符
 * @returns 渲染后的 HTML
 */
export const renderMarkdown = (content: string, highlightVariables = true): string => {
  if (!content) return ""

  let html = md.render(content)

  // 高亮变量占位符 {{varName}}
  if (highlightVariables) {
    html = html.replace(/\{\{(\w+)\}\}/g, '<span class="gh-variable-highlight">{{$1}}</span>')
  }

  // 在代码块中添加复制按钮（使用 data 属性标记，SVG 图标由组件初始化）
  html = html.replace(
    /<pre><code/g,
    '<pre><button class="gh-code-copy-btn" data-copy-code="true"></button><code',
  )

  return html
}

/**
 * 获取 highlight.js 主题样式
 * 返回 GitHub Dark 风格的样式
 */
export const getHighlightStyles = (): string => `
/* highlight.js GitHub Dark 主题 */
.hljs {
  background: var(--gh-bg-tertiary, #1e1e1e);
  color: var(--gh-text, #e6edf3);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  /* 代码块自动换行 */
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
}
.hljs-comment,
.hljs-quote { color: #8b949e; font-style: italic; }
.hljs-keyword,
.hljs-selector-tag { color: #ff7b72; }
.hljs-string,
.hljs-doctag { color: #a5d6ff; }
.hljs-number,
.hljs-literal { color: #79c0ff; }
.hljs-title,
.hljs-section,
.hljs-selector-id { color: #d2a8ff; font-weight: bold; }
.hljs-function > .hljs-title { color: #d2a8ff; }
.hljs-type,
.hljs-class .hljs-title { color: #7ee787; }
.hljs-attribute { color: #79c0ff; }
.hljs-variable,
.hljs-template-variable { color: #ffa657; }
.hljs-built_in { color: #ffa657; }
.hljs-addition { color: #aff5b4; background: rgba(46, 160, 67, 0.15); }
.hljs-deletion { color: #ffdcd7; background: rgba(248, 81, 73, 0.15); }

/* 变量占位符高亮 */
.gh-variable-highlight {
  background: rgba(56, 139, 253, 0.2);
  color: #58a6ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

/* Markdown 渲染样式 */
.gh-markdown-preview {
  line-height: 1.6;
  color: var(--gh-text, #e6edf3);
}
.gh-markdown-preview h1,
.gh-markdown-preview h2,
.gh-markdown-preview h3 {
  margin: 16px 0 8px;
  font-weight: 600;
  border-bottom: 1px solid var(--gh-border, #30363d);
  padding-bottom: 4px;
}
.gh-markdown-preview h1 { font-size: 1.5em; }
.gh-markdown-preview h2 { font-size: 1.3em; }
.gh-markdown-preview h3 { font-size: 1.1em; }
.gh-markdown-preview p { margin: 8px 0; }
.gh-markdown-preview code:not(.hljs) {
  background: var(--gh-bg-tertiary, #343942);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.gh-markdown-preview pre {
  margin: 12px 0;
  position: relative;
  max-width: 100%;
  overflow: hidden;
}
.gh-markdown-preview pre code {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
}
/* 代码块复制按钮 */
.gh-code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: var(--gh-bg-secondary, #2d333b);
  border: 1px solid var(--gh-border, #444c56);
  border-radius: 4px;
  color: var(--gh-text-secondary, #8b949e);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}
.gh-markdown-preview pre:hover .gh-code-copy-btn {
  opacity: 1;
}
.gh-code-copy-btn:hover {
  background: var(--gh-hover, #373e47);
  color: var(--gh-text, #e6edf3);
}
.gh-markdown-preview blockquote {
  border-left: 3px solid var(--gh-primary, #4285f4);
  margin: 12px 0;
  padding: 8px 16px;
  background: var(--gh-bg-secondary, #161b22);
  color: var(--gh-text-secondary, #8b949e);
}
.gh-markdown-preview ul,
.gh-markdown-preview ol {
  margin: 8px 0;
  padding-left: 24px;
}
.gh-markdown-preview li { margin: 4px 0; }
.gh-markdown-preview a {
  color: var(--gh-primary, #58a6ff);
  text-decoration: none;
}
.gh-markdown-preview a:hover { text-decoration: underline; }

/* 任务列表样式 */
.gh-markdown-preview .task-list-item {
  list-style: none;
  margin-left: -20px;
}
.gh-markdown-preview .task-list-item input[type="checkbox"] {
  margin-right: 8px;
  pointer-events: none;
}

/* 高亮 ==text== */
.gh-markdown-preview mark {
  background: rgba(255, 235, 59, 0.4);
  color: inherit;
  padding: 2px 4px;
  border-radius: 3px;
}

/* 容器样式 :::info, :::warning, :::danger */
.gh-container {
  margin: 12px 0;
  padding: 12px 16px;
  border-radius: 6px;
  border-left: 4px solid;
}
.gh-container-info {
  background: rgba(56, 139, 253, 0.1);
  border-color: #388bfd;
}
.gh-container-warning {
  background: rgba(255, 166, 87, 0.1);
  border-color: #ffa657;
}
.gh-container-danger {
  background: rgba(248, 81, 73, 0.1);
  border-color: #f85149;
}
`
