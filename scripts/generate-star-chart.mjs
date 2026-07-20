import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const DATA_FILE = join(ROOT, "docs", "data", "stars.json")
const SVG_LIGHT = join(ROOT, "docs", "media", "star-chart", "stars.svg")
const SVG_DARK = join(ROOT, "docs", "media", "star-chart", "stars-dark.svg")

// ── 数据操作 ──────────────────────────────────────

function readData() {
  if (!existsSync(DATA_FILE)) return []
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"))
  } catch {
    return []
  }
}

function writeData(data) {
  const dir = dirname(DATA_FILE)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

// ── SVG 生成 ──────────────────────────────────────

function fmt(n) {
  return n.toFixed(1)
}

function formatDate(d) {
  const t = new Date(d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`
}

function generateSvg(data, dark) {
  const W = 800
  const H = 280
  const PAD = { top: 24, right: 44, bottom: 44, left: 56 }
  const IW = W - PAD.left - PAD.right
  const IH = H - PAD.top - PAD.bottom

  const C = {
    bg: dark ? "#0d1117" : "#ffffff",
    line: dark ? "#58a6ff" : "#3b82f6",
    fill: dark ? "rgba(88,166,255,0.12)" : "rgba(59,130,246,0.12)",
    text: dark ? "#8b949e" : "#94a3b8",
    grid: dark ? "#21262d" : "#f1f5f9",
    dot: dark ? "#58a6ff" : "#3b82f6",
    badgeBg: dark ? "#161b22" : "#eff6ff",
    badgeFg: dark ? "#58a6ff" : "#3b82f6",
    title: dark ? "#c9d1d9" : "#1e293b",
  }

  const counts = data.map((d) => d.count)
  const maxC = Math.max(...counts)
  const minC = Math.min(...counts)
  const pad = Math.max((maxC - minC) * 0.15, 5)
  const yMin = Math.max(0, Math.floor((minC - pad) / 10) * 10)
  const yMax = Math.ceil((maxC + pad) / 10) * 10
  const yRange = yMax - yMin || 1

  const dates = data.map((d) => new Date(d.date))
  const dMin = dates[0]
  const dMax = dates[dates.length - 1]
  const dRange = dMax - dMin || 1

  const x = (d) => PAD.left + ((new Date(d.date) - dMin) / dRange) * IW
  const y = (d) => PAD.top + IH - ((d.count - yMin) / yRange) * IH

  // 折线路径
  const pts = data.map((d, i) => `${i === 0 ? "M" : "L"}${fmt(x(d))},${fmt(y(d))}`)
  const line = pts.join("")
  const area =
    data.length > 1
      ? `${line} L${fmt(x(data[data.length - 1]))},${PAD.top + IH} L${fmt(x(data[0]))},${PAD.top + IH} Z`
      : ""

  // Y 轴刻度（4 个）
  const yTicks = []
  for (let i = 0; i <= 3; i++) {
    const val = Math.round(yMin + (yRange * i) / 3)
    const fy = PAD.top + IH - ((val - yMin) / yRange) * IH
    yTicks.push({ val, y: fy })
  }

  // X 轴标签（最多 ~7 个）
  const xLabels = []
  const step = Math.max(1, Math.floor(data.length / 6))
  for (let i = 0; i < data.length; i += step) xLabels.push({ date: data[i].date, x: x(data[i]) })
  const last = data[data.length - 1]
  if (xLabels.length === 0 || xLabels[xLabels.length - 1].date !== last.date) {
    xLabels.push({ date: last.date, x: x(last) })
  }

  const latest = data[data.length - 1]

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.line}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${C.line}" stop-opacity="0.02"/>
    </linearGradient>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; }
      text.title { font-size: 13px; font-weight: 600; }
      text.axis  { font-size: 10px; }
      text.badge { font-size: 11px; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.bg}"/>

  <!-- 网格线 -->
  ${yTicks.map((t) => `<line x1="${fmt(PAD.left)}" y1="${fmt(t.y)}" x2="${W - PAD.right}" y2="${fmt(t.y)}" stroke="${C.grid}" stroke-width="1"/>`).join("\n  ")}

  <!-- Y 轴标签 -->
  ${yTicks.map((t) => `<text x="${PAD.left - 10}" y="${fmt(t.y)}" text-anchor="end" dominant-baseline="central" fill="${C.text}" class="axis">${t.val}</text>`).join("\n  ")}

  <!-- 面积填充 -->
  ${area ? `<path d="${area}" fill="url(#g)" stroke="none"/>` : ""}

  <!-- 折线 -->
  ${data.length > 1 ? `<path d="${line}" fill="none" stroke="${C.line}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` : ""}

  <!-- 数据点 -->
  ${data
    .map((d, i) => {
      if (
        data.length <= 8 ||
        i === 0 ||
        i === data.length - 1 ||
        i % Math.ceil(data.length / 8) === 0
      ) {
        return `<circle cx="${fmt(x(d))}" cy="${fmt(y(d))}" r="2.5" fill="${C.dot}"/>`
      }
      return ""
    })
    .filter(Boolean)
    .join("\n  ")}

  <!-- 最新数据点（大） -->
  <circle cx="${fmt(x(latest))}" cy="${fmt(y(latest))}" r="4" fill="${C.dot}" stroke="${C.bg}" stroke-width="2"/>

  <!-- X 轴标签 -->
  ${xLabels.map((l) => `<text x="${fmt(l.x)}" y="${H - 14}" text-anchor="middle" fill="${C.text}" class="axis">${formatDate(l.date)}</text>`).join("\n  ")}

  <!-- 标题 -->
  <text x="${PAD.left}" y="16" fill="${C.title}" class="title">Star History</text>

  <!-- 最新计数徽章 -->
  <rect x="${fmt(x(latest) - 28)}" y="${fmt(y(latest) - 32)}" width="56" height="22" rx="11" fill="${C.badgeBg}" stroke="${C.line}" stroke-width="1.2"/>
  <text x="${fmt(x(latest))}" y="${fmt(y(latest) - 17)}" text-anchor="middle" fill="${C.badgeFg}" class="badge">★ ${latest.count}</text>
</svg>`
}

// ── 主流程 ────────────────────────────────────────

const data = readData()
const today = new Date().toISOString().split("T")[0]
const count = parseInt(process.env.STAR_COUNT, 10)

if (!count || Number.isNaN(count)) {
  console.error("STAR_COUNT 环境变量为必填项")
  process.exit(1)
}

const existing = data.find((d) => d.date === today)
if (existing) {
  existing.count = count
} else {
  data.push({ date: today, count })
}

writeData(data)

const dir = dirname(SVG_LIGHT)
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

writeFileSync(SVG_LIGHT, generateSvg(data, false))
writeFileSync(SVG_DARK, generateSvg(data, true))

console.log(`图表已生成: ${data.length} 个数据点, 最新 ${today} → ${count} ★`)
