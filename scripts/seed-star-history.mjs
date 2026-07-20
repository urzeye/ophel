import { execSync } from "child_process"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const DATA_FILE = join(ROOT, "docs", "data", "stars.json")
const SVG_LIGHT = join(ROOT, "docs", "media", "star-chart", "stars.svg")
const SVG_DARK = join(ROOT, "docs", "media", "star-chart", "stars-dark.svg")

const OWNER = "urzeye"
const REPO = "ophel"

// ── 拉取 star 时间 ───────────────────────────────

function fetchStarDates() {
  console.log("拉取所有 star 时间...")
  let all = []
  let page = 1

  while (true) {
    const result = execSync(
      `gh api repos/${OWNER}/${REPO}/stargazers -H "Accept: application/vnd.github.v3.star+json" --paginate --jq '.[]|.starred_at' --page ${page}`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 },
    )
    const dates = result.trim().split("\n").filter(Boolean)
    all.push(...dates)
    if (dates.length < 100) break
    page++
  }

  console.log(`  获取到 ${all.length} 条 star 记录`)
  return all
}

// ── 按天聚合为累计数 ─────────────────────────────

function aggregateByDay(dates) {
  const byDay = {}
  for (const d of dates) {
    const day = d.slice(0, 10) // "2026-01-23"
    byDay[day] = (byDay[day] || 0) + 1
  }

  const sorted = Object.keys(byDay).sort()
  let cum = 0
  const data = []
  for (const day of sorted) {
    cum += byDay[day]
    data.push({ date: day, count: cum })
  }
  return data
}

// ── SVG 生成（与 generate-star-chart.mjs 一致）────

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

  const pts = data.map((d, i) => `${i === 0 ? "M" : "L"}${fmt(x(d))},${fmt(y(d))}`)
  const line = pts.join("")
  const area =
    data.length > 1
      ? `${line} L${fmt(x(data[data.length - 1]))},${PAD.top + IH} L${fmt(x(data[0]))},${PAD.top + IH} Z`
      : ""

  const yTicks = []
  for (let i = 0; i <= 3; i++) {
    const val = Math.round(yMin + (yRange * i) / 3)
    const fy = PAD.top + IH - ((val - yMin) / yRange) * IH
    yTicks.push({ val, y: fy })
  }

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

  ${yTicks.map((t) => `<line x1="${fmt(PAD.left)}" y1="${fmt(t.y)}" x2="${W - PAD.right}" y2="${fmt(t.y)}" stroke="${C.grid}" stroke-width="1"/>`).join("\n  ")}

  ${yTicks.map((t) => `<text x="${PAD.left - 10}" y="${fmt(t.y)}" text-anchor="end" dominant-baseline="central" fill="${C.text}" class="axis">${t.val}</text>`).join("\n  ")}

  ${area ? `<path d="${area}" fill="url(#g)" stroke="none"/>` : ""}

  ${data.length > 1 ? `<path d="${line}" fill="none" stroke="${C.line}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` : ""}

  ${data
    .map((d, i) => {
      const px = x(d),
        py = y(d)
      const showDot =
        data.length <= 8 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 8) === 0
      return showDot ? `<circle cx="${fmt(px)}" cy="${fmt(py)}" r="2.5" fill="${C.dot}"/>` : ""
    })
    .join("\n  ")}

  <circle cx="${fmt(x(latest))}" cy="${fmt(y(latest))}" r="4" fill="${C.dot}" stroke="${C.bg}" stroke-width="2"/>

  ${xLabels.map((l) => `<text x="${fmt(l.x)}" y="${H - 14}" text-anchor="middle" fill="${C.text}" class="axis">${formatDate(l.date)}</text>`).join("\n  ")}

  <text x="${PAD.left}" y="16" fill="${C.title}" class="title">Star History</text>

  <rect x="${fmt(x(latest) - 28)}" y="${fmt(y(latest) - 32)}" width="56" height="22" rx="11" fill="${C.badgeBg}" stroke="${C.line}" stroke-width="1.2"/>
  <text x="${fmt(x(latest))}" y="${fmt(y(latest) - 17)}" text-anchor="middle" fill="${C.badgeFg}" class="badge">★ ${latest.count}</text>
</svg>`
}

// ── 主流程 ────────────────────────────────────────

const dates = fetchStarDates()
const data = aggregateByDay(dates)

const dir = dirname(DATA_FILE)
if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))

const assetDir = dirname(SVG_LIGHT)
if (!existsSync(assetDir)) mkdirSync(assetDir, { recursive: true })
writeFileSync(SVG_LIGHT, generateSvg(data, false))
writeFileSync(SVG_DARK, generateSvg(data, true))

console.log(
  `数据文件已生成: ${data.length} 个数据点, 最早 ${data[0].date}, 最新 ${data[data.length - 1].date}, ${data[data.length - 1].count} ★`,
)
