# lib - 通用工具库

供油猴脚本通过 `@require` 引入的通用工具集。

## 目录

| 工具                                                           | 描述        |
|--------------------------------------------------------------|-----------|
| [backgroundKeepAlive.user.js](./backgroundKeepAlive.user.js) | 后台保活工具集   |
| [domToolkit.user.js](./domToolkit.user.js)                   | DOM 操作工具库 |

---

## domToolkit.user.js

专为 Tampermonkey 脚本设计的高性能 DOM 工具库，解决以下痛点：

- **Shadow DOM 穿透查找** - 现代 Web 组件的难题
- **异步等待元素出现** - 动态渲染页面必备
- **持续监听新元素** - SPA 应用场景
- **事件委托** - 减少事件绑定开销
- **样式注入** - 支持 Shadow DOM

### 引入方式

```javascript
// ==UserScript==
// @require https://update.greasyfork.org/scripts/XXXXX/xxx/domToolkit.js
// ==/UserScript==
```

---

### API: query() - 同步查询

支持 Shadow DOM 穿透的同步元素查找。

```javascript
// 查找单个元素
const btn = DOMToolkit.query('button.submit');

// 查找所有匹配元素
const items = DOMToolkit.query('.item', { all: true });

// 在 Shadow DOM 中查找（默认启用）
const input = DOMToolkit.query('input.main', { shadow: true });

// 多选择器支持（返回第一个匹配）
const el = DOMToolkit.query(['button.submit', 'input[type="submit"]']);

// 使用自定义过滤函数
const textarea = DOMToolkit.query('[contenteditable]', {
    shadow: true,
    filter: (el) => el.offsetParent !== null && !el.closest('#my-panel'),
});
```

**参数**： | 选项 | 类型 | 默认值 | 说明 | |------|------|--------|------| | `parent` | Node | document | 查询起点 | |
`all` | boolean | false | 是否返回所有匹配 | | `shadow` | boolean | true | 是否穿透 Shadow DOM | | `maxDepth` | number |
15 | 最大递归深度 | | `useCache` | boolean | true | 是否使用缓存（有 filter 时自动禁用） | | `filter` | function | null |
自定义过滤函数 `(el) => boolean` |

---

### API: get() - 异步获取

等待元素出现，支持超时控制。

```javascript
// 等待元素出现（默认 5 秒超时）
const modal = await DOMToolkit.get('.modal');

// 自定义超时时间
const btn = await DOMToolkit.get('button.action', { timeout: 10000 });

// 无限等待
const el = await DOMToolkit.get('.dynamic', { timeout: 0 });
```

---

### API: each() - 持续监听

处理现在和未来所有匹配的元素。

```javascript
// 处理所有（现有和未来的）按钮
const stop = DOMToolkit.each('button.action', (btn, isNew) => {
    btn.style.color = 'blue';
    if (isNew) console.log('New button added');
});

// 稍后停止监听
stop();

// 返回 false 可提前停止
DOMToolkit.each('.item', (el) => {
    if (el.id === 'target') {
        console.log('Found target');
        return false; // 停止监听
    }
});
```

> **v1.1.4+**: 当 `shadow: true` 时，`each()` 会自动监听所有已存在的 Shadow DOM 内部变化，确保动态添加的匹配元素也能被处理。

---

### API: on() - 事件委托

事件委托，自动处理 Shadow DOM 中的事件。

```javascript
// 委托点击事件
const remove = DOMToolkit.on('click', '.item', (event, target) => {
    console.log('Item clicked:', target);
});

// 稍后移除
remove();

// 捕获阶段
DOMToolkit.on('click', '.btn', callback, { capture: true });
```

---

### API: create() / createFromHTML() - 元素创建

```javascript
// 创建元素
const btn = DOMToolkit.create(
    'button',
    {
        className: 'primary',
        id: 'submit',
        style: { color: 'white', background: 'blue' },
        onClick: () => console.log('clicked'),
    },
    'Submit',
);

// 从 HTML 字符串创建
const div = DOMToolkit.createFromHTML('<div class="card"><p>Hello</p></div>');

// 获取 ID 映射
const { root, title, content } = DOMToolkit.createFromHTML(
    `
    <div id="container">
        <h1 id="title">Title</h1>
        <p id="content">Content</p>
    </div>
