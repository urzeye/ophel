/**
 * Platform Abstraction Layer - Type Definitions
 *
 * 定义平台能力接口，用于同时支持浏览器扩展和油猴脚本
 */

/**
 * 存储接口
 */
export interface PlatformStorage {
  /**
   * 获取存储值
   */
  get<T>(key: string): Promise<T | undefined>

  /**
   * 设置存储值
   */
  set<T>(key: string, value: T): Promise<void>

  /**
   * 删除存储值
   */
  remove(key: string): Promise<void>

  /**
   * 监听存储值变化
   * @returns 取消监听的函数
   */
  watch<T>(
    key: string,
    callback: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void
}

/**
 * 网络请求选项
 */
export interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  credentials?: "include" | "omit" | "same-origin"
}

/**
 * 网络请求响应
 */
export interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
  json<T>(): Promise<T>
  blob(): Promise<Blob>
}

/**
 * 通知选项
 */
export interface NotifyOptions {
  title: string
  message: string
  timeout?: number
  silent?: boolean
}

/**
 * 平台能力接口
 */
export interface Platform {
  /**
   * 平台类型标识
   */
  readonly type: "extension" | "userscript"

  /**
   * 存储接口
   */
  readonly storage: PlatformStorage

  /**
   * 发起网络请求（绕过 CORS）
   */
  fetch(url: string, options?: FetchOptions): Promise<FetchResponse>

  /**
   * 发送桌面通知
   */
  notify(options: NotifyOptions): void

  /**
   * 聚焦当前标签页/窗口
   */
  focusWindow(): void

  /**
   * 打开新标签页
   */
  openTab(url: string): void

  /**
   * 检查是否有某个可选能力
   */
  hasCapability(cap: PlatformCapability): boolean
}

/**
 * 平台可选能力
 */
export type PlatformCapability =
  | "cookies" // 读写 cookies
  | "permissions" // 动态权限
  | "tabs" // 跨标签页操作
  | "declarativeNetRequest" // 网络请求规则
