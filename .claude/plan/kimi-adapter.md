# 实施计划：Kimi 适配器 (www.kimi.com)

## 任务类型
- [x] 前端
- [ ] 后端
- [x] 全栈（涉及配置文件修改）

## 技术方案

为 Kimi (www.kimi.com) 创建 `KimiAdapter`，继承 `SiteAdapter` 基类。Kimi 是月之暗面开发的 AI 对话产品，使用 Vue 3 框架 + Lexical 富文本编辑器。

### 核心技术决策

| 决策项 | 方案 | 理由 |
|--------|------|------|
| 编辑器交互 | execCommand 优先，ClipboardEvent paste 兜底 | Lexical 编辑器与 ChatGPT 的 contenteditable 类似，execCommand 兼容性好；如失败则用 paste 事件（豆包 Slate.js 验证过的策略） |
| 会话列表选择器 | `a.chat-info-item` | 语义化 class 名，稳定；不依赖 `data-v-*` 属性 |
| Active 会话检测 | `.router-link-active` class | Vue Router 原生机制，高稳定性 |
| 置顶检测 | `svg.pinned` 或 `.pinned` class | 比图标数量判断更可靠 |
| 用户身份 (cid) | `__tea_cache_tokens_*` → `user_unique_id` | 与 DeepSeek 相同的火山引擎 SDK 数据源 |
| 生成状态 | `.send-button-container.stop` | README 明确指出 stop class 为生成态标识 |
| 主题切换 | `<html class>` + `localStorage.CUSTOM_THEME` | 与 ChatGPT 策略类似，直改 HTML class |
| Markdown 容器 | `.markdown-container > .markdown` | 稳定的语义化 class |
| 滚动容器 | `.chat-detail-content` | 对话内容区域的直接滚动父级 |

### DOM 结构映射

```
页面结构:
div#app > div.app.has-sidebar
├── div.sidebar-placeholder          ← 侧边栏
│   ├── a.new-chat-btn               ← 新建对话
│   └── div.history-part             ← 历史会话列表
│       └── a.chat-info-item         ← 单条会话
│           ├── .chat-info > span.chat-name  ← 标题
│           └── .more-btn            ← 更多操作
└── div.main > div.layout-content-main
    └── div.chat-detail-content      ← 滚动容器
        └── div.chat-content-list    ← 消息列表
            ├── .chat-content-item-user      ← 用户消息轮次
            │   └── .segment-user > .segment-content-box ← 文本
            └── .chat-content-item-assistant  ← AI回复轮次
                └── .segment-assistant > .markdown-container > .markdown ← Markdown
```

## 实施步骤

### Step 1: 添加 SITE_IDS 常量
- **文件**: `src/constants/defaults.ts`
- **操作**: 在 `SITE_IDS` 对象中添加 `KIMI: "kimi"`
- **预期产物**: SITE_IDS 包含 `KIMI` 键

### Step 2: 创建 KimiAdapter 适配器文件
- **文件**: `src/adapters/kimi.ts` (新建)
- **操作**: 实现完整的 `KimiAdapter` 类
- **预期产物**: 完整的适配器实现

#### 2.1 基础信息方法
```pseudo
match(): hostname === "www.kimi.com"
getSiteId(): SITE_IDS.KIMI
getName(): "Kimi"
getThemeColors(): { primary: "#7C3AED", secondary: "#6D28D9" }  // Kimi 紫色调
getNewTabUrl(): "https://www.kimi.com/"
```

#### 2.2 会话 ID 与路由
```pseudo
getSessionId():
  匹配 /chat/([a-z0-9-]+)
  排除 /docs/, /website/, /table/ 等非 chat 路由

isNewConversation():
  path === "/" 或 path === ""

isSharePage():
  path.startsWith("/kimiplus/")  // Kimi 分享链接格式待确认
```

