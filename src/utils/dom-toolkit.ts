/**
 * DOMToolkit - 通用 DOM 操作工具库
 *
 * 核心功能：
 * 1. Shadow DOM 穿透查找
 * 2. 异步等待元素出现
 * 3. 持续监听新元素
 * 4. 元素变化监控
 */

// ============================================================================
// 常量与配置
// ============================================================================

const CONFIG = {
  MAX_DEPTH: 15,
  DEFAULT_TIMEOUT: 5000,
  POLL_INTERVAL: 50,
  CACHE_TTL: 300000,
}

const NODE_TYPES = {
  ELEMENT: 1,
  DOCUMENT: 9,
  FRAGMENT: 11,
}

// ============================================================================
// 类型定义
// ============================================================================

export interface QueryOptions {
  parent?: Node
  all?: boolean
  shadow?: boolean
  maxDepth?: number
  useCache?: boolean
  filter?: (el: Element) => boolean
}

export interface GetOptions {
  parent?: Node
  timeout?: number
  shadow?: boolean
  filter?: (el: Element) => boolean
}

export interface EachOptions {
  parent?: Node
  shadow?: boolean
}

export interface WatchOptions {
  debounce?: number
  childList?: boolean
  attributes?: boolean
  characterData?: boolean
  subtree?: boolean
  attributeFilter?: string[]
}

export interface WatchMultipleOptions {
  debounce?: number
  characterData?: boolean
  childList?: boolean
  attributes?: boolean
}

export interface CreateOptions {
  parent?: Node | null
  mapIds?: boolean
}

export interface EventOptions {
  parent?: Node
  capture?: boolean
}

export interface ScrollContainerOptions {
  root?: Node
  selectors?: string[]
  minOverflow?: number
}

// ============================================================================
// 工具函数
// ============================================================================

const Utils = {
  isValidContext(node: Node | null): boolean {
    return node !== null && Object.values(NODE_TYPES).includes(node.nodeType)
  },

  isVisible(element: Element): boolean {
    return element && (element as HTMLElement).offsetParent !== null
  },

  isConnected(element: Element): boolean {
    return element && element.isConnected
  },

  createCleanupManager() {
    const tasks = new Set<() => void>()
    return {
      add(task: () => void) {
        tasks.add(task)
        return () => tasks.delete(task)
      },
      execute() {
        tasks.forEach((task) => {
          try {
            task()
          } catch (error) {
            console.error("[DOMToolkit] Cleanup error:", error)
          }
        })
        tasks.clear()
      },
      get size() {
        return tasks.size
      },
    }
  },
}

// ============================================================================
// 缓存系统
// ============================================================================

class DOMCache {
  private enabled = true
  private ttl: number
  private store = new WeakMap<Node, Map<string, Element>>()
  private timestamps = new WeakMap<Node, Map<string, number>>()

  constructor(ttl = CONFIG.CACHE_TTL) {
    this.ttl = ttl
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  get(parent: Node, selector: string): Element | null {
    if (!this.enabled) return null

    const contextMap = this.store.get(parent)
    const timeMap = this.timestamps.get(parent)
    if (!contextMap || !timeMap) return null

    const node = contextMap.get(selector)
    if (!node) return null

    // TTL 检查
    const ts = timeMap.get(selector)
    if (ts && Date.now() - ts > this.ttl) {
      contextMap.delete(selector)
      timeMap.delete(selector)
      return null
    }

    // 连接状态检查
    if (!Utils.isConnected(node)) {
      contextMap.delete(selector)
      timeMap.delete(selector)
      return null
    }

    return node
  }

  set(parent: Node, selector: string, node: Element) {
    if (!this.enabled || !node) return

    let contextMap = this.store.get(parent)
    let timeMap = this.timestamps.get(parent)

    if (!contextMap) {
      contextMap = new Map()
      this.store.set(parent, contextMap)
    }

    if (!timeMap) {
      timeMap = new Map()
      this.timestamps.set(parent, timeMap)
    }

    contextMap.set(selector, node)
    timeMap.set(selector, Date.now())
  }

  clear() {
    this.store = new WeakMap()
    this.timestamps = new WeakMap()
  }
}

// ============================================================================
// 共享 Observer 管理器
// ============================================================================

interface ObserverEntry {
  observer: MutationObserver
  callbacks: Set<(node: Node, mutation: MutationRecord) => void>
  refCount: number
}

class SharedObserverManager {
  private observers = new Map<Node, ObserverEntry>()

