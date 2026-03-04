# 实施计划：豆包 (Doubao) 站点适配器

## 任务类型

- [x] 前端
- [x] 后端（适配器逻辑）
- [x] 全栈

## 技术方案

采用 **方案B（完整适配）**：实现全部 7 个必选抽象方法 + 核心可选方法（会话列表、大纲提取、导出、滚动、导航等），一次到位达到与现有 Gemini/ChatGPT 适配器一致的功能体验。

### 核心决策

| 决策点 | 方案 | 理由 |
|--------|------|------|
| 选择器策略 | 优先 `data-testid`，`id` 属性次之，class 前缀匹配兜底 | CSS Modules 哈希后缀不稳定 |
| 主题模式 | 强制 light-only，`toggleTheme()` 返回 `false` | 豆包不支持深色模式 |
| 站点独立配置 | 扩展 `SiteId` 添加 `"doubao"`，独立存储主题/页面宽度/用户问题宽度/禅模式 | 豆包需要独立的设置表现，不与其他站点共享 `_default` |
| 输入框事件 | React controlled component 兼容写法（prototype setter + InputEvent） | Semi Design textarea 需要绕过 React 虚拟 DOM |

## 实施步骤

### Step 1：新增 SITE_IDS 常量

**文件**：`src/constants/defaults.ts`

```ts
export const SITE_IDS = {
  CLAUDE: "claude",
  GEMINI: "gemini",
  CHATGPT: "chatgpt",
  GEMINI_ENTERPRISE: "gemini-enterprise",
  GROK: "grok",
  AISTUDIO: "aistudio",
  DOUBAO: "doubao",  // ← 新增
} as const
```

### Step 2：创建适配器文件

**文件**：`src/adapters/doubao.ts`（新建）

#### 2.1 必选方法

```ts
import { SITE_IDS } from "~constants"
import { SiteAdapter, type OutlineItem, type ConversationInfo, type ExportConfig, type ConversationObserverConfig } from "./base"

export class DoubaoAdapter extends SiteAdapter {
  // ===== 必选抽象方法 =====

  match(): boolean {
    return window.location.hostname === "www.doubao.com"
  }

  getSiteId(): string {
    return SITE_IDS.DOUBAO
  }

  getName(): string {
    return "豆包"
  }

  getThemeColors(): { primary: string; secondary: string } {
    return { primary: "#315efb", secondary: "#0f6eff" }
  }

  getTextareaSelectors(): string[] {
    return [
      'textarea[data-testid="chat_input_input"]',
      "textarea.semi-input-textarea",
    ]
  }

  insertPrompt(content: string): boolean {
    const el = this.getTextareaElement() as HTMLTextAreaElement | null
    if (!el || !el.isConnected) return false
    el.focus()
    // React controlled component：必须通过 prototype setter 绕过
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype, "value"
    )?.set
    if (setter) {
      setter.call(el, content)
    } else {
      el.value = content
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: content }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    el.setSelectionRange(content.length, content.length)
    return true
  }

  getConversationTitle(): string | null {
    // 优先从侧边栏激活会话获取标题
    const activeItem = document.querySelector(
      '#chat_list_wrapper a[class*="active-"]'
    )
    if (activeItem) {
      const title = activeItem.querySelector(
        '#chat_list_item_title, [class^="section-item-title-"]'
      )
      if (title?.textContent?.trim()) return title.textContent.trim()
    }
    return null
  }
}
```

#### 2.2 会话与路由方法

```ts
  getSessionId(): string {
    const m = window.location.pathname.match(/^\/chat\/(\d+)/)
    return m ? m[1] : ""
  }

  isNewConversation(): boolean {
    return /^\/chat\/?$/.test(window.location.pathname)
  }

  getNewTabUrl(): string {
    return "https://www.doubao.com/chat/"
  }

  supportsNewTab(): boolean {
    return true
  }
```

#### 2.3 会话列表方法

