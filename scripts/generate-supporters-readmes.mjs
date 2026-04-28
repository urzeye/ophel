import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const projectRoot = process.cwd()
const dataPath = path.resolve(projectRoot, "docs/data/supporters.json")
const markerStart = "<!-- supporters:start -->"
const markerEnd = "<!-- supporters:end -->"
const readmeConfigs = [
  {
    file: "README.md",
    featuredTitle: "### 💖 Angel Support",
    supportersTitle: "### 🌟 Supporters",
  },
  {
    file: "README_zh-CN.md",
    featuredTitle: "### 💖 天使投资特别鸣谢",
    supportersTitle: "### 🌟 支持者",
  },
  {
    file: "docs/readmes/README_de.md",
    featuredTitle: "### 💖 Besonderer Dank",
    supportersTitle: "### 🌟 Unterstützer",
  },
  {
    file: "docs/readmes/README_es.md",
    featuredTitle: "### 💖 Agradecimiento especial",
    supportersTitle: "### 🌟 Patrocinadores",
  },
  {
    file: "docs/readmes/README_fr.md",
    featuredTitle: "### 💖 Remerciement special",
    supportersTitle: "### 🌟 Soutiens",
  },
  {
    file: "docs/readmes/README_ja.md",
    featuredTitle: "### 💖 特別な感謝",
    supportersTitle: "### 🌟 支援者",
  },
  {
    file: "docs/readmes/README_ko.md",
    featuredTitle: "### 💖 특별한 감사",
    supportersTitle: "### 🌟 후원자",
  },
  {
    file: "docs/readmes/README_pt-BR.md",
    featuredTitle: "### 💖 Agradecimento especial",
    supportersTitle: "### 🌟 Apoiadores",
  },
  {
    file: "docs/readmes/README_ru.md",
    featuredTitle: "### 💖 Особая благодарность",
    supportersTitle: "### 🌟 Поддержавшие",
  },
  {
    file: "docs/readmes/README_zh-TW.md",
    featuredTitle: "### 💖 天使支持特別鳴謝",
    supportersTitle: "### 🌟 支持者",
  },
]

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function ensureRelativePath(filePath) {
  if (
    filePath.startsWith("./") ||
    filePath.startsWith("../") ||
    filePath.startsWith("http://") ||
    filePath.startsWith("https://")
  ) {
    return filePath
  }

  return `./${filePath}`
}

function resolveAvatarPath(readmePath, avatar) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return avatar
  }

  const absoluteAvatarPath = path.resolve(projectRoot, avatar)
  const relativeAvatarPath = path.relative(path.dirname(readmePath), absoluteAvatarPath)

  return ensureRelativePath(relativeAvatarPath.replaceAll(path.sep, "/"))
}

/**
 * 当 avatar 未设置时，用 DiceBear identicon 按名字+来源+日期生成确定性头像
 * 避免大量 "anonymous" 用户共享同一头像
 */
function getAvatarUrl(name, avatar, source, date, remark) {
  if (avatar) return avatar

  // 特殊处理 anonymous - 提供一个统一的、专属的“神秘守护者”形象
  if (!name || name.toLowerCase() === "anonymous") {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=Lucky&radius=20&backgroundColor=f1f5f9`
  }

  // 即使名字重复，结合源、日期甚至备注(赞助金额/寄语等)，也能保证每个人的机器人独一无二！
  const seed = encodeURIComponent(`${name}|${source || ""}|${date || ""}|${remark || ""}`)
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&radius=20&backgroundColor=f1f5f9`
}

function renderPersonCell(person, readmePath, options = {}) {
  const { width = "14.28%", avatarSize = 84 } = options
  const resolvedAvatar = getAvatarUrl(
    person.name,
    person.avatar,
    person.source,
    person.date,
    person.remark,
  )
  const avatarPath = resolveAvatarPath(readmePath, resolvedAvatar)

  const imgHtml = `<img src="${escapeHtml(avatarPath)}" width="${avatarSize}px;" alt="${escapeHtml(person.name)}" />`
  const nameHtml = `<sub><b>${escapeHtml(person.name)}</b></sub>`

  let innerContent = `${imgHtml}<br />\n      ${nameHtml}`
  if (person.url) {
    innerContent = `<a href="${escapeHtml(person.url)}">\n        ${imgHtml}<br />\n        ${nameHtml}\n      </a>`
  }

  return `    <td align="center" valign="top" width="${width}">
      ${innerContent}
    </td>`
}

function chunk(items, size) {
  const rows = []

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }

  return rows
}