`,
    { mapIds: true },
);
```

---

### API: css() / cssToShadow() / cssToAllShadows() - 样式注入

```javascript
// 全局样式
DOMToolkit.css('.highlight { background: yellow; }', 'my-styles');

// 向单个 Shadow DOM 注入
DOMToolkit.cssToShadow(shadowRoot, css, 'shadow-styles');

// 向所有 Shadow DOM 注入
DOMToolkit.cssToAllShadows(css, 'all-shadow-styles');

// 过滤特定 Shadow Host
DOMToolkit.cssToAllShadows(css, 'id', {
    filter: (host) => !host.closest('.sidebar'),
});
```

---

### API: walkShadowRoots() - Shadow DOM 遍历

```javascript
DOMToolkit.walkShadowRoots((shadowRoot, host) => {
    console.log('Found shadow root on:', host.tagName);
});
```

---

### API: findScrollContainer() - 查找滚动容器

```javascript
// 使用默认逻辑（Shadow DOM 优先，然后 documentElement/body）
const scroller = DOMToolkit.findScrollContainer();

// 提供站点特定的选择器（优先匹配）
const scroller = DOMToolkit.findScrollContainer({
    selectors: ['.chat-mode-scroller', '.conversation-container', 'main'],
});
```

---

### 其他 API

```javascript
DOMToolkit.clear(element); // 清空元素内容
DOMToolkit.clearCache(); // 清除缓存
DOMToolkit.configCache({ enabled: false }); // 禁用缓存
DOMToolkit.destroy(); // 销毁实例
```

---

## backgroundKeepAlive.user.js

解决浏览器后台标签页节流问题的通用工具集，包含三大模块。

### 引入方式

```javascript
// ==UserScript==
// @require https://update.greasyfork.org/scripts/559089/1714656/background-keep-alive.js
// ==/UserScript==
```

---

### 模块 1: BackgroundTimer

基于 Web Worker 的保活定时器，绑定后台环境下不被节流。

```javascript
const timer = new BackgroundTimer(() => {
    console.log('心跳:', new Date().toTimeString());
}, 1000);

timer.start(); // 启动
timer.stop(); // 停止
timer.setInterval(2000); // 动态调整间隔
timer.isRunning(); // 获取状态
timer.destroy(); // 销毁实例
```

---

### 模块 2: AudioKeepAlive

使用静音音频对抗 Chrome 5 分钟强力休眠。

> ⚠️ 需要用户交互后才能启动（浏览器自动播放策略限制）

```javascript
const audio = new AudioKeepAlive();

// 需要在用户交互后启动
document.addEventListener('click', () => audio.start(), { once: true });

audio.stop(); // 停止
audio.isActive(); // 获取状态
audio.destroy(); // 销毁实例
```

---

### 模块 3: NetworkMonitor

Hook Fetch **和 XHR** 监控任务完成状态，使用**防抖 + 活跃计数器**算法。

```javascript
const monitor = new NetworkMonitor({
    // 监控的 URL 模式（包含匹配）
    // 注意：避免使用通用 RPC 方法如 batchexecute，会产生误判
    urlPatterns: ['BardFrontendService', 'StreamGenerate'],

    // 静默判定时间（毫秒）
    silenceThreshold: 3000,

    // 任务完成回调
    onComplete: (ctx) => {
        console.log('任务完成', ctx);
        // ctx = { activeCount, lastUrl, timestamp }
    },

    // 任务开始回调（可选）
    onStart: (ctx) => {
        console.log('任务开始', ctx);
    },

    // DOM 二次验证（可选，自定义）
    domValidation: (ctx) => {
        // 返回 true 表示验证通过，触发 onComplete
        // 返回 false 表示还需等待
        return !document.querySelector('.stop-button');
    },
});

monitor.start(); // 开始监控
monitor.stop(); // 停止监控
monitor.isIdle(); // 是否空闲
monitor.getActiveCount(); // 活跃请求数
monitor.destroy(); // 销毁实例
```

**算法说明**：

1. 记录当前活跃请求数
2. 每次请求开始/结束都重置静默计时器
3. 活跃数为 0 + 静默期结束 + DOM 验证通过 → 触发 onComplete