```ts
  getConversationList(): ConversationInfo[] {
    const wrapper = document.querySelector("#chat_list_wrapper")
    if (!wrapper) return []
    const items = wrapper.querySelectorAll('[id="chat_list_thread_item"]')
    const conversations: ConversationInfo[] = []

    items.forEach((item) => {
      const link = item.closest("a")
      const href = link?.getAttribute("href") || ""
      const idMatch = href.match(/\/chat\/(\d+)/)
      if (!idMatch) return

      const title = item.querySelector(
        '#chat_list_item_title, [class^="section-item-title-"]'
      )?.textContent?.trim() || ""

      const isActive = link?.className?.includes("active-") ?? false
      const isPinned = !!item.querySelector('[id="chat_list_item_pin_icon"], [class^="pin-"]')

      conversations.push({
        id: idMatch[1],
        title,
        url: `https://www.doubao.com/chat/${idMatch[1]}`,
        isActive,
        isPinned,
      })
    })

    return conversations
  }

  navigateToConversation(id: string, url?: string): boolean {
    const link = document.querySelector(
      `#chat_list_wrapper a[href*="/chat/${id}"]`
    ) as HTMLElement | null
    if (link) {
      link.click()
      return true
    }
    if (url) {
      window.location.href = url
      return true
    }
    window.location.href = `https://www.doubao.com/chat/${id}`
    return true
  }

  getSidebarScrollContainer(): Element | null {
    return document.querySelector("#chat_list_wrapper")
  }

  getConversationObserverConfig(): ConversationObserverConfig | null {
    return {
      container: "#chat_list_wrapper",
      itemSelector: '[id="chat_list_thread_item"]',
      titleSelector: '#chat_list_item_title, [class^="section-item-title-"]',
      activeSelector: 'a[class*="active-"]',
    }
  }
```

#### 2.4 滚动与内容容器

```ts
  getScrollContainer(): HTMLElement | null {
    return document.querySelector('[data-testid="scroll_view"]') as HTMLElement | null
  }

  getResponseContainerSelector(): string {
    return '[data-testid="message-list"]'
  }

  getUserQuerySelector(): string | null {
    return '[data-testid="send_message"]'
  }

  getChatContentSelectors(): string[] {
    return [
      '[data-testid="receive_message"] .flow-markdown-body',
      '[data-testid="message_text_content"]',
    ]
  }
```

#### 2.5 大纲提取

```ts
  extractOutline(
    maxLevel = 6,
    includeUserQueries = false,
    showWordCount = false,
  ): OutlineItem[] {
    const items: OutlineItem[] = []
    const container = document.querySelector('[data-testid="message-list"]')
    if (!container) return items

    // 遍历所有消息块
    const messageBlocks = container.querySelectorAll('[data-testid="union_message"]')
    messageBlocks.forEach((block) => {
      // 用户提问
      if (includeUserQueries) {
        const userMsg = block.querySelector('[data-testid="send_message"]')
        if (userMsg) {
          const text = userMsg.querySelector('[data-testid="message_text_content"]')?.textContent?.trim() || ""
          if (text) {
            items.push({
              level: 0,
              text: text.length > 80 ? text.slice(0, 80) + "..." : text,
              element: userMsg,
              isUserQuery: true,
              isTruncated: text.length > 80,
              wordCount: showWordCount ? text.length : undefined,
            })
          }
        }
      }

      // AI 回复中的标题
      const aiMsg = block.querySelector('[data-testid="receive_message"]')
      if (!aiMsg) return
      const markdown = aiMsg.querySelector(".flow-markdown-body")
      if (!markdown) return

      const headings = markdown.querySelectorAll("h1, h2, h3, h4, h5, h6")
      headings.forEach((heading) => {
        const level = parseInt(heading.tagName[1], 10)
        if (level > maxLevel) return
        const text = heading.textContent?.trim() || ""
        if (!text) return
        items.push({
          level,
          text,
          element: heading,
          wordCount: showWordCount ? text.length : undefined,
        })
      })
    })

    return items
  }
```

#### 2.6 导出配置

```ts
  getExportConfig(): ExportConfig | null {
    return {
      userQuerySelector: '[data-testid="send_message"]',
      assistantResponseSelector: '[data-testid="receive_message"]',
      turnSelector: '[data-testid="union_message"]',
      useShadowDOM: false,
    }
  }
```

#### 2.7 主题与其他

```ts
  toggleTheme(): Promise<boolean> {
    // 豆包不支持深色模式
    return Promise.resolve(false)
  }

  getNewChatButtonSelectors(): string[] {
    return ["#create_conversation_button"]
  }

  getSubmitButtonSelectors(): string[] {
    return [
      "button.semi-button.semi-button-primary[class*='samantha-button-']",
      "button.semi-button.semi-button-primary[class*='action-btn-']",
    ]
  }

  getWidthSelectors(): Array<{ selector: string; property: string }> {
    return [
      { selector: '[data-container-name="main"]', property: "max-width" },
    ]
  }
```

### Step 3：注册适配器

**文件**：`src/adapters/index.ts`

```ts
import { DoubaoAdapter } from "./doubao"

const adapters: SiteAdapter[] = [
  new GeminiEnterpriseAdapter(),
  new GeminiAdapter(),
  new ChatGPTAdapter(),
  new GrokAdapter(),
  new AIStudioAdapter(),
  new ClaudeAdapter(),
  new DoubaoAdapter(),  // ← 新增，顺序无冲突
]
```

### Step 4：补齐所有 Content Script 的 matches

**关键发现**：项目有 **4 个** content script 文件需要同步添加豆包域名。

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/contents/main.ts` | L38-46 | 主逻辑入口 |
| `src/contents/ui-entry.tsx` | L10-18 | Shadow DOM UI 入口 |
| `src/contents/monitor-entry.ts` | L6-14 | 网络监控入口 |
| `src/contents/scroll-lock-main.ts` | L12-20 | 滚动锁定入口 |

