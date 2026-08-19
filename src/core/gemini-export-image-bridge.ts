// Gemini 导出全尺寸图片捕获桥：isolated world 适配器与 MAIN world 拦截脚本
// 之间的 window.postMessage 协议常量。
//
// 协议约定：
// - 适配器在导出准备期间设置 GEMINI_EXPORT_CAPTURING_ATTR，MAIN world 依赖该属性
//   同步判断是否抑制页面下载 anchor 的默认行为（避免触发真实文件下载）。
// - 每张生成图开启一个带 captureId 的捕获窗口（START/STOP），MAIN world 只把
//   解码后尺寸严格大于窗口下限的候选图回发为 CAPTURED 消息；不发送失败消息。
export const GEMINI_EXPORT_CAPTURE_START_MESSAGE = "OPHEL_GEMINI_CAPTURE_START"
export const GEMINI_EXPORT_CAPTURE_STOP_MESSAGE = "OPHEL_GEMINI_CAPTURE_STOP"
export const GEMINI_EXPORT_IMAGE_CAPTURED_MESSAGE = "OPHEL_GEMINI_IMAGE_CAPTURED"

export const GEMINI_EXPORT_CAPTURING_ATTR = "data-ophel-export-capturing"