function renderFeaturedSection(featuredSupporters, config, readmePath) {
  if (featuredSupporters.length === 0) {
    return ""
  }

  const person = featuredSupporters[0]
  const avatarSize = 100
  const resolvedAvatar = getAvatarUrl(
    person.name,
    person.avatar,
    person.source,
    person.date,
    person.remark,
  )
  const avatarPath = resolveAvatarPath(readmePath, resolvedAvatar)

  const imgHtml = `<img src="${escapeHtml(avatarPath)}" width="${avatarSize}px;" alt="${escapeHtml(person.name)}" />`
  const nameHtml = `<sub><b>${escapeHtml(person.name)}</b></sub>`

  let innerContent = `${imgHtml}<br />\n  ${nameHtml}`
  if (person.url) {
    innerContent = `<a href="${escapeHtml(person.url)}">\n    ${imgHtml}<br />\n    ${nameHtml}\n  </a>`
  }

  return `${config.featuredTitle}\n\n<p align="center">\n  ${innerContent}\n</p>`
}

function renderSupportersGrid(supporters, config, readmePath) {
  if (supporters.length === 0) {
    return ""
  }

  const rows = chunk(supporters, 7)
    .map(
      (row) =>
        `  <tr>\n${row.map((supporter) => renderPersonCell(supporter, readmePath, { width: "14.28%", avatarSize: 84 })).join("\n")}\n  </tr>`,
    )
    .join("\n")

  return `${config.supportersTitle}

<table align="center">
  <tbody>
${rows}
  </tbody>
</table>`
}

function renderSupportersSection(supporters, config, readmePath) {
  const featuredSupporters = supporters.filter((supporter) => supporter.featured)
  const regularSupporters = supporters.filter((supporter) => !supporter.featured)

  return [
    "<!-- This block is auto-generated by `pnpm supporters:sync`. Do not edit manually. -->",
    renderFeaturedSection(featuredSupporters, config, readmePath),
    renderSupportersGrid(regularSupporters, config, readmePath),
  ]
    .filter(Boolean)
    .join("\n\n")
}

async function main() {
  if (!fs.existsSync(dataPath)) {
    console.error(`[supporters] Supporter data not found: ${dataPath}`)
    process.exit(1)
  }

  const supporters = JSON.parse(fs.readFileSync(dataPath, "utf-8"))

  for (const config of readmeConfigs) {
    const readmePath = path.resolve(projectRoot, config.file)

    if (!fs.existsSync(readmePath)) {
      console.error(`[supporters] README not found: ${readmePath}`)
      process.exit(1)
    }

    const readmeContent = fs.readFileSync(readmePath, "utf-8")
    const startIndex = readmeContent.indexOf(markerStart)
    const endIndex = readmeContent.indexOf(markerEnd)

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      console.error(`[supporters] Markers are missing or out of order in ${config.file}`)
      process.exit(1)
    }

    const generatedBlock = renderSupportersSection(supporters, config, readmePath)
    const updatedReadme =
      readmeContent.slice(0, startIndex + markerStart.length) +
      "\n\n" +
      generatedBlock +
      "\n\n" +
      readmeContent.slice(endIndex)

    fs.writeFileSync(readmePath, updatedReadme, "utf-8")
  }

  console.log(
    `[supporters] Synced ${supporters.length} supporters into ${readmeConfigs.length} README files`,
  )
}

await main()