  getSharedObserver(rootNode: Node) {
    if (!this.observers.has(rootNode)) {
      const callbacks = new Set<(node: Node, mutation: MutationRecord) => void>()
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const addedNode of mutation.addedNodes) {
            if (addedNode.nodeType === NODE_TYPES.ELEMENT) {
              callbacks.forEach((cb) => {
                try {
                  cb(addedNode, mutation)
                } catch (error) {
                  console.error("[DOMToolkit] Observer callback error:", error)
                }
              })
            }
          }
        }
      })

      observer.observe(rootNode, { childList: true, subtree: true })

      this.observers.set(rootNode, {
        observer,
        callbacks,
        refCount: 0,
      })
    }

    const manager = this.observers.get(rootNode)!
    manager.refCount++

    return {
      addCallback: (cb: (node: Node, mutation: MutationRecord) => void) =>
        manager.callbacks.add(cb),
      removeCallback: (cb: (node: Node, mutation: MutationRecord) => void) => {
        manager.callbacks.delete(cb)
        manager.refCount--
        if (manager.refCount === 0) {
          manager.observer.disconnect()
          this.observers.delete(rootNode)
        }
      },
    }
  }

  destroy() {
    this.observers.forEach(({ observer }) => observer.disconnect())
    this.observers.clear()
  }
}

// ============================================================================
// 核心类：DOMToolkit
// ============================================================================

class DOMToolkitClass {
  private cache: DOMCache
  private observerManager: SharedObserverManager
  private doc: Document

  constructor() {
    this.doc = document
    this.cache = new DOMCache()
    this.observerManager = new SharedObserverManager()
  }

  // ===================== 配置 =====================

  configCache(options: { enabled?: boolean } = {}) {
    if (typeof options.enabled === "boolean") {
      this.cache.setEnabled(options.enabled)
    }
  }

  clearCache() {
    this.cache.clear()
  }

  // ===================== 同步查询 =====================

  /**
   * 同步查询 DOM 元素（支持 Shadow DOM 穿透）
   */
  query(selector: string | string[], options: QueryOptions = {}): Element | Element[] | null {
    const {
      parent = this.doc,
      all = false,
      shadow = true,
      maxDepth = CONFIG.MAX_DEPTH,
      useCache = true,
      filter = null,
    } = options

    const selectors = Array.isArray(selector) ? selector : [selector]
    const shouldCache = useCache && !filter

    // 尝试从缓存获取
    if (!all && shouldCache && selectors.length === 1) {
      const cached = this.cache.get(parent, selectors[0])
      if (cached) return cached
    }

    // 在主文档中查找
    for (const sel of selectors) {
      try {
        if (all) {
          const candidates = Array.from((parent as ParentNode).querySelectorAll(sel))
          const results = filter ? candidates.filter(filter) : [...candidates]
          if (shadow) {
            this.collectInShadow(parent, sel, results, 0, maxDepth, filter)
          }
          if (results.length > 0) return results
        } else {
          const candidates = (parent as ParentNode).querySelectorAll(sel)
          for (const el of candidates) {
            if (!filter || filter(el)) {
              if (shouldCache) this.cache.set(parent, sel, el)
              return el
            }
          }
        }
      } catch {
        // 选择器无效，跳过
      }
    }

    // Shadow DOM 穿透搜索
    if (shadow && !all) {
      const found = this.findInShadow(parent, selectors, 0, maxDepth, filter)
      if (found && shouldCache && selectors.length === 1) {
        this.cache.set(parent, selectors[0], found)
      }
      return found
    }

    return all ? [] : null
  }

