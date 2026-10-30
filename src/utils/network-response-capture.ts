/**
 * 页面请求响应订阅（isolated world 侧），站无关通用机制。
 *
 * main world 的 NetworkMonitor（src/core/network-monitor.ts）按规则把页面自己发出的请求响应
 * 转发回来，适用于「页面本身会请求、我们只需复用其数据」的场景（如 Qwen Studio 对话列表）。
 *
 * 站点接入契约（详见 docs/developer/architecture.md「页面响应转发」）：
 * 1. 站点 origin 必须在 src/contents/monitor-entry.ts 的 matches 中（油猴端由入口统一初始化）；
 * 2. 规则 id 由站点保证唯一，建议 `{siteId}:{用途}`；只转发同源、method 与 pathname 都命中的 2xx 响应；
 * 3. 响应体是不可信文本（同窗口脚本可伪造消息），由站点自行解析与校验；
 * 4. 订阅与站点数据消费方同生命周期，取消订阅时注销规则。
 */

import {
  EVENT_MONITOR_CAPTURE_REGISTER,
  EVENT_MONITOR_CAPTURE_UNREGISTER,
  EVENT_MONITOR_READY,
  EVENT_MONITOR_RESPONSE,
  type MonitorCaptureUnregisterPayload,
  type MonitorResponseCaptureRule,
  type MonitorResponsePayload,
} from "~utils/messaging"

/**
 * 注册转发规则并订阅命中的响应，返回取消订阅函数（同时注销规则）。
 * main world 监听晚于本次注册就绪时会广播 EVENT_MONITOR_READY，这里据此重发注册，
 * 不依赖两侧脚本的加载顺序。
 */
export function subscribeNetworkResponses(
  rule: MonitorResponseCaptureRule,
  onResponse: (response: MonitorResponsePayload) => void,
): () => void {
  const register = () => {
    window.postMessage({ type: EVENT_MONITOR_CAPTURE_REGISTER, payload: rule }, "*")
  }

  const handleMessage = (event: MessageEvent) => {
    // 油猴沙箱中 event.source 可能是代理对象，改用 origin 排除跨源 iframe（与 TabManager 一致）
    if (event.origin !== window.location.origin) return

    const { type, payload } = event.data || {}
    if (type === EVENT_MONITOR_READY) {
      register()
      return
    }
    if (type !== EVENT_MONITOR_RESPONSE) return

    const response = payload as Partial<MonitorResponsePayload> | undefined
    if (response?.captureId !== rule.id || typeof response.body !== "string") return
    onResponse(response as MonitorResponsePayload)
  }

  window.addEventListener("message", handleMessage)
  register()

  return () => {
    window.removeEventListener("message", handleMessage)
    const payload: MonitorCaptureUnregisterPayload = { id: rule.id }
    window.postMessage({ type: EVENT_MONITOR_CAPTURE_UNREGISTER, payload }, "*")
  }
}
