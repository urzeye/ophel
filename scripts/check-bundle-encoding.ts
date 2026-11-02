/**
 * 扩展产物编码检查（在 plasmo build 之后运行，命中即构建失败）
 *
 * Chrome 扩展加载器用 base::IsStringUTF8 校验内容脚本，拒绝 Unicode
 * noncharacter（U+FDD0..U+FDEF 及所有以 0xFFFE/0xFFFF 结尾的码点，见 chromium
 * base/strings/utf_string_conversion_utils.h 的 IsValidCharacter）。命中即
 * 整个扩展拒绝安装（"It isn't UTF-8 encoded"），macOS Chrome 实测触发。
 *
 * Parcel 会把依赖源码字符串里的 \uFFFF 等转义重打印为字面字符，
 * 且是否重打印取决于其内部管线路径，无法从配置控制。依赖侧的触发点通过
 * pnpm patch 根治（见 patches/），本脚本只做构建期冒烟：任何回潮直接报错。
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const buildRoot = path.resolve(process.cwd(), "build")

const isNoncharacter = (cp: number): boolean =>
  (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe

const findNoncharacters = (file: string): string[] => {
  const content = fs.readFileSync(file, "utf-8")
  const found = new Set<string>()
  for (const char of content) {
    const cp = char.codePointAt(0) as number
    if (isNoncharacter(cp)) found.add(`U+${cp.toString(16).toUpperCase()}`)
  }
  return [...found]
}

const collectJsFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectJsFiles(fullPath)
    return entry.name.endsWith(".js") ? [fullPath] : []
  })
}

if (!fs.existsSync(buildRoot)) {
  console.log("[check-bundle-encoding] build/ does not exist, skipped")
  process.exit(0)
}

let violations = 0

// 只检查扩展产物目录（chrome-mv3-prod / firefox-mv3-prod 等）；
// 油猴产物由 esbuild 输出，也不受 Chrome 扩展加载器校验
for (const entry of fs.readdirSync(buildRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.includes("-mv3-")) continue

  for (const file of collectJsFiles(path.join(buildRoot, entry.name))) {
    const found = findNoncharacters(file)
    if (found.length === 0) continue
    violations++
    console.error(
      `[check-bundle-encoding] ${path.relative(process.cwd(), file)} contains Unicode noncharacter(s): ${found.join(", ")}`,
    )
  }
}

if (violations > 0) {
  console.error(
    "[check-bundle-encoding] Chrome refuses to load extensions whose content scripts " +
      "contain noncharacters. Check which dependency reintroduced the escape.",
  )
  process.exit(1)
}

console.log("[check-bundle-encoding] OK")