  private findInShadow(
    root: Node,
    selectors: string[],
    depth: number,
    maxDepth: number,
    filter: ((el: Element) => boolean) | null,
  ): Element | null {
    if (depth > maxDepth) return null

    if (root !== this.doc && (root as ParentNode).querySelectorAll) {
      for (const sel of selectors) {
        try {
          const candidates = (root as ParentNode).querySelectorAll(sel)
          for (const el of candidates) {
            if (!filter || filter(el)) {
              return el
            }
          }
        } catch {}
      }
    }

    const elements = (root as ParentNode).querySelectorAll
      ? (root as ParentNode).querySelectorAll("*")
      : []
    for (const el of elements) {
      if (el.shadowRoot) {
        const found = this.findInShadow(el.shadowRoot, selectors, depth + 1, maxDepth, filter)
        if (found) return found
      }
    }

    return null
  }

  private collectInShadow(
    root: Node,
    selector: string,
    results: Element[],
    depth: number,
    maxDepth: number,
    filter: ((el: Element) => boolean) | null,
  ) {
    if (depth > maxDepth) return

    if (root !== this.doc && (root as ParentNode).querySelectorAll) {
      try {
        const candidates = (root as ParentNode).querySelectorAll(selector)
        for (const el of candidates) {
          if (!results.includes(el) && (!filter || filter(el))) {
            results.push(el)
          }
        }
      } catch {}
    }

    const elements = (root as ParentNode).querySelectorAll
      ? (root as ParentNode).querySelectorAll("*")
      : []
    for (const el of elements) {
      if (el.shadowRoot) {
        this.collectInShadow(el.shadowRoot, selector, results, depth + 1, maxDepth, filter)
      }
    }
  }

  // ===================== 异步查询 =====================

  /**
   * 异步获取元素（等待元素出现）
   */
  async get(selector: string | string[], options: GetOptions = {}): Promise<Element | null> {
    const {
      parent = this.doc,
      timeout = CONFIG.DEFAULT_TIMEOUT,
      shadow = true,
      filter = null,
    } = options

    // 先尝试同步查找
    const found = this.query(selector, { parent, shadow, filter })
    if (found && !Array.isArray(found)) return found

    // 异步等待
    return new Promise((resolve) => {
      const cleanup = Utils.createCleanupManager()
      const startTime = Date.now()

      // 超时处理
      let timer: ReturnType<typeof setTimeout>
      if (timeout > 0) {
        timer = setTimeout(() => {
          cleanup.execute()
          resolve(null)
        }, timeout)
        cleanup.add(() => clearTimeout(timer))
      }

      // 轮询检查
      const poll = () => {
        if (timeout > 0 && Date.now() - startTime >= timeout) return

        const result = this.query(selector, { parent, shadow, filter })
        if (result && !Array.isArray(result)) {
          cleanup.execute()
          resolve(result)
          return
        }

        const nextTimer = setTimeout(poll, CONFIG.POLL_INTERVAL)
        cleanup.add(() => clearTimeout(nextTimer))
      }

      // 使用 MutationObserver 加速检测
      const selectors = Array.isArray(selector) ? selector : [selector]
      const observerHandle = this.observerManager.getSharedObserver(parent as Node)

      const callback = (addedNode: Node) => {
        for (const sel of selectors) {
          try {
            if ((addedNode as Element).matches?.(sel)) {
              if (!filter || filter(addedNode as Element)) {
                cleanup.execute()
                resolve(addedNode as Element)
                return
              }
            }
            if ((addedNode as ParentNode).querySelectorAll) {
              const candidates = (addedNode as ParentNode).querySelectorAll(sel)
              for (const el of candidates) {
                if (!filter || filter(el)) {
                  cleanup.execute()
                  resolve(el)
                  return
                }
              }
            }
          } catch {}
        }
      }

      observerHandle.addCallback(callback)
      cleanup.add(() => observerHandle.removeCallback(callback))

      poll()
    })
  }

