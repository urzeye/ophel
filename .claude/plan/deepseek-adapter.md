# 实施计划：DeepSeek 适配器

## 📋 任务类型

- [x] 前端
- [x] 后端（配置注册）
- [x] 全栈

## 技术方案

### 综合分析结论

**核心策略：分层选择器 + 能力分级上线**

DeepSeek 使用 CSS Modules 哈希类名（如 `_546d736`, `fbb737a4`），这些类名在不同构建版本间不稳定。但 DeepSeek Design System 提供了稳定的语义类名前缀 `ds-*`（如 `ds-message`, `ds-markdown`, `ds-icon-button`）。

**选择器优先级策略**：

1. **最优先**：`ds-*` 语义类名（稳定）
2. **次优先**：DOM 结构关系（`a[href*="/a/chat/s/"]`）
3. **兜底**：哈希类名 + 结构验证组合，尽量不要用这种方案，完全不稳定

**与 ChatGPT 的关键差异**：

| 维度 | ChatGPT | DeepSeek |
|------|---------|----------|
| 消息角色标识 | `data-message-author-role` 属性 | 结构差异（用户有 `fbb737a4` 内容 vs AI 有 `ds-markdown`） |
| 输入框 | contenteditable div | 标准 `<textarea>` |
| 模型选择 | 下拉菜单 | 切换按钮（深度思考/搜索） |
| 会话路由 | `/c/{uuid}` | `/a/chat/s/{uuid}` |
| 发送按钮 | `<button>` | `<div role="button">` |
| 主题切换 | `localStorage.theme` + `html.className` | `localStorage.__appKit_@deepseek/chat_themePreference` + JSON |
| 停止按钮 | `data-testid="stop-button"` | 同一 `ds-icon-button` 容器，SVG 变为实心方块 |

---

## 实施步骤

### 步骤 1：注册站点 ID 和配置（P0）

**文件**：`src/constants/defaults.ts`

在 `SITE_IDS` 常量中添加：

```typescript
DEEPSEEK: "deepseek",
```

---

### 步骤 2：创建 DeepSeek 适配器文件（P0）

**文件**：`src/adapters/deepseek.ts`（新建）

参考 ChatGPT 适配器结构，实现以下方法：

#### 2.1 站点识别（必须实现）

```typescript
// match(): 匹配 chat.deepseek.com
match(): boolean {
  return window.location.hostname === "chat.deepseek.com"
}

getSiteId(): string { return SITE_IDS.DEEPSEEK }
getName(): string { return "DeepSeek" }
getThemeColors(): { primary: "#4b6bfe", secondary: "#3a5ae0" } // DeepSeek 品牌蓝
```

#### 2.2 会话路由与用户标识

```typescript
// URL 格式: /a/chat/s/{uuid}
const CHAT_PATH_PATTERN = /\/a\/chat\/s\/([a-f0-9-]+)/

getSessionId(): string {
  const match = window.location.pathname.match(CHAT_PATH_PATTERN)
  return match ? match[1] : ""
}

isNewConversation(): boolean {
  // DeepSeek 新对话是 https://chat.deepseek.com
  const path = window.location.pathname
  return path === "/a/chat" || path === "/a/chat/" || !CHAT_PATH_PATTERN.test(path)
}

getNewTabUrl(): string { return "https://chat.deepseek.com/" }

/**
 * 获取当前用户唯一标识（用于会话隔离）
 *
 * DeepSeek 在 localStorage 中存储用户信息：
 * - Key: `__tea_cache_tokens_` 前缀（后缀数字可能变化，用前缀匹配）
 * - Value: JSON 含 user_unique_id 字段
 *
 * 示例: __tea_cache_tokens_20006317 → {"user_unique_id":"4fa8ffdb-...","web_id":"..."}
 */
getCurrentCid(): string | null {
  try {
    // 使用前缀匹配，避免依赖不稳定的数字后缀
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith("__tea_cache_tokens_")) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const data = JSON.parse(raw) as Record<string, unknown>
        const uid = data?.user_unique_id
        if (typeof uid === "string" && uid) return uid
      }
    }
  } catch {
    // 静默处理解析错误
  }
  return null
}
```

