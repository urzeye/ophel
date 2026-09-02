/**
 * UTF-8 安全的 base64 编码。
 *
 * 原生 btoa 只接受 Latin1 字符，用户名/密码中含中文或特殊符号时
 * 会直接抛 InvalidCharacterError；先 URI 编码把字符折叠进 Latin1 区间。
 */
export function btoaUtf8(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
}
