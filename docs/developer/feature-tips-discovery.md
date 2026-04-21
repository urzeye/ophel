# 功能技巧发现（Feature Tips Discovery）开发文档

## 背景

Ophel 功能丰富，但许多入口隐藏较深（如会话导出、快捷键操作、提示词队列等），用户难以自主发现。当前 header tooltip 轮换展示 6 个技巧，但触发方式（悬停标题）本身不易被注意。

本功能通过在全局搜索中新增 `tip:` 语法触发「功能技巧」模式，帮助用户快速发现隐藏功能。

---

## 功能设计

### 触发方式

在全局搜索输入框中输入 `tip:`（可追加关键词，如 `tip: 导出`）即进入功能技巧模式。

- 仅显示技巧列表，不显示对话/大纲/设置等其他结果
- `tip:` 本身不参与搜索，`tip:` 后的内容作为关键词过滤技巧条目
- 空 query `tip:` 时显示全部 11 条技巧

### 搜索结果展示

技巧条目的视觉与普通结果不同：

- 图标：💡（灯泡）
- 主标题：功能名称
- 副标题（breadcrumb）：访问路径描述（如 `会话 Tab → 长按多选 → 底部导出`）
- 快捷键徽标：显示当前平台 + 用户自定义的快捷键（若 shortcutIds 不为空）
  - 快捷键已禁用/未配置时不显示徽标

### 点击行为

| 条目类型                        | 点击后行为                                  |
| ------------------------------- | ------------------------------------------- |
| 有 `highlightTarget`（UI 可见） | 搜索关闭 → 目标元素闪烁高亮（2s）           |
| 仅快捷键（无 highlightTarget）  | 搜索关闭 → Toast 提示"按下 {shortcut} 试试" |

### 高亮效果

复用 `outline-highlight` 风格，新增 `feature-highlight` CSS class：

- 橙色/金色轮廓光晕，闪烁 2 次
- 动画持续约 1.5s，结束后自动移除 class

---

## 技术实现步骤

### Step 1：创建 `src/constants/feature-tips.ts`

定义 `FeatureTip` 接口和 `FEATURE_TIPS` 数组：

```typescript
export interface FeatureTip {
  id: string
  /** 在 Shadow DOM 内用 data-tip-target="{id}" 标记的目标元素（可选） */
  highlightTarget?: string
  /** 引用 DEFAULT_KEYBINDINGS 中的 key，用于动态显示快捷键 */
  shortcutIds?: ShortcutActionId[]
}

export const FEATURE_TIPS: FeatureTip[] = [
  { id: "passthrough", shortcutIds: [] },
  { id: "privacy-mode", highlightTarget: "header-title" },
  { id: "shortcuts", highlightTarget: "shortcuts-btn", shortcutIds: ["showShortcuts"] },
  { id: "global-search", highlightTarget: "search-btn", shortcutIds: ["openGlobalSearch"] },
  { id: "copy-reply", shortcutIds: ["copyLatestReply"] },
  { id: "prev-next-heading", shortcutIds: ["prevHeading", "nextHeading"] },
  { id: "export-conv", highlightTarget: "conversations-tab" },
  { id: "batch-select", highlightTarget: "conversations-tab" },
  { id: "export-markdown", highlightTarget: "toolbar-btn" },
  { id: "show-user-query", highlightTarget: "outline-tab" },
  { id: "notifications", highlightTarget: "settings-btn" },
]
```

`highlightTarget` 是语义名称（非 CSS 选择器），在 App.tsx 中通过 `data-tip-target="{name}"` 属性映射。

---

### Step 2：修改 `src/utils/i18n.ts` —— 添加英文回退

```typescript
// 修改 t() 函数：当前语言找不到 key 时回退到英文
export function t(key: string, params?: Record<string, string>): string {
  const langResources = resources[currentLang as keyof typeof resources]
  const enResources = resources["en"]
  let text =
    (langResources?.[key as keyof typeof langResources] as string) ||
    (enResources[key as keyof typeof enResources] as string) ||
    key
  // ... params 替换保持不变
}
```

---

### Step 3：添加 i18n 字符串

每个 tip 需要 3 个 key：`featureTip-{id}-title` / `featureTip-{id}-desc` / `featureTip-{id}-path`

在 `src/locales/zh-CN/index.ts` 和 `src/locales/en/index.ts` 分别添加。

| Tip ID            | title（中）      | path（中）                                      |
| ----------------- | ---------------- | ----------------------------------------------- |
| passthrough       | 穿透模式         | 长按 {modifier}，面板变透明，可操作下层页面内容 |
| privacy-mode      | 隐私模式         | 双击面板标题栏开启/关闭                         |
| shortcuts         | 快捷键总览       | 按 {shortcut} 查看全部快捷键                    |
| global-search     | 全局搜索语法     | 支持 folder: tag: site: level: 过滤语法         |
| copy-reply        | 复制最新 AI 回复 | {shortcut} 一键复制最近一条回复                 |
| prev-next-heading | 标题间快速跳转   | {shortcut} 在大纲标题间跳转                     |
| export-conv       | 导出会话         | 会话 Tab → 长按进入多选 → 底部导出按钮          |
| batch-select      | 批量操作会话     | 会话 Tab → 长按任意项进入多选模式               |
| export-markdown   | 导出当前对话     | 右侧快捷按钮组 → 工具箱 → 导出 Markdown         |
| show-user-query   | 大纲显示用户提问 | 大纲设置 → 显示用户提问                         |
| notifications     | 生成完成通知     | 设置 → 通知 → 启用桌面通知                      |

