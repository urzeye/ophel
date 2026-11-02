/**
 * 构建产物 JS 编码清理（在 plasmo build 之后运行）
 *
 * 背景：Chrome 扩展加载器用 base::IsStringUTF8 校验内容脚本，该校验拒绝
 * Unicode noncharacter（U+FDD0..U+FDEF 及所有以 0xFFFE/0xFFFF 结尾的码点，
 * 见 chromium base/strings/utf_string_conversion_utils.h 的 IsValidCharacter）。
 * 命中即整个扩展拒绝安装（"It isn't UTF-8 encoded"），macOS Chrome 实测触发。
 *
 * KaTeX Lexer 正则含 \uffff 转义，经 Parcel/SWC 重输出后可能变成字面字符，
 * 是否字面化取决于 bundler 内部管线路径，无法从源码侧稳定控制，因此在构建后
 * 统一把产物中的 noncharacter 改写回转义序列（在字符串/正则字面量内语义等价）。
 *
 * 改写后文件名中的内容 hash 不再与实际内容一致；Chrome 不校验该 hash，
 * 仅作缓存区分用，不影响加载。
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const projectRoot = process.cwd()
const buildRoot = path.resolve(projectRoot, "build")

const isNoncharacter = (cp: number): boolean =>
  (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe

// 用 BMP 转义表示任意码点：astral 码点拆成 UTF-16 代理对两个 \uXXXX，
// 避免 \u{...} 形式在无 u 标志的正则字面量中改变语义
const toEscapeSequence = (cp: number): string => {
  if (cp <= 0xffff) return `\\u${cp.toString(16).padStart(4, "0")}`

  const v = cp - 0x10000
  const high = 0xd800 + (v >> 10)
  const low = 0xdc00 + (v & 0x3ff)
  return `\\u${high.toString(16)}\\u${low.toString(16)}`
}

const escapeNoncharacters = (content: string): { result: string; count: number } => {
  let count = 0
  let result = ""
  for (const char of content) {
    const cp = char.codePointAt(0) as number
    if (!isNoncharacter(cp)) {
      result += char
      continue
    }
    count++
    result += toEscapeSequence(cp)
  }
  return { result, count }
}

const collectJsFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectJsFiles(fullPath)
    return entry.name.endsWith(".js") ? [fullPath] : []
  })
}

if (!fs.existsSync(buildRoot)) {
  console.log("[sanitize-build-output] build/ does not exist, skipped")
  process.exit(0)
}

let fixedFiles = 0
let fixedChars = 0

// 只处理扩展产物目录（chrome-mv3-prod / firefox-mv3-prod 等），跳过油猴产物：
// userscript 由 esbuild 输出，无此问题，也不受 Chrome 扩展加载器校验
for (const entry of fs.readdirSync(buildRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.includes("-mv3-")) continue

  for (const file of collectJsFiles(path.join(buildRoot, entry.name))) {
    const content = fs.readFileSync(file, "utf-8")
    const { result, count } = escapeNoncharacters(content)
    if (count === 0) continue

    fs.writeFileSync(file, result, "utf-8")
    fixedFiles++
    fixedChars += count
    console.log(
      `[sanitize-build-output] Escaped ${count} noncharacter(s) in ${path.relative(projectRoot, file)}`,
    )
  }
}

console.log(
  fixedFiles > 0
    ? `[sanitize-build-output] Fixed ${fixedChars} noncharacter(s) across ${fixedFiles} file(s)`
    : "[sanitize-build-output] No noncharacters found in extension bundles",
)