#### 2.3 用户身份 (getCurrentCid)
```pseudo
getCurrentCid():
  遍历 localStorage 查找 __tea_cache_tokens_* 键
  解析 JSON 获取 user_unique_id
  与 DeepSeek 适配器逻辑一致
```

#### 2.4 会话列表管理
```pseudo
getConversationList():
  选择 .history-part a.chat-info-item
  href 提取会话 ID（绝对 URL 或相对路径 /chat/{id}）
  标题从 span.chat-name 获取
  active 检测 .router-link-active 或 .router-link-exact-active
  置顶检测 svg.pinned 存在性

getConversationObserverConfig():
  selector: "a.chat-info-item"
  shadow: false
  extractInfo: 与 getConversationList 逻辑一致
  getTitleElement: el.querySelector("span.chat-name")

getSidebarScrollContainer():
  查找 .history-part 或其最近的可滚动父级

navigateToConversation():
  查找 a.chat-info-item[href*="/chat/{id}"] 并 click
  降级: super.navigateToConversation
```

#### 2.5 输入框交互
```pseudo
getTextareaSelectors():
  ['.chat-input-editor[data-lexical-editor="true"]',
   '.chat-input-editor[contenteditable="true"]',
   '[role="textbox"].chat-input-editor']

insertPrompt(content):
  editor.focus()
  selectAll + execCommand("insertText", false, content)
  如失败 → paste 事件兜底（与豆包 Slate.js 策略相同）

clearTextarea():
  editor.focus()
  selectAll + execCommand("delete")
  如失败 → editor.textContent = ""; dispatch input event

isValidTextarea(element):
  排除 .gh-main-panel
  检查 element.isContentEditable 且 element.closest(".chat-input-editor-container")

getSubmitButtonSelectors():
  ['.send-button-container:not(.disabled):not(.stop)']

findSubmitButton():
  在 .chat-editor 范围内查找 .send-button-container
```

#### 2.6 滚动容器
```pseudo
getScrollContainer():
  优先: .chat-detail-content（检查 scrollHeight > clientHeight）
  回退: .chat-content-container 向上查找可滚动父级
  再回退: super.getScrollContainer()

getResponseContainerSelector():
  ".chat-content-list"

getChatContentSelectors():
  ['.segment-assistant .markdown',
   '.segment-user .segment-content-box']
```

#### 2.7 大纲提取
```pseudo
extractOutline(maxLevel, includeUserQueries, showWordCount):
  container = querySelector(".chat-content-list")

  遍历 .chat-content-item：
    if .chat-content-item-user && includeUserQueries:
      提取 .segment-content-box 文本
      push {level: 0, isUserQuery: true, ...}

    if .chat-content-item-assistant:
      markdown = querySelector(".markdown")
      遍历 h1-h6 标题
      push {level, text, element, ...}

  如果需要 wordCount:
    用 calculateRangeWordCount 计算
```

#### 2.8 用户消息处理
```pseudo
getUserQuerySelector():
  ".segment.segment-user"

extractUserQueryText(element):
  contentBox = element.querySelector(".segment-content-box")
  return extractTextWithLineBreaks(contentBox || element)

replaceUserQueryContent(element, html):
  contentBox = element.querySelector(".segment-content-box")
  隐藏 contentBox
  在其后插入 .gh-user-query-markdown 渲染容器
```

#### 2.9 导出配置
```pseudo
getExportConfig():
  userQuerySelector: ".segment.segment-user"
  assistantResponseSelector: ".segment-assistant .markdown"
  turnSelector: null  // 用户和 AI 消息是平级兄弟
  useShadowDOM: false
```

#### 2.10 生成状态检测
```pseudo
isGenerating():
  检查 .send-button-container.stop 是否存在且可见
  或检查 svg[name="stop"] 在 .send-button-container 内

getModelName():
  el = querySelector(".current-model .model-name .name")
  return el?.textContent?.trim()

getNetworkMonitorConfig():
  urlPatterns: ["chat/completion", "api/chat"]  // 需实际验证
  silenceThreshold: 2000
```