---

### Step 4：扩展 `global-search/types.ts`

在 `GlobalSearchResultItem` 接口新增字段：

```typescript
export interface GlobalSearchResultItem {
  // ... 现有字段 ...
  tipId?: string // 标记这是一个功能技巧条目
  tipHighlightTarget?: string // 语义目标名称（对应 data-tip-target 属性值）
  tipShortcutIds?: ShortcutActionId[] // 引用的快捷键 ID，用于动态显示
}
```

同时在 `GlobalSearchCategoryId` 类型中新增独立的 `"tips"` 类别（不复用 `"settings"`）：

```typescript
export type GlobalSearchCategoryId =
  | "all"
  | "outline"
  | "conversations"
  | "prompts"
  | "settings"
  | "tips"
```

---

### Step 5：修改 `global-search/useGlobalSearchData.ts`

使用 hook 已有入参 `resolveShortcutLabel` 和 `passThroughModifierLabel`，在数据生成逻辑中：

1. 检测 query 是否以 `tip:` 开头，或当前分类已切到 `tips`
2. 提取 `tip:` 后的实际搜索词（可为空）
3. 从 `FEATURE_TIPS` 生成 `GlobalSearchResultItem[]`，category 设为独立的 `"tips"`，通过 title/desc/path 的 i18n key 生成内容
4. 按搜索词模糊过滤
5. 当处于 tips 模式时，清空其他所有分组，仅返回 tips 分组

关键逻辑：

```typescript
const isTipsMode =
  trimmedGlobalSearchPlainQuery.startsWith("tip:") || activeGlobalSearchCategory === "tips"
const tipsQuery = trimmedGlobalSearchPlainQuery.startsWith("tip:")
  ? trimmedGlobalSearchPlainQuery.slice(4).trim().toLowerCase()
  : trimmedGlobalSearchPlainQuery.trim().toLowerCase()

const tipsLabel = getLocalizedText({ key: "featureTipsCategory", fallback: "Feature Tips" })
const shortcutNotConfiguredLabel = getLocalizedText({
  key: "featureTipShortcutNotConfigured",
  fallback: "Shortcut not configured",
})

const tipsItems = FEATURE_TIPS.map((tip) => {
  const shortcutLabels =
    tip.shortcutIds
      ?.map((id) => resolveShortcutLabel(id))
      .filter((label): label is string => Boolean(label)) ?? []
  const params = {
    modifier: passThroughModifierLabel,
    shortcut: shortcutLabels.length > 0 ? shortcutLabels.join(" / ") : shortcutNotConfiguredLabel,
  }
  const title = t(`featureTip-${tip.id}-title`, params)
  const desc = t(`featureTip-${tip.id}-desc`, params)
  const path = t(`featureTip-${tip.id}-path`, params)
  const snippet = shortcutLabels.length > 0 ? `${desc}  [${shortcutLabels.join(" / ")}]` : desc
  return {
    id: `tips:${tip.id}`,
    title,
    breadcrumb: `${tipsLabel} / ${path}`,
    snippet,
    category: "tips" as GlobalSearchResultCategory,
    tipId: tip.id,
    tipHighlightTarget: tip.highlightTarget,
    tipShortcutIds: tip.shortcutIds,
  }
}).filter((tipItem) => {
  if (!tipsQuery) return true
  return [tipItem.title, tipItem.snippet].some((v) => v?.toLowerCase().includes(tipsQuery))
})
```

**快捷键动态插值策略：**

- `shortcutIds` 中的每个 ID 通过 `resolveShortcutLabel(id)` 解析为用户可见文本（包含平台前缀）
- `passThroughModifierLabel` 用于 `{modifier}` 插值（穿透模式的长按键）
- 若快捷键未配置/已禁用（为 null/空），在 breadcrumb 中显示 `(未配置)` 而非插入空字符串

---

### Step 6：修改 `GlobalSearchResultItemView.tsx`

在条目渲染逻辑末尾增加 tips 分支：

```typescript
if (item.tipId) {
  return (
    <div className="gs-result-item gs-result-item--tip" ...>
      <span className="gs-tip-icon">💡</span>
      <div className="gs-tip-content">
        <span className="gs-tip-title">{item.title}</span>
        <span className="gs-tip-path">{item.breadcrumb}</span>
      </div>
      {/* 快捷键徽标（如果 tipShortcutIds 解析后有值） */}
    </div>
  )
}
```

样式写在 `style.css` 中：