#### 2.3 输入框操作

```typescript
getTextareaSelectors(): string[] {
  return [
    'textarea[placeholder*="DeepSeek"]',  // 稳定 - placeholder 含品牌名
    'textarea[placeholder*="deepseek"]',
    'textarea.ds-scroll-area',            // 半稳定 - ds-* 前缀
  ]
}

// DeepSeek 使用标准 textarea，insertPrompt 比 ChatGPT 简单
insertPrompt(content: string): boolean {
  const el = this.getTextareaElement() as HTMLTextAreaElement | null
  if (!el || !el.isConnected) return false
  el.focus()
  // React controlled component - 通过 prototype setter 绕过
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  if (setter) setter.call(el, content)
  else el.value = content
  el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: content }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  return true
}

clearTextarea(): void {
  // 类似 insertPrompt 但清空
}

getSubmitButtonSelectors(): string[] {
  return [
    'div[role="button"].ds-icon-button:not(.ds-icon-button--disabled)',
    // 需要结合输入区域位置进一步约束，避免误触其他 icon button
  ]
}
```

#### 2.4 会话管理

```typescript
// 选择器策略：通过 href 匹配，不依赖哈希类名
getConversationList(): ConversationInfo[] {
  const links = document.querySelectorAll('a[href*="/a/chat/s/"]')
  // 从每个链接提取 id、title、isActive
  // title: 查找内部第一个非空文本容器
  // isActive: 通过当前 URL 匹配或 aria-current 属性
}

getConversationObserverConfig(): ConversationObserverConfig {
  return {
    selector: 'a[href*="/a/chat/s/"]',
    shadow: false,
    extractInfo: (el) => { /* 提取 id/title/isActive */ },
    getTitleElement: (el) => { /* 返回标题容器 */ },
  }
}

navigateToConversation(id: string, url?: string): boolean {
  const link = document.querySelector(`a[href*="/a/chat/s/${id}"]`) as HTMLElement | null
  if (link) { link.click(); return true }
  return super.navigateToConversation(id, url)
}

getSidebarScrollContainer(): Element | null {
  // 查找侧边栏区域的 .ds-scroll-area
  // 策略：找包含会话链接的最近 .ds-scroll-area 祖先
  const firstLink = document.querySelector('a[href*="/a/chat/s/"]')
  return firstLink?.closest('.ds-scroll-area') || null
}
```

#### 2.5 大纲提取

```typescript
// 关键选择器
getUserQuerySelector(): string {
  // 用户消息特征：ds-message 内部 **没有** ds-markdown，但有纯文本容器
  // 策略：使用结构差异而非哈希类名
  return '.ds-message:has(> :not(.ds-markdown))'
  // 备选：如果 :has() 不够精确，可能需要在 extractOutline 中手动区分
}

getResponseContainerSelector(): string {
  // 消息列表容器 - 向上查找包含所有消息的容器
  return '.ds-scroll-area'  // 需要更精确
}

getChatContentSelectors(): string[] {
  return ['.ds-markdown', '.ds-message']
}

extractOutline(): OutlineItem[] {
  // 在 .ds-markdown 容器内查找 h1~h6
  // 用户提问：识别 .ds-message 中不含 .ds-markdown 的（即纯文本消息）
  // 参考 ChatGPT 的实现模式
}
```

#### 2.6 滚动容器

```typescript
getScrollContainer(): HTMLElement | null {
  // 策略1：找包含 .ds-message 的最近 .ds-scroll-area
  const msg = document.querySelector('.ds-message')
  if (msg) {
    const scrollArea = msg.closest('.ds-scroll-area') as HTMLElement
    if (scrollArea && scrollArea.scrollHeight > scrollArea.clientHeight) {
      return scrollArea
    }
  }
  // 策略2：遍历所有 .ds-scroll-area 找最大可滚动的
  // 排除侧边栏和输入框
}
```

#### 2.7 生成状态检测