#### 2.11 主题切换
```pseudo
toggleTheme(targetMode):
  localStorage.setItem("CUSTOM_THEME", targetMode)
  document.documentElement.className = targetMode
  dispatch StorageEvent
```

#### 2.12 其他方法
```pseudo
getSessionName():
  title = document.title
  if title !== "Kimi": return title.replace(" - Kimi", "").trim()

getConversationTitle():
  优先: .chat-header-content h2 文本
  回退: 侧边栏 a.router-link-active span.chat-name 文本

getNewChatButtonSelectors():
  ['a.new-chat-btn', 'a.new-chat-btn[href="/"]', 'a.new-chat-btn[href="https://www.kimi.com/"]']

getWidthSelectors():
  [{selector: ".chat-content-container", property: "max-width"}]

getMarkdownFixerConfig():
  selector: ".segment-assistant .markdown p"
  fixSpanContent: false
  shouldSkip: 生成中时跳过最后一个 .segment-assistant
```

### Step 3: 注册适配器
- **文件**: `src/adapters/index.ts`
- **操作**:
  1. 导入 `KimiAdapter`
  2. 在 `adapters` 数组中添加 `new KimiAdapter()`
- **预期产物**: Kimi 适配器在工厂中注册

### Step 4: 更新 Content Script URL 匹配
- **文件**: `src/contents/ui-entry.tsx`
- **操作**: 在 `matches` 数组中添加 `"https://www.kimi.com/*"`
- **预期产物**: Content Script 在 Kimi 页面自动注入

### Step 5: 更新油猴脚本 URL 匹配
- **文件**: `vite.userscript.config.ts`
- **操作**: 在 `match` 数组中添加 `"https://www.kimi.com/*"`
- **预期产物**: 油猴脚本在 Kimi 页面自动运行

### Step 6: 更新 Host Permissions
- **文件**: `package.json`
- **操作**: 在 `host_permissions` 数组中添加 `"https://www.kimi.com/*"`
- **预期产物**: 浏览器扩展有权限访问 Kimi 域名

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/constants/defaults.ts` | 修改 | 添加 `KIMI` 到 `SITE_IDS` |
| `src/adapters/kimi.ts` | 新建 | KimiAdapter 完整实现 |
| `src/adapters/index.ts` | 修改 | 注册 KimiAdapter |
| `src/contents/ui-entry.tsx` | 修改 | 添加 Kimi URL 匹配 |
| `vite.userscript.config.ts` | 修改 | 添加 Kimi URL 匹配 |
| `package.json` | 修改 | 添加 host_permissions |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Lexical 编辑器 execCommand 可能不生效 | 准备 ClipboardEvent paste 兜底方案（豆包已验证） |
| Kimi DOM 结构可能版本迭代变化 | 使用语义化 class 选择器（.segment-user, .markdown），避免依赖 data-v-* |
| 会话 href 可能是绝对 URL 而非相对路径 | 同时处理两种格式，用 new URL() 规范化 |
| .send-button-container.stop 的 class 可能变化 | 增加 SVG name="stop" 属性检测作为备选 |
| 用户消息内可能包含图片/文件等非文本内容 | 大纲提取和文本提取时安全处理，仅提取文本节点 |
| 侧边栏可能需要滚动加载更多会话 | 实现 loadAllConversations 滚动加载逻辑 |

## SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: (不可用 - API key 配置问题)
- GEMINI_SESSION: (不可用 - 模型不存在)

## 备注

1. **不实现删除功能**：首版不实现 `deleteConversationOnSite`，因为需要实际环境中抓取 Kimi 的删除 API 端点和 token 获取逻辑
2. **模型锁定**：首版不实现 `getModelSwitcherConfig`，因为 Kimi 的模型选择菜单交互细节需要实际验证
3. **网络监控**：`getNetworkMonitorConfig` 的 urlPatterns 需要在实际环境中通过 DevTools 验证 Kimi 的 API 端点
