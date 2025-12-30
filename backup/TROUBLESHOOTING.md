# Gemini Helper 疑难杂症排查手册

> 记录开发过程中遇到的稀奇古怪问题及其解决方案，供后续参考。

---

## 📋 目录

1. [滚动容器错误匹配](#1-滚动容器错误匹配)
2. [阅读历史会话切换后不更新](#2-阅读历史会话切换后不更新)
3. [用户看完生成结果后切换页面仍收到通知](#3-用户看完生成结果后切换页面仍收到通知)
4. [面板拖拽跳动问题](#4-面板拖拽跳动问题)
5. [同步滚动初始化失败](#5-同步滚动初始化失败)
6. [Shadow DOM 内动态元素监听失效](#6-shadow-dom-内动态元素监听失效)
7. [Flutter 图文并茂滚动失效](#7-flutter-图文并茂滚动失效)

---

## 1. 滚动容器错误匹配

**日期**: 2025-12-18

### 症状

- "去顶部"/"去底部"按钮点击后，**侧边栏会话列表**滚动了，而非主对话区域
- 锚点跳转失效
- 大纲点击跳转到错误位置

### 背景

在开发"会话"Tab 功能时新增了以下代码：

- `SiteAdapter.getSidebarScrollContainer()` - 返回侧边栏的 `infinite-scroller`
- `SiteAdapter.loadAllConversations()` - 滚动侧边栏加载全部会话

### 根因

Gemini 页面中存在 **两个 `infinite-scroller` 元素**：

1. **主对话区域**: `infinite-scroller.chat-history`
2. **侧边栏会话列表**: `infinite-scroller[scrollable="true"]`

`DOMToolkit.findScrollContainer()` 在查找时，如果用户提供的选择器都未匹配，会**遍历 DOM 查找第一个满足滚动条件的元素**（`scrollHeight > clientHeight` 且 `overflow: auto/scroll`）。

由于侧边栏的 `infinite-scroller` 也满足滚动条件，在特定情况下可能被优先匹配。

### 修复方案

在 `SiteAdapter.getScrollContainer()` 的选择器数组**首位**添加精确选择器：

```javascript
getScrollContainer() {
    return DOMToolkit.findScrollContainer({
        selectors: [
            'infinite-scroller.chat-history', // 精确匹配主对话区域
            '.chat-mode-scroller',
            'main',
            '[role="main"]',
            '.conversation-container',
            '.chat-container',
        ],
    });
}
```

### 经验总结

| 教训                       | 说明                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| **选择器要精确**           | 当页面存在多个相似元素时，通用选择器（如标签名）可能匹配到错误元素                                |
| **新增功能可能影响旧功能** | 新增侧边栏操作虽然没有直接修改滚动逻辑，但改变了 DOM 结构或查找顺序                               |
| **对比法排查**             | 使用 Git 找回正常版本进行对比，快速定位差异范围                                                   |
| **复用现有选择器**         | `getResponseContainerSelector()` 返回的 `infinite-scroller.chat-history` 正是我们需要的精确选择器 |

---

## 2. 阅读历史会话切换后不更新

**日期**: 2025-12-23

### 症状

- 在会话 A 中滚动后，切换到会话 B，再回到 A，发现阅读位置没有更新
- 只有第一个打开的会话的阅读位置会被记录

### 背景

`ReadingProgressManager` 通过监听滚动容器的 `scroll` 事件来记录位置。

### 根因

Gemini 是 SPA 应用，会话切换时 DOM 会重新渲染，**旧的滚动容器元素会被销毁**。

问题代码：

```javascript
startRecording() {
    if (this.isRecording) return;  // ⚠️ 已在记录，直接返回
    // ... 绑定监听到当前容器
}
```

会话切换后：

1. `restoreReadingProgress` 调用 `startRecording()`
2. 但 `isRecording = true`（首次进入时已设置），直接返回
3. 结果：监听仍绑定在已销毁的旧容器上，新容器没有监听

### 修复方案

新增 `restartRecording()` 方法，会话切换时强制重新绑定：

```javascript
restartRecording() {
    this.stopRecording();  // 先移除旧监听
    this.startRecording(); // 再绑定新容器
}
```

调用点修改：

```javascript
// restoreReadingProgress 中
this.readingProgressManager.restartRecording(); // 原为 startRecording()
```

### 经验总结

| 教训               | 说明                                                     |
|------------------|--------------------------------------------------------|
| **SPA 容器会变**     | 单页应用中 DOM 元素可能随时被替换，事件监听需要重新绑定                         |
| **状态标志需配套**      | `isRecording` 防重入是好的，但需要配套提供 `restart` 方法处理容器更换场景      |
| **getter vs 引用** | `scrollManager.container` 是 getter，每次调用重新查询 DOM，不是固定引用 |

---

## 3. 用户看完生成结果后切换页面仍收到通知

**日期**: 2025-12-24

### 症状

- 用户在 Gemini 页面前台观看 AI 生成回复
- AI 生成完成后，用户看完内容并切换到其他页面
- 切换后收到"生成完成"的桌面通知（不应该发送）

### 背景

Gemini 普通版有两套生成完成检测机制：

1. **NetworkMonitor**（网络层）：通过 Hook Fetch 监控 API 请求，使用 3 秒静默期（`silenceThreshold`）判断完成
2. **isGenerating()**（DOM 层）：检测停止按钮 `mat-icon[fonticon="stop"]` 是否存在

通知触发的原代码逻辑：

```javascript
_onAiComplete() {
    if (wasGenerating && document.hidden) {
        this._sendCompletionNotification();
    }
}
```

### 根因

**时序问题**：`silenceThreshold` 导致的 3 秒判定延迟窗口

```
T+0s: AI 生成完成，停止按钮消失
T+0s~T+3s: NetworkMonitor 等待静默确认
T+1.5s: 用户切换到其他页面（document.hidden = true）
T+3s: NetworkMonitor 确认完成，触发 _onAiComplete()
     → wasGenerating = true, document.hidden = true
     → 发送通知（错误！用户已经看完了）
```

核心问题：**只检查 `onComplete` 触发时的 `document.hidden`，无法区分"用户一直在后台等待"和"用户看完才离开"**。

### 修复方案

通过监听 `visibilitychange` 事件，追踪用户是否在前台看到过生成完成：

```javascript
constructor();
{
    this._userSawCompletion = false;
    this._boundVisibilityHandler = this._onVisibilityChange.bind(this);
}

start();
{
    document.addEventListener('visibilitychange', this._boundVisibilityHandler);
}

_onVisibilityChange();
{
    // 用户切换页面时，检查 DOM 状态
    // 如果正在生成但 DOM 显示已完成，说明用户看到了完成状态
    if (this._aiState === 'generating' && !this.adapter.isGenerating()) {
        this._userSawCompletion = true;
    }
}

_onAiComplete();
{
    // 只有用户没看到过完成状态时才发通知
    if (wasGenerating && document.hidden && !this._userSawCompletion) {
        this._sendCompletionNotification();
    }
    this._userSawCompletion = false; // 重置
}

stop();
{
    document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
}
```

### 经验总结

| 教训                      | 说明                                              |
|-------------------------|-------------------------------------------------|
| **时序问题难以复现**            | 用户行为是任意的，需要穷举所有时序场景进行验证                         |
| **状态快照 vs 实时检测**        | `onComplete` 时检测 `hidden` 只是快照，无法反映整个生成过程中用户的行为 |
| **visibilitychange 可靠** | 标准 W3C API，覆盖标签页切换、最小化、锁屏等场景，性能开销几乎为零           |
| **边界情况可接受**             | DOM 更新的几十毫秒窗口期可能导致极小概率误判，但实际影响可忽略               |

---

## 4. 面板拖拽跳动问题

**日期**: 2025-12-25

### 症状

- 页面刷新后，首次长按面板顶部拖拽时，面板会猛的向下跳动约半屏
- 拖拽完成后，缩小浏览器窗口，面板可能跑到屏幕外不可见

### 背景

面板使用 CSS 实现垂直居中和拖拽功能：

CSS 初始定位：

```css
#gemini-helper-panel {
    position: fixed;
    top: 50%;
    right: 20px;
    transform: translateY(-50%); /* 关键：居中 */
    transition: all 0.3s ease;
}
```

拖拽逻辑（旧）：

```javascript
let xOffset = 0,
    yOffset = 0;

// mousedown
initialX = e.clientX - xOffset; // = clientX - 0
initialY = e.clientY - yOffset; // = clientY - 0

// mousemove
panel.style.transform = `translate(${currentX}px, ${currentY}px)`; // 覆盖了 translateY(-50%)
```

### 根因

**问题 1：首次拖拽跳动半屏**

| 阶段   | 状态                                            |
|------|-----------------------------------------------|
| 初始   | CSS `top: 50%` + `translateY(-50%)` = 真正的垂直居中 |
| 拖拽开始 | `xOffset = 0, yOffset = 0`，oldTransform 被覆盖   |
| 拖拽中  | `translate(0, 0)` 覆盖了 `translateY(-50%)`      |
| 结果   | 面板从「垂直居中」变成「顶部边缘在屏幕中间」= 向下跳半屏                 |

**问题 2：首次拖拽微小抖动**

`transition: all 0.3s ease` 使得 `transform` 变化产生过渡动画，视觉上有短暂抖动。

**问题 3：窗口缩小后面板消失**

拖拽后使用绝对像素 `left/top` 定位，窗口变小时面板可能超出视口。

### 修复方案

**1. 重写 `makeDraggable`：读取实际位置 + 切换定位方式**

```javascript
header.addEventListener('mousedown', (e) => {
    // 读取面板当前的实际位置
    const rect = panel.getBoundingClientRect();

    // 计算鼠标相对于面板左上角的偏移
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // 切换为 left/top 定位
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        panel.style.left = e.clientX - offsetX + 'px';
        panel.style.top = e.clientY - offsetY + 'px';
    }
});
```

**2. CSS 精细化过渡**

```css
/* 旧 */
transition: all 0.3s ease;

/* 新：只对需要动画的属性生效 */
transition: box-shadow 0.3s ease, border-color 0.3s ease;
```

**3. 窗口边界检测**

```javascript
let hasDragged = false;

const clampToViewport = () => {
    // 跳过：未拖拽过 或 面板已收起
    if (!hasDragged || panel.classList.contains('collapsed')) return;

    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth,
        vh = window.innerHeight;

    let newLeft = parseFloat(panel.style.left);
    let newTop = parseFloat(panel.style.top);

    if (rect.right > vw) newLeft = vw - rect.width - 10;
    if (rect.bottom > vh) newTop = vh - rect.height - 10;
    if (rect.left < 0) newLeft = 10;
    if (rect.top < 0) newTop = 10;

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
};

window.addEventListener('resize', clampToViewport);
```

### 经验总结

| 教训                       | 说明                                                      |
|--------------------------|---------------------------------------------------------|
| **CSS 定位方式切换**           | 拖拽场景中，`transform` 和 `top/right` 混用容易产生冲突，应在拖拽开始时统一为一种方式 |
| **transition: all 的副作用** | 会影响所有属性变化，包括定位属性，导致意外的过渡动画                              |
| **SPA 中的 resize 处理**     | 用户可能在任意时刻调整窗口，需要考虑边界情况                                  |
| **状态标记的价值**              | `hasDragged` 可以区分「从未拖拽」和「已拖拽过」，避免不必要的边界检测               |

---

## 5. 同步滚动初始化失败

**日期**: 2025-12-26

### 症状

- 大纲 Tab 位于第一个位置时，页面刷新后同步滚动功能不生效（滚动页面时大纲项不高亮）
- 手动切换到其他 Tab 再切回大纲后，同步滚动正常工作
- 如果大纲 Tab 不是第一个位置（如第二个），刷新后也正常

### 背景

大纲功能提供「同步滚动」选项：当用户滚动页面内容时，自动高亮对应的大纲项。

关键代码路径：

1. `UIManager.init()` → `createUI()` → `setActive(true)` → `startSyncScroll()`
2. `startSyncScroll()` 调用 `siteAdapter.getScrollContainer()` 获取滚动容器
3. 将 scroll 事件监听器绑定到该容器

### 排查过程

#### 第一轮：检查 isActive 状态

**假设**：初始化时 `OutlineManager.isActive` 状态不正确。

**验证**：检查 `createUI` 中的逻辑，发现确实调用了 `setActive(true)`，状态正确。

**结论**：❌ 不是根因

#### 第二轮：检查 refreshOutline 调用

**假设**：初始化时调用了 `setActive(true)` 但没有调用 `refreshOutline()`，导致 `handleSyncScroll` 因 `this.state.tree` 为空而直接返回。

**修复尝试**：在 `init()` 中添加 `setTimeout(() => this.refreshOutline(), 500)`。

**结果**：❌ 问题依旧

#### 第三轮：检查 startSyncScroll 的短路逻辑

**假设**：`startSyncScroll` 第一行有 `if (this.syncScrollHandler) return;`，可能初始化时绑定了 handler，延迟调用时因 handler 已存在而跳过。

**修复尝试**：在延迟调用 `switchTab` 之前先调用 `stopSyncScroll()` 清除旧 handler：

```javascript
setTimeout(() => {
    if (this.currentTab === 'outline' && this.outlineManager) {
        this.outlineManager.stopSyncScroll();
    }
    this.switchTab(this.currentTab);
}, 1500);
```

**结果**：❌ 问题依旧

#### 第四轮：添加调试日志

既然前面的假设都不对，决定添加 `console.log` 追踪实际执行情况：

```javascript
startSyncScroll(retryCount = 0) {
    console.log('[SyncScroll] startSyncScroll called, retryCount:', retryCount, 'handler exists:', !!this.syncScrollHandler);
    // ...
    const scrollContainer = this.siteAdapter.getScrollContainer();
    console.log('[SyncScroll] scrollContainer:', scrollContainer);
    // ...
    console.log('[SyncScroll] Event listener added to:', scrollContainer.tagName, scrollContainer.className);
}

handleSyncScroll() {
    console.log('[SyncScroll] handleSyncScroll called, tree:', !!this.state.tree, 'length:', this.state.tree?.length);
    // ...
}
```

**日志输出**：

```
[SyncScroll] startSyncScroll called, retryCount: 0 handler exists: false
[SyncScroll] scrollContainer: <body class="theme-host light-theme google-sans-context" ...>
[SyncScroll] Event listener added to: BODY theme-host light-theme google-sans-context
```

**关键发现**：`scrollContainer` 返回的是 `<body>` 而非 `infinite-scroller.chat-history`！

#### 第五轮：分析 getScrollContainer

**重新分析**：Gemini 是 SPA，页面刷新后 `infinite-scroller.chat-history` 可能还未被创建。原来的 `getScrollContainer()` 使用 `DOMToolkit.findScrollContainer()`，当选择器匹配不到时会 fallback 到 `body`。

#### 第六轮：验证修改方案的安全性

**检查所有调用点**：

| 调用点                              | 位置             | 是否处理 null                        |
|----------------------------------|----------------|----------------------------------|
| `startSyncScroll`                | OutlineManager | ✅ 重试机制                           |
| `stopSyncScroll`                 | OutlineManager | ✅ `if (scrollContainer)`         |
| `handleSyncScroll`               | OutlineManager | ✅ `if (!scrollContainer) return` |
| `getVisibleAnchorElement`        | SiteAdapter    | ✅ `if (!container) return null`  |
| `ScrollManager.container` getter | ScrollManager  | ✅ 所有使用点都有 `if (this.container)`  |

**结论**：所有调用点都已正确处理 `null`，修改安全。

**最终方案**：恢复所有选择器，但不使用 `findScrollContainer`，改为手动遍历并添加滚动条件检查。

### 根因

Gemini 是 SPA 动态渲染，初始化时 `infinite-scroller.chat-history` 可能还未创建。原来的 `getScrollContainer()` 使用 `DOMToolkit.findScrollContainer()`，当选择器匹配不到时会 fallback 到 `body`，导致滚动监听器绑定到错误的元素。

```
时序问题：
T+0s: 脚本初始化，调用 getScrollContainer()
      → infinite-scroller.chat-history 尚未创建
      → fallback 到 body
T+0s: startSyncScroll() 将滚动监听器绑定到 body
T+1s: Gemini 完成渲染，infinite-scroller.chat-history 出现
T+?s: 用户滚动 infinite-scroller（实际滚动容器）
      → body 的 scroll 事件不会触发
      → 同步滚动不工作
```

### 修复方案

1. **修改 `getScrollContainer()`**：不使用 `findScrollContainer`，改为手动遍历选择器，并添加滚动条件检查，找不到则返回 `null`：

```javascript
getScrollContainer() {
    const selectors = [
        'infinite-scroller.chat-history',
        '.chat-mode-scroller',
        'main',
        '[role="main"]',
        '.conversation-container',
        '.chat-container',
    ];
    for (const selector of selectors) {
        const container = document.querySelector(selector);
        // 确保是可滚动的容器
        if (container && container.scrollHeight > container.clientHeight) {
            return container;
        }
    }
    // 不 fallback 到 body，让调用者决定如何处理
    return null;
}
```

1. **`startSyncScroll()` 已有重试机制**：当 `getScrollContainer()` 返回 `null` 时，会在 300ms 后重试（最多 10 次，共 3 秒）。

2. **init 中增加延迟重新绑定**：确保页面稳定后重新调用 `switchTab`，并先清除旧 handler。

### 经验总结

| 教训                    | 说明                                               |
|-----------------------|--------------------------------------------------|
| **日志是最可靠的调试手段**       | 前 3 轮假设都是错的，添加日志后立即发现真正问题                        |
| **SPA 动态渲染注意时序**      | 初始化时 DOM 可能不完整，需要考虑元素尚未创建的情况                     |
| **Fallback 要谨慎**      | `findScrollContainer` 的 body fallback 在这个场景下是有害的 |
| **返回 null 比返回错误值更安全** | 让调用者决定如何处理「未找到」的情况                               |
| **修改公共方法前检查所有调用点**    | `getScrollContainer` 被多处使用，需确保所有调用点都正确处理 null    |
| **保留 fallback 选择器**   | 不要因为修复一个问题而删除可能在其他场景需要的代码                        |

---

## 6. Shadow DOM 内动态元素监听失效

**日期**: 2025-12-28

### 症状

- Gemini Business 中表格的"复制 Markdown"按钮不显示
- 重新开关"Markdown 表格复制"设置后按钮才出现
- 普通 Gemini 无此问题

### 背景

表格复制功能使用 `DOMToolkit.each('table', callback, { shadow: true })` 持续监听表格元素。

`each()` 的实现分为两部分：

1. **初始查询**：使用 `query()` 穿透 Shadow DOM 查找已存在的元素
2. **持续监听**：使用 `MutationObserver` 监听 `document` 的变化

### 根因

`MutationObserver` 对 `document` 的监听**无法捕获已存在的 Shadow DOM 内部的后续变化**。

```
时序问题：
T+0s: 脚本初始化，调用 each('table', callback)
      → 初始查询：Shadow DOM 尚未渲染 table，未找到
      → 持续监听：只监听 document
T+1s: Gemini Business 在已存在的 Shadow DOM 内部渲染 table
      → document 的 MutationObserver 无法感知
      → 表格从未被处理，按钮不显示
```

重新开关设置能修复的原因：

- 关闭时调用 `destroyTableCopy()` 停止监听
- 开启时调用 `initTableCopy()` 重新执行初始查询
- 此时 table 已存在于 Shadow DOM 中，被正确找到并处理

### 修复方案

扩展 `DOMToolkit.each()` 方法，在 `shadow: true` 时为所有已存在的 Shadow Root 也创建 `MutationObserver`：

```javascript
each(selector, callback, options = {}) {
    // ...existing code...

    // 新增：Shadow DOM 监听相关
    const watchedRoots = new WeakSet();
    const shadowObserverHandles = [];

    // 为 Shadow Root 创建监听的辅助函数
    const watchShadowRoot = (root) => {
        if (!root || !active || watchedRoots.has(root)) return;
        watchedRoots.add(root);

        const handle = this.#observerManager.getSharedObserver(root);
        handle.addCallback(observerCallback);
        shadowObserverHandles.push(handle);
    };

    // 递归收集并监听所有已存在的 Shadow Root
    const collectShadowRoots = (root, depth = 0) => {
        if (depth > CONFIG.MAX_DEPTH) return;

        const elements = root.querySelectorAll?.('*') || [];
        for (const el of elements) {
            if (el.shadowRoot) {
                watchShadowRoot(el.shadowRoot);
                collectShadowRoots(el.shadowRoot, depth + 1);
            }
        }
    };

    // 如果启用 Shadow DOM，监听所有已存在的 Shadow Root
    if (shadow) {
        collectShadowRoots(parent);
    }

    // 在 observerCallback 中也要检测新增节点的 Shadow Root
    const observerCallback = (addedNode) => {
        // ...existing code...

        if (shadow) {
            if (addedNode.shadowRoot) {
                watchShadowRoot(addedNode.shadowRoot);
            }
            // 递归检查子节点
            addedNode.querySelectorAll?.('*').forEach(el => {
                if (el.shadowRoot) watchShadowRoot(el.shadowRoot);
            });
        }
    };

    const stop = () => {
        // ...existing code...

        // 清理所有 Shadow Root 的监听
        shadowObserverHandles.forEach((handle) => {
            handle.removeCallback(observerCallback);
        });
    };
}
```

### 经验总结

| 教训                                  | 说明                                                                   |
|-------------------------------------|----------------------------------------------------------------------|
| **MutationObserver 不穿透 Shadow DOM** | 对 document 的监听无法捕获 Shadow DOM 内部变化，需要为每个 Shadow Root 单独创建 Observer   |
| **API 语义一致性**                       | `each(selector, { shadow: true })` 应该在整个生命周期都穿透 Shadow DOM，而不仅仅是初始查询 |
| **复用共享 Observer 管理器**               | `SharedObserverManager` 可以复用，以 Shadow Root 作为 rootNode               |
| **简单验证法**                           | "重新开关设置能修复" 说明问题出在持续监听而非初始查询                                         |

---

## 7. Flutter 图文并茂滚动失效

**日期**: 2025-12-29

### 症状

- 在 Gemini Business 的「图文并茂模式」中，点击「去底部」按钮只滚动几像素，无法真正到达底部
- 「去顶部」按钮同样无效
- 「返回锚点」跳转到错误位置
- 有时第一次点击提示「未找到滚动容器」，第二次才正常

### 背景

Gemini 的「图文并茂模式」使用 Flutter 渲染引擎，内容通过 `<iframe>` 嵌入。滚动容器是 `<flt-semantics>` 元素，而非普通的 DOM 元素。

关键 HTML 结构：

```html
<iframe sandbox="allow-same-origin ...">
  <flt-semantics-host style="transform: scale(0.519481);">
    <flt-semantics style="overflow-y: scroll;">
      <!-- 内容 -->
    </flt-semantics>
  </flt-semantics-host>
</iframe>
```

### 根因

**问题 1：滚动容器在 iframe 内找不到**

原来的 `getScrollContainer()` 方法只在主文档中查找选择器，无法穿透 iframe 边界。

**问题 2：scrollHeight 因 scale 变换失真**

Flutter 的 `flt-semantics-host` 有 `transform: scale(0.519481)` 缩放。这导致：

- `scrollHeight` 报告的值只有实际高度的约 52%
- `scrollTo({ top: scrollHeight })` 只能滚动「视觉上」的一半距离

**问题 3：iframe 访问不稳定**

每次调用 `getScrollContainer()` 都重新在 iframe 中查找容器，这依赖于 `iframe.contentDocument` 访问成功。有时会因为时序问题导致第一次访问失败。

### 修复方案

**1. 扩展 `getScrollContainer` 支持 iframe 内查找**

```javascript
getScrollContainer() {
    // ... 普通选择器查找 ...

    // 检查缓存的 Flutter 容器是否仍然有效
    if (this._cachedFlutterScrollContainer && this._cachedFlutterScrollContainer.isConnected) {
        return this._cachedFlutterScrollContainer;
    }

    // 尝试在 iframe 中查找
    const iframes = document.querySelectorAll('iframe[sandbox*="allow-same-origin"]');
    for (const iframe of iframes) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
                const scrollContainer = iframeDoc.querySelector(
                    'flt-semantics[style*="overflow-y: scroll"]:not([style*="overflow-x: scroll"])'
                );
                if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
                    // 缓存找到的 Flutter 容器
                    this._cachedFlutterScrollContainer = scrollContainer;
                    return scrollContainer;
                }
            }
        } catch (e) {
            // 跨域 iframe 会抛出错误，忽略
        }
    }
    return null;
}
```

**2. 循环滚动机制处理 scale 变换**

对于「去底部」，使用 `requestAnimationFrame` 循环设置 `scrollTop = scrollHeight`，直到位置不再变化：

```javascript
scrollToBottom() {
    const container = this.scrollManager.container;
    const isFlutterView = container?.tagName?.toLowerCase().startsWith('flt-');

    if (isFlutterView) {
        const scrollStep = () => {
            const before = container.scrollTop;
            container.scrollTop = container.scrollHeight;
            if (container.scrollTop > before) {
                requestAnimationFrame(scrollStep);
            }
        };
        scrollStep();
    } else {
        this.scrollManager.scrollTo({ top: this.scrollManager.scrollHeight, behavior: 'smooth' });
    }
}
```

**3. 锚点保存/恢复使用相同坐标系**

由于锚点值保存和恢复都使用 `container.scrollTop`，即使有 scale 变换，坐标系是一致的，因此直接设置一次即可：

```javascript
backToManualAnchor() {
    const container = this.scrollManager.container;
    const isFlutterView = container?.tagName?.toLowerCase().startsWith('flt-');

    if (isFlutterView && container) {
        container.scrollTop = targetTop; // 直接设置一次
    } else {
        this.scrollManager.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
}
```

### 经验总结

| 教训                        | 说明                                                   |
|-----------------------------|------------------------------------------------------|
| **iframe 内容需要特殊处理**   | 主文档的选择器无法穿透 iframe，需要通过 contentDocument 访问  |
| **缓存不稳定的 DOM 引用**     | iframe 内的元素访问可能失败，缓存有效引用可提高稳定性          |
| **CSS transform 影响滚动**    | scale 变换会导致 scrollHeight 与实际滚动距离不匹配          |
| **循环滚动应对异常滚动行为**  | 当单次 scrollTo 不能到达目标时，循环设置直到稳定              |
| **坐标系一致性**             | 保存和恢复使用相同坐标系时，不需要额外转换                    |

---

## 8. Flutter 模式切换会话时页面全选

**日期**: 2025-12-29

### 症状

- 在 Gemini 普通版点击「图文并茂」「Deep Research」「动态视图」按钮后
- 在侧边栏点击其他会话时，整个页面的文字被全选（蓝色高亮）
- 问题非必现，但禁用脚本后不再出现

### 背景

这些模式使用 Flutter 渲染，内容在 iframe 中通过 `<flt-semantics>` 元素呈现。脚本的 `getScrollContainer()` 方法会缓存 iframe 内的 Flutter 容器。

关键代码路径：

1. 用户点击侧边栏切换会话 → URL 变化
2. `checkUrl()` 被触发
3. `checkUrl()` 调用 `this.siteAdapter.clearTextarea()`
4. `clearTextarea()` 执行 `textarea.focus()` + `document.execCommand('selectAll')`

### 根因

**`document.execCommand('selectAll')` 在 `focus()` 失败时会选中整个文档。**

```javascript
clearTextarea() {
    if (this.textarea) {
        this.textarea.focus();              // ⚠️ 可能失败（元素已失效）
        document.execCommand('selectAll');  // ⚠️ 仍会执行，选中整个文档！
        document.execCommand('delete');
    }
}
```

问题场景：

1. 用户在 Flutter 模式下，`this.textarea` 引用可能指向旧的输入框元素
2. Flutter 模式下 DOM 结构不同，旧的 textarea 可能已被销毁或隐藏
3. `this.textarea.focus()` 静默失败（元素不可见或已断开连接）
4. `document.execCommand('selectAll')` 在无焦点元素时，选中的是整个文档

### 修复方案

在执行 `selectAll` 之前添加双重验证：

```javascript
clearTextarea() {
    if (!this.textarea) return;

    // 1. 验证元素仍在 DOM 中
    if (!this.textarea.isConnected) {
        this.textarea = null;
        return;
    }

    this.textarea.focus();

    // 2. 验证 focus 是否成功
    if (document.activeElement !== this.textarea &&
        !this.textarea.contains(document.activeElement)) {
        console.warn('[GeminiHelper] clearTextarea: focus failed, skipping execCommand');
        return;
    }

    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
}
```

同样的修复应用于：

- `GeminiAdapter.insertPrompt()`
- `GeminiAdapter.clearTextarea()`
- `GeminiBusinessAdapter.insertPrompt()`
- `GeminiBusinessAdapter.clearTextarea()`
- `GeminiBusinessAdapter.clearTextareaNormal()`

### 经验总结

| 教训                          | 说明                                                           |
|-------------------------------|----------------------------------------------------------------|
| **`focus()` 可能静默失败**     | 对不可见/已销毁的元素调用 `focus()` 不会抛出异常，但不会真正获得焦点 |
| **`execCommand` 作用于当前焦点** | `selectAll` 在无焦点元素时会作用于整个文档                        |
| **SPA 中的引用可能过期**        | 缓存的 DOM 引用在页面切换后可能失效，需要检查 `isConnected`         |
| **非必现问题用 console.warn**  | 添加警告日志帮助后续排查，但不打扰正常使用                          |

---

## N. 问题标题

**日期**: YYYY-MM-DD

### 症状

- 描述用户可观察到的异常行为

### 背景

- 问题出现的上下文

### 根因

- 技术层面的原因分析

### 修复方案

```javascript
// 关键代码片段
```

### 经验总结

| 教训 | 说明 |
| ---- | ---- |
| ...  | ...  |

-->