```typescript
isGenerating(): boolean {
  // DeepSeek 生成时，发送按钮区域变为 stop 按钮
  // stop 按钮特征：._7436101.ds-icon-button 内的 SVG 是实心方块（圆角矩形 path）
  // 关键判定：输入区域附近的 ds-icon-button 且 aria-disabled="false"
  // 且内部 SVG path 的 d 属性以 "M2 4.88" 开头（stop 图标的特征路径）
  //
  // 策略：查找输入区域附近的 ds-icon-button，检查其 SVG path
  // stop 按钮 SVG path 特征："M2 4.88C2 3.68009..."（实心方块）
  // send 按钮 SVG 是上箭头，path 不同
  //
  // 更简单的判断方式：
  // 1. 生成时 stop 按钮外层有 <div style="width: fit-content;">
  // 2. stop 按钮的 SVG 只有一个 <path> 且使用 fill="currentColor"（实心图标）
  //    而 send 按钮的 SVG 是线条图标

  // 实现：在输入区附近查找 ds-icon-button[aria-disabled="false"]
  // 并检查其内部 SVG path 是否为 stop 图标特征
  const inputArea = document.querySelector('textarea.ds-scroll-area')
  if (!inputArea) return false
  const container = inputArea.closest('div') // 输入区容器
  // 向上查找输入区域的父容器，在其中搜索 stop 按钮
  const buttons = document.querySelectorAll(
    '.ds-icon-button[aria-disabled="false"]'
  )
  for (const btn of buttons) {
    const path = btn.querySelector('svg path')
    if (path) {
      const d = path.getAttribute('d') || ''
      // stop 按钮的 SVG path 以 "M2 4.88" 开头
      if (d.startsWith('M2 4.88')) return true
    }
  }
  return false
}

getModelName(): string | null {
  // DeepSeek 没有传统模型选择器
  // 可返回当前激活的模式："DeepSeek" / "DeepSeek (深度思考)" / "DeepSeek (搜索)"
  const selected = document.querySelector('.ds-toggle-button--selected')
  if (selected) {
    const text = selected.textContent?.trim()
    if (text) return `DeepSeek (${text})`
  }
  return "DeepSeek"
}
```

#### 2.8 宽度控制 & 其他

```typescript
getWidthSelectors() {
  // 参考 html style 中的 --message-area-width CSS 变量
  return [
    { selector: ':root', property: '--message-area-width' },
  ]
}

getExportConfig(): ExportConfig {
  return {
    userQuerySelector: '<用户消息选择器>',
    assistantResponseSelector: '.ds-markdown',
    turnSelector: null,  // DeepSeek 可能没有 turn 容器
    useShadowDOM: false,
  }
}

getSessionName(): string | null {
  // 从页面标题获取，或从顶栏可编辑标题获取
  const title = document.title
  if (title && title !== "DeepSeek") {
    return title.replace(/ - DeepSeek$/, "").trim()
  }
  return null
}

getConversationTitle(): string | null {
  // 从侧边栏当前活跃项获取标题
}
```

---

### 步骤 3：注册适配器（P0）

**文件**：`src/adapters/index.ts`

```diff
+ import { DeepSeekAdapter } from "./deepseek"

const adapters: SiteAdapter[] = [
  new GeminiEnterpriseAdapter(),
  new GeminiAdapter(),
  new ChatGPTAdapter(),
  new GrokAdapter(),
  new AIStudioAdapter(),
  new ClaudeAdapter(),
  new DoubaoAdapter(),
+ new DeepSeekAdapter(),
]
```

---

### 步骤 4：更新 URL 白名单（P0）

需要在以下 **7 个位置** 添加 `https://chat.deepseek.com/*`：

| 文件 | 位置说明 |
|------|----------|
| `src/contents/main.ts` | Content Script matches 数组 |
| `src/contents/ui-entry.tsx` | UI 入口 matches 数组 |
| `src/contents/monitor-entry.ts` | 监控入口 matches 数组 |
| `src/contents/scroll-lock-main.ts` | 滚动锁定入口 matches（**Codex 发现的遗漏点**） |
| `src/background.ts` | Background SW URL 列表（两处） |
| `package.json` | manifest host_permissions |
| `vite.userscript.config.ts` | 油猴脚本 match 数组 |