每个文件的 `matches` 数组中添加：`"https://www.doubao.com/*"`

### Step 5：站点独立设置存储

豆包需要独立的页面宽度、主题、用户问题宽度等设置存储（不共享 `_default`），但无需专门的设置 UI 页面。

**文件**：`src/utils/storage.ts`

#### 5.1 扩展 SiteId 类型

```ts
// 原：
export type SiteId = "gemini" | "gemini-enterprise" | "aistudio" | "_default"
// 改为：
export type SiteId = "gemini" | "gemini-enterprise" | "aistudio" | "doubao" | "_default"
```

#### 5.2 在 DEFAULT_SETTINGS 中添加 doubao 配置

```ts
// theme.sites 中添加：
doubao: { mode: "light", lightStyleId: "google-gradient", darkStyleId: "classic-dark" },

// layout.pageWidth 中添加：
doubao: { enabled: false, value: "1280", unit: "px" },

// layout.userQueryWidth 中添加：
doubao: { enabled: false, value: "1280", unit: "px" },

// layout.zenMode 中添加：
doubao: { enabled: false },
```

**说明**：豆包主题设置中 `mode` 固定为 `"light"`，但仍需要独立存储以支持亮色主题预设的个性化选择。

### Step 6：主题管理器适配

**文件**：`src/core/theme-manager.ts`

在 `applySystemPreference()` 和 `detectThemePreference()` 的 switch 语句中添加 doubao case：

```ts
case SITE_IDS.DOUBAO:
  // 豆包不支持深色模式，强制 light
  break
```

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/adapters/doubao.ts` | 新建 | 豆包适配器完整实现 |
| `src/adapters/index.ts` | 修改 | 注册 DoubaoAdapter |
| `src/constants/defaults.ts:L84-91` | 修改 | SITE_IDS 添加 DOUBAO |
| `src/contents/main.ts:L38-46` | 修改 | matches 添加豆包域名 |
| `src/contents/ui-entry.tsx:L10-18` | 修改 | matches 添加豆包域名 |
| `src/contents/monitor-entry.ts:L6-14` | 修改 | matches 添加豆包域名 |
| `src/contents/scroll-lock-main.ts:L12-20` | 修改 | matches 添加豆包域名 |
| `src/utils/storage.ts:L40` | 修改 | SiteId 类型添加 `"doubao"` |
| `src/utils/storage.ts:L294-474` | 修改 | DEFAULT_SETTINGS 添加 doubao 独立配置 |
| `src/core/theme-manager.ts` | 修改 | 添加 doubao case 强制 light |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| CSS Modules 哈希后缀变化导致选择器失效 | 优先使用 `data-testid`/`id` 属性，class 仅作兜底 |
| Semi Design textarea 事件不触发 React 状态更新 | 使用 `HTMLTextAreaElement.prototype.value` setter + `InputEvent` |
| 遗漏某个 content script 的 matches | Step 4 已列出全部 4 个文件 |
| ThemeManager 误将豆包切到 dark 模式 | `toggleTheme()` 返回 `false` + 可选添加 ThemeManager 分支 |
| 豆包页面 SPA 路由切换未触发重新初始化 | 基类已有 URL 变化监听机制（`initUrlChangeObserver`） |

## 缺失信息（需要用户补充）

1. **豆包品牌色确认**：当前使用 `#315efb` 作为 primary 色，请确认是否准确
2. **是否需要支持 `doubao.com`（无 www 前缀）**：当前 `match()` 仅匹配 `www.doubao.com`
3. **`ConversationObserverConfig` 的完整字段**：基类中该接口的完整定义需要确认（`container`/`itemSelector`/`titleSelector`/`activeSelector` 是否是完整字段列表）
4. **是否需要实现 `deleteConversationOnSite()`**：豆包的会话删除 API 或 DOM 操作方式不明
5. **`ExportConfig` 接口完整字段**：需确认 `turnSelector`、`useShadowDOM` 是否是 `ExportConfig` 的实际字段
6. **豆包是否有生成状态指示器**：用于 `isGenerating()` 实现（如停止按钮、loading 动画的选择器）
7. **豆包是否支持模型锁定/切换**：技能栏 (Skill Bar) 是否等价于模型切换

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: 019cb70d-706c-7551-9c11-b822dd3e25e4
- GEMINI_SESSION: 不可用（Gemini CLI 模型错误）