  // ===================== 持续监听 =====================

  /**
   * 持续处理现在和未来所有匹配的元素
   */
  each(
    selector: string,
    callback: (el: Element, isNew: boolean) => void | false,
    options: EachOptions = {},
  ): () => void {
    const { parent = this.doc, shadow = true } = options

    if (typeof callback !== "function") {
      console.error("[DOMToolkit] each: callback must be a function")
      return () => {}
    }

    const processed = new WeakSet<Element>()
    let active = true

    const processNode = (node: Element, isNew: boolean) => {
      if (!active || processed.has(node)) return
      processed.add(node)

      try {
        if (callback(node, isNew) === false) {
          stop()
        }
      } catch (error) {
        console.error("[DOMToolkit] each callback error:", error)
        stop()
      }
    }

    // 处理现有元素
    const existing = this.query(selector, {
      parent,
      all: true,
      shadow,
    }) as Element[]
    existing.forEach((node) => processNode(node, false))

    // 监听新元素
    const observerHandle = this.observerManager.getSharedObserver(parent as Node)

    const observerCallback = (addedNode: Node) => {
      if (!active) return

      try {
        if ((addedNode as Element).matches?.(selector)) {
          processNode(addedNode as Element, true)
        }

        if ((addedNode as ParentNode).querySelectorAll) {
          ;(addedNode as ParentNode)
            .querySelectorAll(selector)
            .forEach((node) => processNode(node, true))
        }
      } catch {}
    }

    observerHandle.addCallback(observerCallback)

    const stop = () => {
      if (!active) return
      active = false
      observerHandle.removeCallback(observerCallback)
    }

    return stop
  }

  // ===================== 元素监控 =====================

  /**
   * 监控特定元素的变化
   */
  watch(
    element: Element,
    callback: (mutations: MutationRecord[], observer: MutationObserver) => void,
    options: WatchOptions = {},
  ): () => void {
    const {
      debounce = 0,
      childList = true,
      attributes = true,
      characterData = false,
      subtree = false,
      attributeFilter,
    } = options

    if (!Utils.isValidContext(element)) {
      console.error("[DOMToolkit] watch: invalid element")
      return () => {}
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const handler = (mutations: MutationRecord[], observer: MutationObserver) => {
      if (debounce > 0) {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          try {
            callback(mutations, observer)
          } catch (error) {
            console.error("[DOMToolkit] watch callback error:", error)
          }
        }, debounce)
      } else {
        try {
          callback(mutations, observer)
        } catch (error) {
          console.error("[DOMToolkit] watch callback error:", error)
        }
      }
    }

    const observer = new MutationObserver(handler)
    observer.observe(element, {
      childList,
      attributes,
      characterData,
      subtree,
      attributeFilter,
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      observer.disconnect()
    }
  }