- `.gs-result-item--tip`：背景色略偏暖（区分于普通条目）
- `.gs-tip-path`：使用小号字体，二级文字颜色

---

### Step 7：修改 `App.tsx`

**7a. 添加 `data-tip-target` 属性**

在关键 UI 元素上添加 `data-tip-target` 属性，以便高亮函数定位：

| 目标名称            | 元素描述                 | 添加位置                  |
| ------------------- | ------------------------ | ------------------------- |
| `conversations-tab` | 会话 Tab 按钮            | App.tsx 的 tab 按钮区域   |
| `outline-tab`       | 大纲 Tab 按钮            | 同上                      |
| `prompts-tab`       | 提示词 Tab 按钮          | 同上                      |
| `toolbar-btn`       | 工具箱按钮（快捷按钮组） | App.tsx 快捷按钮区域      |
| `settings-btn`      | 设置按钮                 | App.tsx header 区域       |
| `search-btn`        | 搜索按钮                 | App.tsx header 区域       |
| `header-title`      | 面板标题栏               | MainPanel.tsx header      |
| `shortcuts-btn`     | 快捷键按钮               | App.tsx header 或对应位置 |

**7b. 实现 `highlightTipTarget` 函数**

```typescript
const highlightTipTarget = useCallback(
  (targetName: string) => {
    // 在 Shadow DOM 内（panelRef.current 的所在根）查找
    const root = panelRef.current?.getRootNode() as ShadowRoot | Document
    const el = root?.querySelector?.(`[data-tip-target="${targetName}"]`) as HTMLElement | null
    if (!el) return
    el.classList.add("feature-highlight")
    setTimeout(() => el.classList.remove("feature-highlight"), 1800)
  },
  [panelRef],
)
```

**7c. 在搜索结果点击分支中处理 `tipId`**

在 App.tsx 的搜索条目点击处理器（`handleGlobalSearchResultClick` 或类似函数）中：

```typescript
if (item.tipId) {
  closeGlobalSettingsSearch()
  if (item.tipHighlightTarget) {
    highlightTipTarget(item.tipHighlightTarget)
  } else if (item.tipShortcutIds?.length) {
    // 纯快捷键提示：显示 toast
    const shortcutText = item.tipShortcutIds
      .map((id) => formatShortcut(keybindings[id] ?? DEFAULT_KEYBINDINGS[id], isMac))
      .filter(Boolean)
      .join(" / ")
    if (shortcutText) {
      showToast(`Try: ${shortcutText}`, 3000)
    }
  }
  return
}
```

---

### Step 8：添加 CSS 动画（`style.css`）

```css
/* 功能技巧高亮动画 */
@keyframes featureHighlightPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 180, 0, 0.8);
    outline-color: rgba(255, 180, 0, 0.9);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 180, 0, 0);
    outline-color: rgba(255, 180, 0, 0.4);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 180, 0, 0);
    outline-color: transparent;
  }
}

.feature-highlight {
  outline: 2px solid rgba(255, 180, 0, 0.9) !important;
  outline-offset: 2px;
  border-radius: 6px;
  animation: featureHighlightPulse 0.7s ease-out 2;
  position: relative;
  z-index: 1;
}

/* tips 搜索条目样式 */
.gs-result-item--tip .gs-tip-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-right: 8px;
}

.gs-result-item--tip .gs-tip-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gs-result-item--tip .gs-tip-title {
  font-weight: 500;
  color: var(--gh-text, #333);
  font-size: 13px;
}

.gs-result-item--tip .gs-tip-path {
  color: var(--gh-text-secondary, #888);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

## 文件变更清单

| 文件                                                          | 操作                                         | 改动量（估计） |
| ------------------------------------------------------------- | -------------------------------------------- | -------------- |
| `src/constants/feature-tips.ts`                               | 新建                                         | ~50 行         |
| `src/utils/i18n.ts`                                           | 修改 t() 回退逻辑                            | 3 行           |
| `src/locales/zh-CN/index.ts`                                  | 新增 36 个 i18n key                          | ~40 行         |
| `src/locales/en/index.ts`                                     | 新增 36 个 i18n key                          | ~40 行         |
| `src/components/global-search/types.ts`                       | 新增 3 个字段                                | 5 行           |
| `src/components/global-search/useGlobalSearchData.ts`         | 新增 tips 数据源                             | ~60 行         |
| `src/components/global-search/GlobalSearchResultItemView.tsx` | tips 渲染分支                                | ~30 行         |
| `src/components/App.tsx`                                      | `data-tip-target` 属性 + 点击处理 + 高亮函数 | ~40 行         |
| `src/style.css`                                               | 新增 2 个 CSS 块                             | ~40 行         |

**总计：约 308 行变更**

---

## 后续可扩展方向

- 技巧条目支持"标记为已了解"（持久化到 localStorage，不再显示）
- 在全局搜索空状态下主动提示用户可输入 `?` 查看技巧
- 扩展 tips 列表：新增功能时同步维护
- 多语言补全：后续逐步覆盖其他 8 种语言
