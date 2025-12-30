// ==UserScript==
// @name         domToolkit
// @namespace    http://tampermonkey.net/
// @version      1.1.4
// @description  DOM 工具库：Shadow DOM 穿透、异步元素查找、事件委托、样式注入
// @description:en  DOM Toolkit: Shadow DOM traversal, async element query, event delegation, style injection
// @author       urzeye
// @match        *://*/*
// @license      MIT
// ==/UserScript==

/**
 * ============================================================================
 * DOMToolkit - 通用 DOM 操作工具库
 * ============================================================================
 *
 * 专为 Tampermonkey 脚本设计的高性能 DOM 工具库，解决以下痛点：
 * 1. Shadow DOM 穿透查找（现代 Web 组件难题）
 * 2. 异步等待元素出现（动态渲染页面）
 * 3. 持续监听新元素（SPA 应用）
 * 4. 事件委托（减少事件绑定开销）
 * 5. 样式注入（支持 Shadow DOM）
 */

(function () {
    'use strict';

    // ============================================================================
    // 常量与配置
    // ============================================================================

    const CONFIG = {
        MAX_DEPTH: 15, // Shadow DOM 最大递归深度
        DEFAULT_TIMEOUT: 5000, // 异步查找默认超时时间 (ms)
        POLL_INTERVAL: 50, // 轮询间隔 (ms)
        CACHE_TTL: 300000, // 缓存过期时间 (5分钟)
    };

    const NODE_TYPES = {
        ELEMENT: 1,
        DOCUMENT: 9,
        FRAGMENT: 11,
    };

    // ============================================================================
    // 工具函数
    // ============================================================================

    const Utils = {
        /**
         * 验证节点是否有效
         */
        isValidContext(node) {
            return node && Object.values(NODE_TYPES).includes(node.nodeType);
        },

        /**
         * 检查元素是否可见
         */
        isVisible(element) {
            return element && element.offsetParent !== null;
        },

        /**
         * 检查元素是否连接到 DOM
         */
        isConnected(element) {
            return element && element.isConnected;
        },

        /**
         * 创建清理任务管理器
         */
        createCleanupManager() {
            const tasks = new Set();
            return {
                add(task) {
                    tasks.add(task);
                    return () => tasks.delete(task);
                },
                execute() {
                    tasks.forEach((task) => {
                        try {
                            task();
                        } catch (e) {
                            console.error('[DOMToolkit] Cleanup error:', e);
                        }
                    });
                    tasks.clear();
                },
                get size() {
                    return tasks.size;
                },
            };
        },
    };

    // ============================================================================
    // 缓存系统
    // ============================================================================

    /**
     * 基于 WeakMap 的内存安全缓存
     * Key 为父节点，Value 为 Map<selector, element>
     */
    class DOMCache {
        #enabled = true;
        #ttl;
        #store = new WeakMap();
        #timestamps = new WeakMap();

        constructor(ttl = CONFIG.CACHE_TTL) {
            this.#ttl = ttl;
        }

        setEnabled(enabled) {
            this.#enabled = enabled;
        }

        get(parent, selector) {
            if (!this.#enabled) return null;

            const contextMap = this.#store.get(parent);
            const timeMap = this.#timestamps.get(parent);
            if (!contextMap || !timeMap) return null;

            const node = contextMap.get(selector);
            if (!node) return null;

            // TTL 检查
            const ts = timeMap.get(selector);
            if (Date.now() - ts > this.#ttl) {
                contextMap.delete(selector);
                timeMap.delete(selector);
                return null;
            }

            // 连接状态检查
            if (!Utils.isConnected(node)) {
                contextMap.delete(selector);
                timeMap.delete(selector);
                return null;
            }

            return node;
        }

        set(parent, selector, node) {
            if (!this.#enabled || !node) return;

            let contextMap = this.#store.get(parent);
            let timeMap = this.#timestamps.get(parent);

            if (!contextMap) {
                contextMap = new Map();
                this.#store.set(parent, contextMap);
            }

            if (!timeMap) {
                timeMap = new Map();
                this.#timestamps.set(parent, timeMap);
            }

            contextMap.set(selector, node);
            timeMap.set(selector, Date.now());
        }

        clear() {
            this.#store = new WeakMap();
            this.#timestamps = new WeakMap();
        }
    }

    // ============================================================================
    // 共享 Observer 管理器
    // ============================================================================

    /**
     * 共享 MutationObserver 管理器
     * 多个监听任务共享同一个 Observer，避免性能问题
     */
    class SharedObserverManager {
        #observers = new Map(); // Key: Node, Value: { observer, callbacks, refCount }

        /**
         * 获取或创建针对特定根节点的共享 Observer
         */
        getSharedObserver(rootNode) {
            if (!this.#observers.has(rootNode)) {
                const callbacks = new Set();
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const addedNode of mutation.addedNodes) {
                            if (addedNode.nodeType === NODE_TYPES.ELEMENT) {
                                callbacks.forEach((cb) => {
                                    try {
                                        cb(addedNode, mutation);
                                    } catch (e) {
                                        console.error('[DOMToolkit] Observer callback error:', e);
                                    }
                                });
                            }
                        }
                    }
                });

                observer.observe(rootNode, { childList: true, subtree: true });

                this.#observers.set(rootNode, {
                    observer,
                    callbacks,
                    refCount: 0,
                });
            }

            const manager = this.#observers.get(rootNode);
            manager.refCount++;

            return {
                addCallback: (cb) => manager.callbacks.add(cb),
                removeCallback: (cb) => {
                    manager.callbacks.delete(cb);
                    manager.refCount--;
                    if (manager.refCount === 0) {
                        manager.observer.disconnect();
                        this.#observers.delete(rootNode);
                    }
                },
            };
        }

        /**
         * 销毁所有 Observer
         */
        destroy() {
            this.#observers.forEach(({ observer }) => observer.disconnect());
            this.#observers.clear();
        }
    }

    // ============================================================================
    // 核心类：DOMToolkit
    // ============================================================================

    class DOMToolkit {
        #cache;
        #observerManager;
        #win;
        #doc;

        constructor() {
            this.#win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            this.#doc = this.#win.document;
            this.#cache = new DOMCache();
            this.#observerManager = new SharedObserverManager();
        }

        // ===================== 配置 =====================

        /**
         * 配置缓存
         * @param {{ enabled?: boolean }} options
         */
        configCache(options = {}) {
            if (typeof options.enabled === 'boolean') {
                this.#cache.setEnabled(options.enabled);
            }
        }

        /**
         * 清除缓存
         */
        clearCache() {
            this.#cache.clear();
        }

        // ===================== 同步查询 =====================

        /**
         * 同步查询 DOM 元素（支持 Shadow DOM 穿透）
         *
         * @param {string|string[]} selector - CSS 选择器（单个或多个）
         * @param {Object} options - 查询选项
         * @param {Node} options.parent - 查询起点，默认 document
         * @param {boolean} options.all - 是否返回所有匹配，默认 false
         * @param {boolean} options.shadow - 是否穿透 Shadow DOM，默认 true
         * @param {number} options.maxDepth - 最大递归深度，默认 15
         * @param {boolean} options.useCache - 是否使用缓存，默认 true
         * @param {function(Element): boolean} options.filter - 自定义过滤函数，返回 true 表示匹配
         * @returns {Element|Element[]|null}
         *
         * @example
         * // 查找单个元素
         * const btn = DOMToolkit.query('button.submit');
         *
         * // 查找所有匹配元素
         * const items = DOMToolkit.query('.item', { all: true });
         *
         * // 在 Shadow DOM 中查找
         * const input = DOMToolkit.query('input.main', { shadow: true });
         *
         * // 使用自定义过滤函数
         * const textarea = DOMToolkit.query('[contenteditable]', {
         *     shadow: true,
         *     filter: (el) => el.offsetParent !== null && !el.closest('#my-panel')
         * });
         */
        query(selector, options = {}) {
            const {
                parent = this.#doc,
                all = false,
                shadow = true,
                maxDepth = CONFIG.MAX_DEPTH,
                useCache = true,
                filter = null, // 自定义过滤函数
            } = options;

            const selectors = Array.isArray(selector) ? selector : [selector];

            // 有 filter 时禁用缓存（结果取决于动态状态）
            const shouldCache = useCache && !filter;

            // 尝试从缓存获取（仅单元素查询且无 filter）
            if (!all && shouldCache && selectors.length === 1) {
                const cached = this.#cache.get(parent, selectors[0]);
                if (cached) return cached;
            }

            // 先在主文档中查找
            for (const sel of selectors) {
                try {
                    if (all) {
                        const candidates = Array.from(parent.querySelectorAll(sel));
                        const results = filter ? candidates.filter(filter) : candidates;
                        if (shadow) {
                            this.#collectInShadow(parent, sel, results, 0, maxDepth, filter);
                        }
                        if (results.length > 0) return results;
                    } else {
                        const candidates = parent.querySelectorAll(sel);
                        for (const el of candidates) {
                            if (!filter || filter(el)) {
                                if (shouldCache) this.#cache.set(parent, sel, el);
                                return el;
                            }
                        }
                    }
                } catch (e) {
                    // 选择器无效，跳过
                }
            }

            // 如果未找到且启用 Shadow DOM 穿透，递归搜索
            if (shadow && !all) {
                const found = this.#findInShadow(parent, selectors, 0, maxDepth, filter);
                if (found && shouldCache && selectors.length === 1) {
                    this.#cache.set(parent, selectors[0], found);
                }
                return found;
            }

            return all ? [] : null;
        }

        /**
         * 在 Shadow DOM 中递归查找元素（返回第一个匹配）
         * @private
         */
        #findInShadow(root, selectors, depth, maxDepth, filter = null) {
            if (depth > maxDepth) return null;

            // 在当前层级的 Shadow DOM 中查找
            if (root !== this.#doc && root.querySelectorAll) {
                for (const sel of selectors) {
                    try {
                        const candidates = root.querySelectorAll(sel);
                        for (const el of candidates) {
                            if (!filter || filter(el)) {
                                return el;
                            }
                        }
                    } catch (e) {}
                }
            }

            // 递归遍历子元素的 Shadow Root
            const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (const el of elements) {
                if (el.shadowRoot) {
                    const found = this.#findInShadow(el.shadowRoot, selectors, depth + 1, maxDepth, filter);
                    if (found) return found;
                }
            }

            return null;
        }

        /**
         * 在 Shadow DOM 中递归收集所有匹配元素
         * @private
         */
        #collectInShadow(root, selector, results, depth, maxDepth, filter = null) {
            if (depth > maxDepth) return;

            // 在当前层级的 Shadow DOM 中收集
            if (root !== this.#doc && root.querySelectorAll) {
                try {
                    const candidates = root.querySelectorAll(selector);
                    for (const el of candidates) {
                        if (!results.includes(el) && (!filter || filter(el))) {
                            results.push(el);
                        }
                    }
                } catch (e) {}
            }

            // 递归遍历子元素的 Shadow Root
            const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
            for (const el of elements) {
                if (el.shadowRoot) {
                    this.#collectInShadow(el.shadowRoot, selector, results, depth + 1, maxDepth, filter);
                }
            }
        }

        // ===================== 异步查询 =====================

        /**
         * 异步获取元素（等待元素出现）
         *
         * @param {string|string[]} selector - CSS 选择器
         * @param {Object} options - 查询选项
         * @param {Node} options.parent - 查询起点
         * @param {number} options.timeout - 超时时间（毫秒），0 表示无限等待
         * @param {boolean} options.shadow - 是否穿透 Shadow DOM
         * @param {function(Element): boolean} options.filter - 自定义过滤函数
         * @returns {Promise<Element|Element[]|null>}
         *
         * @example
         * // 等待元素出现
         * const modal = await DOMToolkit.get('.modal', { timeout: 5000 });
         *
         * // 等待多个选择器中的任意一个
         * const btn = await DOMToolkit.get(['button.submit', 'input[type="submit"]']);
         *
         * // 等待满足条件的元素
         * const input = await DOMToolkit.get('[contenteditable]', {
         *     filter: (el) => el.offsetParent !== null
         * });
         */
        async get(selector, options = {}) {
            const { parent = this.#doc, timeout = CONFIG.DEFAULT_TIMEOUT, shadow = true, filter = null } = options;

            // 先尝试同步查找
            const found = this.query(selector, { parent, shadow, filter });
            if (found) return found;

            // 异步等待
            return new Promise((resolve) => {
                const cleanup = Utils.createCleanupManager();
                const startTime = Date.now();

                // 超时处理
                let timer;
                if (timeout > 0) {
                    timer = setTimeout(() => {
                        cleanup.execute();
                        resolve(null);
                    }, timeout);
                    cleanup.add(() => clearTimeout(timer));
                }

                // 轮询检查
                const poll = () => {
                    if (timeout > 0 && Date.now() - startTime >= timeout) return;

                    const result = this.query(selector, { parent, shadow, filter });
                    if (result) {
                        cleanup.execute();
                        resolve(result);
                        return;
                    }

                    const nextTimer = setTimeout(poll, CONFIG.POLL_INTERVAL);
                    cleanup.add(() => clearTimeout(nextTimer));
                };

                // 同时使用 MutationObserver 加速检测
                const selectors = Array.isArray(selector) ? selector : [selector];
                const observerHandle = this.#observerManager.getSharedObserver(parent);

                const callback = (addedNode) => {
                    for (const sel of selectors) {
                        try {
                            if (addedNode.matches && addedNode.matches(sel)) {
                                if (!filter || filter(addedNode)) {
                                    cleanup.execute();
                                    resolve(addedNode);
                                    return;
                                }
                            }
                            if (addedNode.querySelectorAll) {
                                const candidates = addedNode.querySelectorAll(sel);
                                for (const el of candidates) {
                                    if (!filter || filter(el)) {
                                        cleanup.execute();
                                        resolve(el);
                                        return;
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                };

                observerHandle.addCallback(callback);
                cleanup.add(() => observerHandle.removeCallback(callback));

                // 启动轮询
                poll();
            });
        }

        // ===================== 持续监听 =====================

        /**
         * 持续处理现在和未来所有匹配的元素
         *
         * @param {string} selector - CSS 选择器
         * @param {function(Element, boolean): void|false} callback - 回调函数，参数 (element, isNew)，返回 false 停止观察
         * @param {Object} options - 选项
         * @param {Node} options.parent - 查询起点
         * @param {boolean} options.shadow - 是否穿透 Shadow DOM
         * @returns {function(): void} - 调用此函数可手动停止观察
         *
         * @example
         * // 处理所有（现有和未来的）按钮
         * const stop = DOMToolkit.each('button.action', (btn, isNew) => {
         *     btn.style.color = 'blue';
         *     if (isNew) console.log('New button added');
         * });
         *
         * // 稍后停止监听
         * stop();
         */
        each(selector, callback, options = {}) {
            const { parent = this.#doc, shadow = true } = options;

            if (typeof callback !== 'function') {
                console.error('[DOMToolkit] each: callback must be a function');
                return () => {};
            }

            const processed = new WeakSet();
            let active = true;

            const processNode = (node, isNew) => {
                if (!active || processed.has(node)) return;
                processed.add(node);

                try {
                    if (callback(node, isNew) === false) {
                        stop();
                    }
                } catch (e) {
                    console.error('[DOMToolkit] each callback error:', e);
                    stop();
                }
            };

            // 处理现有元素
            const existing = this.query(selector, { parent, all: true, shadow });
            existing.forEach((node) => processNode(node, false));

            // 监听新元素
            const observerHandle = this.#observerManager.getSharedObserver(parent);

            // Shadow DOM 监听相关
            const watchedRoots = new WeakSet();
            const shadowObserverHandles = [];

            // 先定义 observerCallback，以便 watchShadowRoot 可以引用
            const observerCallback = (addedNode) => {
                if (!active) return;

                try {
                    // 检查新增节点本身
                    if (addedNode.matches && addedNode.matches(selector)) {
                        processNode(addedNode, true);
                    }

                    // 检查新增节点的子元素
                    if (addedNode.querySelectorAll) {
                        addedNode.querySelectorAll(selector).forEach((node) => processNode(node, true));
                    }

                    // 如果启用 Shadow DOM，还要检查 Shadow Root
                    if (shadow) {
                        // 检查新增节点的 Shadow Root
                        if (addedNode.shadowRoot) {
                            watchShadowRoot(addedNode.shadowRoot);
                            this.#eachInShadow(addedNode.shadowRoot, selector, processNode);
                        }
                        // 递归检查子节点的 Shadow Root
                        if (addedNode.querySelectorAll) {
                            addedNode.querySelectorAll('*').forEach((el) => {
                                if (el.shadowRoot) {
                                    watchShadowRoot(el.shadowRoot);
                                    this.#eachInShadow(el.shadowRoot, selector, processNode);
                                }
                            });
                        }
                    }
                } catch (e) {}
            };

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

            observerHandle.addCallback(observerCallback);

            const stop = () => {
                if (!active) return;
                active = false;
                observerHandle.removeCallback(observerCallback);
                // 清理所有 Shadow Root 的监听
                shadowObserverHandles.forEach((handle) => {
                    handle.removeCallback(observerCallback);
                });
            };

            return stop;
        }

        // ===================== 元素监控 =====================

        /**
         * 监控特定元素的变化（对 MutationObserver 的封装，支持防抖）
         *
         * @param {Element} element - 目标元素
         * @param {function(MutationRecord[], MutationObserver): void} callback - 回调函数
         * @param {Object} options - 选项
         * @param {number} options.debounce - 防抖时间 (ms)，默认 0 (不防抖)
         * @param {boolean} options.childList - 观察子节点增删，默认 true
         * @param {boolean} options.attributes - 观察属性变化，默认 true
         * @param {boolean} options.characterData - 观察文本内容变化，默认 false
         * @param {boolean} options.subtree - 观察后代节点，默认 false
         * @param {string[]} options.attributeFilter - 要观察的属性名数组
         * @returns {function(): void} - 停止监控的函数
         *
         * @example
         * // 监控文本变化，防抖 500ms
         * const stop = DOMToolkit.watch(element, () => console.log('Changed!'), {
         *     characterData: true,
         *     subtree: true,
         *     debounce: 500
         * });
         */
        watch(element, callback, options = {}) {
            const { debounce = 0, childList = true, attributes = true, characterData = false, subtree = false, attributeFilter } = options;

            if (!Utils.isValidContext(element)) {
                console.error('[DOMToolkit] watch: invalid element');
                return () => {};
            }

            let timeoutId = null;
            const handler = (mutations, observer) => {
                if (debounce > 0) {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        try {
                            callback(mutations, observer);
                        } catch (e) {
                            console.error('[DOMToolkit] watch callback error:', e);
                        }
                    }, debounce);
                } else {
                    try {
                        callback(mutations, observer);
                    } catch (e) {
                        console.error('[DOMToolkit] watch callback error:', e);
                    }
                }
            };

            const observer = new MutationObserver(handler);
            observer.observe(element, {
                childList,
                attributes,
                characterData,
                subtree,
                attributeFilter,
            });

            return () => {
                if (timeoutId) clearTimeout(timeoutId);
                observer.disconnect();
            };
        }

        /**
         * 共享监听多个子元素的变化
         *
         * @param {Element} container - 容器元素
         * @param {Object} options - 配置
         * @param {number} options.debounce - 防抖时间 (ms)，默认 0
         * @param {boolean} options.characterData - 监听文本变化，默认 true
         * @param {boolean} options.childList - 监听子节点变化，默认 true
         * @param {boolean} options.attributes - 监听属性变化，默认 false
         * @returns {{ add: (element, callback) => void, remove: (element) => void, stop: () => void }}
         *
         * @example
         * // 创建共享监听器
         * const watcher = DOMToolkit.watchMultiple(listContainer, { debounce: 500 });
         *
         * // 添加要监听的元素
         * watcher.add(titleElement1, () => console.log('Title 1 changed'));
         * watcher.add(titleElement2, () => console.log('Title 2 changed'));
         *
         * // 移除监听
         * watcher.remove(titleElement1);
         *
         * // 停止所有监听
         * watcher.stop();
         */
        watchMultiple(container, options = {}) {
            const { debounce = 0, characterData = true, childList = true, attributes = false } = options;

            if (!Utils.isValidContext(container)) {
                console.error('[DOMToolkit] watchMultiple: invalid container');
                return { add: () => {}, remove: () => {}, stop: () => {} };
            }

            const targets = new Map(); // element -> callback
            let timeoutId = null;
            let pendingElements = new Set(); // 收集防抖期间的变化元素

            const triggerCallbacks = () => {
                pendingElements.forEach((el) => {
                    const cb = targets.get(el);
                    if (cb) {
                        try {
                            cb(el);
                        } catch (e) {
                            console.error('[DOMToolkit] watchMultiple callback error:', e);
                        }
                    }
                });
                pendingElements.clear();
            };

            const observer = new MutationObserver((mutations) => {
                // 找出哪些注册的元素发生了变化
                for (const mutation of mutations) {
                    let node = mutation.target;
                    // 向上查找匹配的注册元素
                    while (node && node !== container) {
                        if (targets.has(node)) {
                            pendingElements.add(node);
                            break;
                        }
                        node = node.parentNode;
                    }
                }

                if (pendingElements.size === 0) return;

                // 防抖处理
                if (debounce > 0) {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = setTimeout(triggerCallbacks, debounce);
                } else {
                    triggerCallbacks();
                }
            });

            observer.observe(container, { characterData, childList, attributes, subtree: true });

            return {
                add: (element, callback) => targets.set(element, callback),
                remove: (element) => targets.delete(element),
                stop: () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    observer.disconnect();
                    targets.clear();
                },
            };
        }

        /**
         * 在 Shadow DOM 中递归处理元素
         * @private
         */
        #eachInShadow(root, selector, processNode, depth = 0) {
            if (depth > CONFIG.MAX_DEPTH) return;

            try {
                root.querySelectorAll(selector).forEach((node) => processNode(node, true));
            } catch (e) {}

            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                if (el.shadowRoot) {
                    this.#eachInShadow(el.shadowRoot, selector, processNode, depth + 1);
                }
            }
        }

        // ===================== 事件委托 =====================

        /**
         * 事件委托（支持现在和未来的元素）
         *
         * @param {string} eventName - 事件名称，如 'click'
         * @param {string} selector - 目标元素选择器
         * @param {function(Event, Element): void} callback - 事件回调
         * @param {Object} options - 选项
         * @param {Node} options.parent - 委托起点
         * @param {boolean} options.capture - 是否捕获阶段
         * @returns {function(): void} - 调用此函数可移除事件监听
         *
         * @example
         * // 委托点击事件
         * const remove = DOMToolkit.on('click', '.item', (event, target) => {
         *     console.log('Item clicked:', target);
         * });
         *
         * // 稍后移除
         * remove();
         */
        on(eventName, selector, callback, options = {}) {
            const { parent = this.#doc, capture = false } = options;

            const handler = (event) => {
                // 使用 composedPath 处理 Shadow DOM 中的事件
                const path = event.composedPath ? event.composedPath() : [event.target];

                for (const target of path) {
                    if (target === parent || target === this.#win) break;

                    try {
                        if (target.matches && target.matches(selector)) {
                            callback(event, target);
                            return;
                        }
                    } catch (e) {}
                }

                // 回退：使用 closest
                try {
                    const target = event.target.closest(selector);
                    if (target && parent.contains(target)) {
                        callback(event, target);
                    }
                } catch (e) {}
            };

            parent.addEventListener(eventName, handler, capture);

            return () => parent.removeEventListener(eventName, handler, capture);
        }

        // ===================== 元素创建 =====================

        /**
         * 创建 DOM 元素
         *
         * @param {string} tag - 标签名
         * @param {Object} attributes - 属性对象
         * @param {string} textContent - 文本内容
         * @returns {HTMLElement}
         *
         * @example
         * const btn = DOMToolkit.create('button', { className: 'primary', id: 'submit' }, 'Submit');
         */
        create(tag, attributes = {}, textContent = '') {
            const element = this.#doc.createElement(tag);

            for (const [key, value] of Object.entries(attributes)) {
                if (key === 'className') {
                    element.className = value;
                } else if (key === 'style' && typeof value === 'object') {
                    Object.assign(element.style, value);
                } else if (key === 'style') {
                    element.setAttribute('style', value);
                } else if (key === 'dataset' && typeof value === 'object') {
                    Object.assign(element.dataset, value);
                } else if (key.startsWith('on') && typeof value === 'function') {
                    element.addEventListener(key.slice(2).toLowerCase(), value);
                } else {
                    element.setAttribute(key, value);
                }
            }

            if (textContent) element.textContent = textContent;

            return element;
        }

        /**
         * 从 HTML 字符串创建元素
         *
         * @param {string} htmlString - HTML 字符串
         * @param {Object} options - 选项
         * @param {Element} options.parent - 如果指定，自动追加到父元素
         * @param {boolean} options.mapIds - 如果为 true，返回包含所有 id 元素的映射对象
         * @returns {Element|{[key: string]: Element}|null}
         *
         * @example
         * // 创建单个元素
         * const div = DOMToolkit.createFromHTML('<div class="card"><p>Hello</p></div>');
         *
         * // 创建并获取 ID 映射
         * const { container, title, content } = DOMToolkit.createFromHTML(`
         *     <div id="container">
         *         <h1 id="title">Title</h1>
         *         <p id="content">Content</p>
         *     </div>
         * `, { mapIds: true });
         */
        createFromHTML(htmlString, options = {}) {
            const { parent = null, mapIds = false } = options;

            const template = this.#doc.createElement('template');
            template.innerHTML = htmlString.trim();
            const node = template.content.firstElementChild;

            if (!node) return null;

            if (parent instanceof Element) {
                parent.appendChild(node);
            }

            if (mapIds) {
                const map = { root: node };
                if (node.id) map[node.id] = node;
                node.querySelectorAll('[id]').forEach((el) => {
                    if (el.id) map[el.id] = el;
                });
                return map;
            }

            return node;
        }

        /**
         * 清空元素内容
         *
         * @param {Element} element - 目标元素
         */
        clear(element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        }

        // ===================== 样式注入 =====================

        /**
         * 向页面注入 CSS 样式
         *
         * @param {string} cssText - CSS 样式文本
         * @param {string} id - Style 标签 ID（防止重复注入）
         * @returns {HTMLStyleElement}
         *
         * @example
         * DOMToolkit.css('.highlight { background: yellow; }', 'my-styles');
         */
        css(cssText, id = null) {
            if (id) {
                const existing = this.#doc.getElementById(id);
                if (existing) {
                    if (existing.textContent !== cssText) {
                        existing.textContent = cssText;
                    }
                    return existing;
                }
            }

            const style = this.#doc.createElement('style');
            if (id) style.id = id;
            style.textContent = cssText;
            this.#doc.head.appendChild(style);
            return style;
        }

        /**
         * 向 Shadow DOM 注入 CSS 样式
         *
         * @param {ShadowRoot} shadowRoot - 目标 Shadow Root
         * @param {string} cssText - CSS 样式文本
         * @param {string} id - Style 标签 ID
         * @returns {HTMLStyleElement|null}
         */
        cssToShadow(shadowRoot, cssText, id = null) {
            if (!shadowRoot) return null;

            try {
                if (id) {
                    const existing = shadowRoot.getElementById(id);
                    if (existing) {
                        if (existing.textContent !== cssText) {
                            existing.textContent = cssText;
                        }
                        return existing;
                    }
                }

                const style = this.#doc.createElement('style');
                if (id) style.id = id;
                style.textContent = cssText;
                shadowRoot.appendChild(style);
                return style;
            } catch (e) {
                // Closed shadow root
                return null;
            }
        }

        /**
         * 向所有 Shadow DOM 注入 CSS 样式
         *
         * @param {string} cssText - CSS 样式文本
         * @param {string} id - Style 标签 ID
         * @param {Object} options - 选项
         * @param {Node} options.root - 遍历起点
         * @param {function(Element): boolean} options.filter - 过滤函数，返回 false 跳过该 Shadow Host
         * @returns {number} 注入的 Shadow Root 数量
         *
         * @example
         * // 向所有 Shadow DOM 注入样式
         * DOMToolkit.cssToAllShadows('.custom { color: red; }', 'my-shadow-styles');
         *
         * // 排除侧边栏
         * DOMToolkit.cssToAllShadows(css, 'id', {
         *     filter: (host) => !host.closest('.sidebar')
         * });
         */
        cssToAllShadows(cssText, id, options = {}) {
            const { root = this.#doc.body, filter = null } = options;

            if (!root) return 0;

            let count = 0;

            const walk = (node) => {
                if (node.shadowRoot) {
                    // 应用过滤器
                    if (filter && !filter(node)) {
                        // 跳过这个 Shadow Host，但继续遍历内部
                    } else {
                        this.cssToShadow(node.shadowRoot, cssText, id);
                        count++;
                    }

                    // 递归遍历 Shadow DOM 内部
                    walk(node.shadowRoot);
                }

                // 遍历子节点
                const children = node.children || node.childNodes;
                for (let i = 0; i < children.length; i++) {
                    if (children[i].nodeType === NODE_TYPES.ELEMENT) {
                        walk(children[i]);
                    }
                }
            };

            walk(root);
            return count;
        }

        // ===================== Shadow DOM 遍历 =====================

        /**
         * 遍历所有 Shadow Root
         *
         * @param {function(ShadowRoot, Element): void} callback - 回调函数，参数 (shadowRoot, host)
         * @param {Object} options - 选项
         * @param {Node} options.root - 遍历起点
         * @param {number} options.maxDepth - 最大深度
         *
         * @example
         * DOMToolkit.walkShadowRoots((shadowRoot, host) => {
         *     console.log('Found shadow root on:', host.tagName);
         * });
         */
        walkShadowRoots(callback, options = {}) {
            const { root = this.#doc.body, maxDepth = CONFIG.MAX_DEPTH } = options;

            if (!root) return;

            const walk = (node, depth) => {
                if (depth > maxDepth) return;

                if (node.shadowRoot) {
                    try {
                        callback(node.shadowRoot, node);
                    } catch (e) {
                        console.error('[DOMToolkit] walkShadowRoots callback error:', e);
                    }
                    walk(node.shadowRoot, depth + 1);
                }

                const children = node.children || node.childNodes;
                for (let i = 0; i < children.length; i++) {
                    if (children[i].nodeType === NODE_TYPES.ELEMENT) {
                        walk(children[i], depth);
                    }
                }
            };

            walk(root, 0);
        }

        /**
         * 查找可滚动容器（支持 Shadow DOM）
         *
         * @param {Object} options - 选项
         * @param {Node} options.root - 搜索起点
         * @param {string[]} options.selectors - 自定义选择器列表（优先匹配）
         * @param {number} options.minOverflow - 最小溢出高度（px）
         * @returns {Element|null}
         *
         * @example
         * // 使用默认逻辑（Shadow DOM 优先，然后是 documentElement/body）
         * const scroller = DOMToolkit.findScrollContainer();
         *
         * // 提供站点特定的选择器
         * const scroller = DOMToolkit.findScrollContainer({
         *     selectors: ['.chat-mode-scroller', '.conversation-container']
         * });
         */
        findScrollContainer(options = {}) {
            const {
                root = this.#doc,
                selectors = [], // 由调用方提供，不再硬编码
                minOverflow = 100,
            } = options;

            // 1. 优先尝试用户提供的选择器
            for (const sel of selectors) {
                const el = this.#doc.querySelector(sel);
                if (el && el.scrollHeight > el.clientHeight) {
                    return el;
                }
            }

            // 2. 在 Shadow DOM 中查找
            const findInShadow = (node, depth) => {
                if (depth > CONFIG.MAX_DEPTH) return null;

                const elements = node.querySelectorAll ? node.querySelectorAll('*') : [];
                for (const el of elements) {
                    if (el.scrollHeight > el.clientHeight + minOverflow) {
                        const style = this.#win.getComputedStyle(el);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                            return el;
                        }
                    }

                    if (el.shadowRoot) {
                        const found = findInShadow(el.shadowRoot, depth + 1);
                        if (found) return found;
                    }
                }
                return null;
            };

            const fromShadow = findInShadow(root, 0);
            if (fromShadow) return fromShadow;

            // 3. 回退到 documentElement 或 body（通用逻辑）
            if (this.#doc.documentElement.scrollHeight > this.#doc.documentElement.clientHeight) {
                return this.#doc.documentElement;
            }

            return this.#doc.body;
        }

        // ===================== 销毁 =====================

        /**
         * 销毁实例，释放资源
         */
        destroy() {
            this.#observerManager.destroy();
            this.#cache.clear();
        }
    }

    // ============================================================================
    // 导出到全局
    // ============================================================================

    if (typeof window !== 'undefined') {
        // 创建单例实例
        if (!window.DOMToolkit) {
            window.DOMToolkit = new DOMToolkit();
        }

        // 同时导出类，允许用户创建自己的实例
        window.DOMToolkitClass = DOMToolkit;
    }

    console.log('[DOMToolkit] v1.1.0 Loaded');
})();