  /**
   * 共享监听多个子元素的变化
   */
  watchMultiple(container: Node, options: WatchMultipleOptions = {}) {
    const { debounce = 0, characterData = true, childList = true, attributes = false } = options

    if (!Utils.isValidContext(container)) {
      console.error("[DOMToolkit] watchMultiple: invalid container")
      return { add: () => {}, remove: () => {}, stop: () => {} }
    }

    const targets = new Map<Node, (el: Node) => void>()
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const pendingElements = new Set<Node>()

    const triggerCallbacks = () => {
      pendingElements.forEach((el) => {
        const cb = targets.get(el)
        if (cb) {
          try {
            cb(el)
          } catch (error) {
            console.error("[DOMToolkit] watchMultiple callback error:", error)
          }
        }
      })
      pendingElements.clear()
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        let node: Node | null = mutation.target
        while (node && node !== container) {
          if (targets.has(node)) {
            pendingElements.add(node)
            break
          }
          node = node.parentNode
        }
      }

      if (pendingElements.size === 0) return

      if (debounce > 0) {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(triggerCallbacks, debounce)
      } else {
        triggerCallbacks()
      }
    })

    observer.observe(container, {
      characterData,
      childList,
      attributes,
      subtree: true,
    })

    return {
      add: (element: Node, callback: (el: Node) => void) => targets.set(element, callback),
      remove: (element: Node) => targets.delete(element),
      stop: () => {
        if (timeoutId) clearTimeout(timeoutId)
        observer.disconnect()
        targets.clear()
      },
    }
  }

  // ===================== 事件委托 =====================

  /**
   * 事件委托（支持现在和未来的元素）
   */
  on(
    eventName: string,
    selector: string,
    callback: (event: Event, target: Element) => void,
    options: EventOptions = {},
  ): () => void {
    const { parent = this.doc, capture = false } = options

    const handler = (event: Event) => {
      // 使用 composedPath 处理 Shadow DOM 中的事件
      const path = event.composedPath ? event.composedPath() : [event.target as Node]

      for (const target of path) {
        if (target === parent || target === window) break

        try {
          if ((target as Element).matches?.(selector)) {
            callback(event, target as Element)
            return
          }
        } catch {}
      }

      // 回退：使用 closest
      try {
        const target = (event.target as Element).closest?.(selector)
        if (target && parent.contains(target)) {
          callback(event, target)
        }
      } catch {}
    }

    parent.addEventListener(eventName, handler, capture)

    return () => parent.removeEventListener(eventName, handler, capture)
  }

  // ===================== 元素创建 =====================

  /**
   * 创建 DOM 元素
   */
  create(tag: string, attributes: Record<string, any> = {}, textContent = ""): HTMLElement {
    const element = this.doc.createElement(tag)

    for (const [key, value] of Object.entries(attributes)) {
      if (key === "className") {
        element.className = value
      } else if (key === "style" && typeof value === "object") {
        Object.assign(element.style, value)
      } else if (key === "style") {
        element.setAttribute("style", value)
      } else if (key === "dataset" && typeof value === "object") {
        Object.assign(element.dataset, value)
      } else if (key.startsWith("on") && typeof value === "function") {
        element.addEventListener(key.slice(2).toLowerCase(), value)
      } else {
        element.setAttribute(key, value)
      }
    }

    if (textContent) element.textContent = textContent

    return element
  }

  /**
   * 从 HTML 字符串创建元素
   */
  createFromHTML(
    htmlString: string,
    options: CreateOptions = {},
  ): Element | Record<string, Element> | null {
    const { parent = null, mapIds = false } = options

    const template = this.doc.createElement("template")
    template.innerHTML = htmlString.trim()
    const node = template.content.firstElementChild

    if (!node) return null

    if (parent instanceof Element) {
      parent.appendChild(node)
    }

    if (mapIds) {
      const map: Record<string, Element> = { root: node }
      if (node.id) map[node.id] = node
      node.querySelectorAll("[id]").forEach((el) => {
        if (el.id) map[el.id] = el
      })
      return map
    }

    return node
  }

  /**
   * 清空元素内容
   */
  clear(element: Element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild)
    }
  }

  // ===================== 样式注入 =====================

  /**
   * 向页面注入 CSS 样式
   */
  css(cssText: string, id: string | null = null): HTMLStyleElement {
    if (id) {
      const existing = this.doc.getElementById(id)
      if (existing) {
        if (existing.textContent !== cssText) {
          existing.textContent = cssText
        }
        return existing as HTMLStyleElement
      }
    }

    const style = this.doc.createElement("style")
    if (id) style.id = id
    style.textContent = cssText
    this.doc.head.appendChild(style)
    return style
  }

  /**
   * 向 Shadow DOM 注入 CSS 样式
   */
  cssToShadow(
    shadowRoot: ShadowRoot,
    cssText: string,
    id: string | null = null,
  ): HTMLStyleElement | null {
    if (!shadowRoot) return null

    try {
      if (id) {
        const existing = shadowRoot.getElementById(id)
        if (existing) {
          if (existing.textContent !== cssText) {
            existing.textContent = cssText
          }
          return existing as HTMLStyleElement
        }
      }

      const style = this.doc.createElement("style")
      if (id) style.id = id
      style.textContent = cssText
      shadowRoot.appendChild(style)
      return style
    } catch {
      // Closed shadow root
      return null
    }
  }

  /**
   * 向所有 Shadow DOM 注入 CSS 样式
   */
  cssToAllShadows(
    cssText: string,
    id: string | null,
    options: { root?: Node; filter?: (el: Element) => boolean } = {},
  ): number {
    const { root = this.doc.body, filter = null } = options

    if (!root) return 0

    let count = 0

    const walk = (node: Node) => {
      if ((node as Element).shadowRoot) {
        // 应用过滤器
        if (filter && !filter(node as Element)) {
          // 跳过这个 Shadow Host，但继续遍历内部
        } else {
          try {
            this.cssToShadow((node as Element).shadowRoot!, cssText, id)
            count++
          } catch {}
        }

        // 递归遍历 Shadow DOM 内部
        try {
          walk((node as Element).shadowRoot!)
        } catch {}
      }

      // 遍历子节点
      const children = node.childNodes
      for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === NODE_TYPES.ELEMENT) {
          walk(children[i])
        }
      }
    }

    walk(root)
    return count
  }

  // ===================== Shadow DOM 遍历 =====================

  /**
   * 遍历所有 Shadow Root
   */
  walkShadowRoots(
    callback: (shadowRoot: ShadowRoot, host: Element) => void,
    options: { root?: Node; maxDepth?: number } = {},
  ) {
    const { root = this.doc.body, maxDepth = CONFIG.MAX_DEPTH } = options

    if (!root) return

    const walk = (node: Node, depth: number) => {
      if (depth > maxDepth) return

      if ((node as Element).shadowRoot) {
        try {
          callback((node as Element).shadowRoot!, node as Element)
        } catch (error) {
          console.error("[DOMToolkit] walkShadowRoots callback error:", error)
        }
        try {
          walk((node as Element).shadowRoot!, depth + 1)
        } catch {}
      }

      const children = node.childNodes
      for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === NODE_TYPES.ELEMENT) {
          walk(children[i], depth)
        }
      }
    }

    walk(root, 0)
  }

  /**
   * 查找可滚动容器（支持 Shadow DOM）
   */
  findScrollContainer(options: ScrollContainerOptions = {}): Element | null {
    const { root = this.doc, selectors = [], minOverflow = 100 } = options

    // 1. 优先尝试用户提供的选择器
    for (const sel of selectors) {
      const el = (this.doc as ParentNode).querySelector(sel)
      if (el && el.scrollHeight > el.clientHeight) {
        return el
      }
    }

    // 2. 在 Shadow DOM 中查找
    const findInShadow = (node: Node, depth: number): Element | null => {
      if (depth > CONFIG.MAX_DEPTH) return null

      const elements = (node as ParentNode).querySelectorAll
        ? (node as ParentNode).querySelectorAll("*")
        : []

      for (const el of elements) {
        if (el.scrollHeight > el.clientHeight + minOverflow) {
          const style = window.getComputedStyle(el)
          if (
            style.overflowY === "auto" ||
            style.overflowY === "scroll" ||
            style.overflow === "auto" ||
            style.overflow === "scroll"
          ) {
            return el
          }
        }

        if (el.shadowRoot) {
          const found = findInShadow(el.shadowRoot, depth + 1)
          if (found) return found
        }
      }
      return null
    }

    const fromShadow = findInShadow(root, 0)
    if (fromShadow) return fromShadow

    // 3. 回退到 documentElement 或 body
    if (this.doc.documentElement.scrollHeight > this.doc.documentElement.clientHeight) {
      return this.doc.documentElement
    }

    return this.doc.body
  }

  // ===================== 销毁 =====================

  destroy() {
    this.observerManager.destroy()
    this.cache.clear()
  }
}

// 导出单例实例
export const DOMToolkit = new DOMToolkitClass()