---

### 步骤 5：更新存储配置（P1）

**文件**：`src/utils/storage.ts`

1. 在 `SiteId` 类型中添加 `"deepseek"`
2. 在 `DEFAULT_SETTINGS.layout.sites` 添加 `deepseek: { ...DEFAULT_SITE_THEME }`
3. 在 `pageWidth`、`userQueryWidth`、`zenMode` 等 sites 配置中添加 deepseek 条目

---

### 步骤 6：主题切换（P1 - 机制已确认）

**文件**：`src/adapters/deepseek.ts` 内的 `toggleTheme()` 方法

DeepSeek 主题存储在 `localStorage`：
- **Key**: `__appKit_@deepseek/chat_themePreference`
- **Value**: `{"value":"dark"|"light"|"system","__version":"0"}`

```typescript
async toggleTheme(targetMode: "light" | "dark"): Promise<boolean> {
  try {
    // 1. 更新 localStorage
    const themeData = JSON.stringify({ value: targetMode, __version: "0" })
    localStorage.setItem("__appKit_@deepseek/chat_themePreference", themeData)

    // 2. 触发页面主题更新
    window.dispatchEvent(new StorageEvent("storage", {
      key: "__appKit_@deepseek/chat_themePreference",
      newValue: themeData,
      storageArea: localStorage,
    }))

    // 3. 如果 storage 事件不够，尝试切换 html class (Tailwind 暗色模式)
    if (targetMode === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }

    return true
  } catch (error) {
    console.error("[DeepSeekAdapter] toggleTheme error:", error)
    return false
  }
}
```

---

### 步骤 7：可选增强（P2）

- 模型锁定：DeepSeek 的"深度思考"切换可作为类似功能
- Markdown 修复器：检查 `.ds-markdown p` 是否需要修复
- Zen 模式：隐藏侧边栏的选择器
- 删除会话 API：探索 DeepSeek 是否有可用的 API

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/adapters/deepseek.ts` | 新建 | DeepSeek 适配器主文件 |
| `src/adapters/index.ts:17` | 修改 | 注册适配器 |
| `src/constants/defaults.ts:84-92` | 修改 | 添加 DEEPSEEK SITE_ID |
| `src/utils/storage.ts:40,336-365` | 修改 | 添加站点类型和默认配置 |
| `src/contents/main.ts:38-47` | 修改 | 添加 URL 匹配 |
| `src/contents/ui-entry.tsx:10-19` | 修改 | 添加 URL 匹配 |
| `src/contents/monitor-entry.ts:6-15` | 修改 | 添加 URL 匹配 |
| `src/contents/scroll-lock-main.ts` | 修改 | 添加 URL 匹配 |
| `src/background.ts:362-404` | 修改 | 添加 URL 匹配（两处） |
| `package.json:107-112` | 修改 | 添加 host_permissions |
| `vite.userscript.config.ts:97-106` | 修改 | 添加油猴脚本 match |

## 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| CSS Modules 哈希类名变化 | 高 | 优先使用 `ds-*` 语义类名和 `href` 结构匹配；哈希类仅作兜底 |
| 用户/AI 消息区分不准确 | 高 | 使用 `.ds-markdown` 存在性区分：有=AI回复，无=用户消息 |
| `isGenerating()` SVG path 匹配脆弱 | 中 | stop 按钮 SVG path 以 `M2 4.88` 开头（已确认），可增加兜底：检查按钮内 SVG 是否为实心填充 |
| 发送按钮误触 | 中 | 限定在输入区域附近查找 `ds-icon-button` |
| Cloudflare 验证层干扰初始化 | 中 | `#cf-overlay` 的 display 检测，延迟初始化 |
| DeepSeek 未来改版 | 中 | 分层选择器策略确保单层失效时有兜底 |

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: 019cc253-2c11-7eb1-bb90-26bd6cc97d63
- GEMINI_SESSION: N/A（模型不可用）
