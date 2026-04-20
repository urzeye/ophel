import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const projectRoot = process.cwd()
const dataPath = path.resolve(projectRoot, "docs/data/supporters.json")
const packageJsonPath = path.resolve(projectRoot, "package.json")
const markerStart = "<!-- supporters:start -->"
const markerEnd = "<!-- supporters:end -->"
const readmeConfigs = [
  {
    file: "README.md",
    featuredTitle: "### 💖 Angel Support",
    supportersTitle: "### 🤝 Supporters",
    contributorsTitle: "### 🌟 Contributors",
  },
  {
    file: "README_zh-CN.md",
    featuredTitle: "### 💖 天使投资特别鸣谢",
    supportersTitle: "### 🤝 支持者",
    contributorsTitle: "### 🌟 贡献者",
  },
  {
    file: "docs/readmes/README_de.md",
    featuredTitle: "### 💖 Besonderer Dank",
    supportersTitle: "### 🤝 Unterstützer",
    contributorsTitle: "### 🌟 Mitwirkende",
  },
  {
    file: "docs/readmes/README_es.md",
    featuredTitle: "### 💖 Agradecimiento especial",
    supportersTitle: "### 🤝 Patrocinadores",
    contributorsTitle: "### 🌟 Colaboradores",
  },
  {
    file: "docs/readmes/README_fr.md",
    featuredTitle: "### 💖 Remerciement special",
    supportersTitle: "### 🤝 Soutiens",
    contributorsTitle: "### 🌟 Contributeurs",
  },
  {
    file: "docs/readmes/README_ja.md",
    featuredTitle: "### 💖 特別な感謝",
    supportersTitle: "### 🤝 支援者",
    contributorsTitle: "### 🌟 コントリビューター",
  },
  {
    file: "docs/readmes/README_ko.md",
    featuredTitle: "### 💖 특별한 감사",
    supportersTitle: "### 🤝 후원자",
    contributorsTitle: "### 🌟 기여자",
  },
  {
    file: "docs/readmes/README_pt-BR.md",
    featuredTitle: "### 💖 Agradecimento especial",
    supportersTitle: "### 🤝 Apoiadores",
    contributorsTitle: "### 🌟 Contribuidores",
  },
  {
    file: "docs/readmes/README_ru.md",
    featuredTitle: "### 💖 Особая благодарность",
    supportersTitle: "### 🤝 Поддержавшие",
    contributorsTitle: "### 🌟 Участники",
  },
  {
    file: "docs/readmes/README_zh-TW.md",
    featuredTitle: "### 💖 天使支持特別鳴謝",
    supportersTitle: "### 🤝 支持者",
    contributorsTitle: "### 🌟 貢獻者",
  },
]
const githubApiBaseUrl = "https://api.github.com"
const githubApiVersion = "2022-11-28"

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
function getAvatarUrl(name, avatar, source, date) {
  if (avatar) return avatar
  if (name && name !== "anonymous") {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
  }
  const seed = encodeURIComponent(`${name || "anonymous"}|${source || ""}|${date || ""}`)
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`
}

function renderImageCell({ name, url, avatar, source, date, readmePath, size = 84, link = true }) {
  const resolvedAvatar = getAvatarUrl(name, avatar, source, date)
  const avatarPath = resolveAvatarPath(readmePath, resolvedAvatar)
  const image = `<img src="${escapeHtml(avatarPath)}" width="${size}" height="${size}" alt="${escapeHtml(name)}" />`

  if (!url || !link) {
    return image
  }

  return `<a href="${escapeHtml(url)}">${image}</a>`
}

function renderName({ name, url }, options = {}) {
  const { strong = true } = options
  const content = strong ? `<strong>${escapeHtml(name)}</strong>` : escapeHtml(name)

  if (!url) {
    return content
  }

  return `<a href="${escapeHtml(url)}">${content}</a>`
}

function renderCompactName(person) {
  return `<sub>${renderName(person, { strong: false })}</sub>`
}

function renderPersonCell(person, readmePath, options = {}) {
  const { width = 96, avatarSize = 56 } = options

  return `    <td align="center" width="${width}">
      ${renderImageCell({ ...person, readmePath, size: avatarSize })}
      <br />
      ${renderCompactName(person)}
    </td>`
}

function renderFeaturedSection(featuredSupporters, config, readmePath) {
  if (featuredSupporters.length === 0) {
    return ""
  }

  const cards = featuredSupporters
    .map(
      (supporter) => `<p align="center">
  ${renderImageCell({ ...supporter, readmePath, size: 96 })}
  <br />
  ${renderName(supporter)}
</p>`,
    )
    .join("\n\n")

  return `${config.featuredTitle}

${cards}`
}

function chunk(items, size) {
  const rows = []

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }

  return rows
}

function renderSupportersGrid(supporters, config, readmePath) {
  if (supporters.length === 0) {
    return ""
  }

  const rows = chunk(supporters, 10)
    .map(
      (row) => `  <tr>
${row.map((supporter) => renderPersonCell(supporter, readmePath, { width: 110, avatarSize: 72 })).join("\n")}
  </tr>`,
    )
    .join("\n\n")

  return `${config.supportersTitle}

<table align="center">
${rows}
</table>`
}

function renderContributorsGrid(contributors, config, readmePath) {
  if (contributors.length === 0) {
    return ""
  }

  const rows = chunk(contributors, 10)
    .map(
      (row) => `  <tr>
${row.map((contributor) => renderPersonCell(contributor, readmePath, { width: 90, avatarSize: 56 })).join("\n")}
  </tr>`,
    )
    .join("\n\n")

  return `${config.contributorsTitle}

<table align="center">
${rows}
</table>`
}

function renderSupportersSection(supporters, contributors, config, readmePath) {
  const featuredSupporters = supporters.filter((supporter) => supporter.featured)
  const regularSupporters = supporters.filter((supporter) => !supporter.featured)

  return [
    "<!-- This block is auto-generated by `pnpm supporters:sync`. Do not edit manually. -->",
    renderFeaturedSection(featuredSupporters, config, readmePath),
    renderSupportersGrid(regularSupporters, config, readmePath),
    renderContributorsGrid(contributors, config, readmePath),
    "---",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function resolveRepositorySlug(repository) {
  const repositoryUrl =
    typeof repository === "string"
      ? repository
      : repository && typeof repository.url === "string"
        ? repository.url
        : ""

  const normalizedUrl = repositoryUrl.replace(/^git\+/, "").replace(/\.git$/, "")
  const match = normalizedUrl.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/)

  if (!match?.groups?.owner || !match?.groups?.repo) {
    throw new Error(`Unsupported GitHub repository URL: ${repositoryUrl || "(empty)"}`)
  }

  return `${match.groups.owner}/${match.groups.repo}`
}

async function fetchGithubContributors(repositorySlug) {
  const contributors = []
  let page = 1

  while (true) {
    const requestUrl = new URL(`${githubApiBaseUrl}/repos/${repositorySlug}/contributors`)
    requestUrl.searchParams.set("per_page", "100")
    requestUrl.searchParams.set("page", String(page))

    const response = await fetch(requestUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ophel-supporters-sync",
        "X-GitHub-Api-Version": githubApiVersion,
      },
    })

    if (!response.ok) {
      throw new Error(
        `GitHub contributors request failed (${response.status} ${response.statusText}) for ${requestUrl.toString()}`,
      )
    }

    const pageItems = await response.json()

    if (!Array.isArray(pageItems)) {
      throw new Error(`Unexpected GitHub contributors response for ${requestUrl.toString()}`)
    }

    contributors.push(
      ...pageItems.map((contributor) => ({
        name: contributor.login,
        url: contributor.html_url,
        avatar: contributor.avatar_url,
      })),
    )

    if (pageItems.length < 100) {
      break
    }

    page += 1
  }

  return contributors
}

function decodeHtmlEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function isBotContributor(contributor) {
  const normalizedName = contributor.name.toLowerCase()
  const normalizedUrl = contributor.url.toLowerCase()

  return (
    normalizedName.endsWith("[bot]") ||
    normalizedUrl.includes("/apps/") ||
    normalizedName.includes("claude") ||
    normalizedName.includes("copilot") ||
    normalizedName.includes("codex")
  )
}

async function fetchGithubContributorsFromWeb(repositorySlug) {
  const requestUrl = `https://github.com/${repositorySlug}/contributors_list?current_repository=${encodeURIComponent(
    repositorySlug.split("/")[1],
  )}&deferred=true`

  const response = await fetch(requestUrl, {
    headers: {
      "User-Agent": "ophel-supporters-sync",
    },
  })

  if (!response.ok) {
    throw new Error(
      `GitHub contributors web request failed (${response.status} ${response.statusText}) for ${requestUrl}`,
    )
  }

  const html = await response.text()
  const contributorPattern =
    /<a href="(?<url>https:\/\/github\.com\/[^"]+)"[\s\S]*?<img src="(?<avatar>https:\/\/avatars\.githubusercontent\.com\/[^"]+)" alt="@(?<name>[^"]+)"/g

  const contributors = []

  for (const match of html.matchAll(contributorPattern)) {
    const name = decodeHtmlEntities(match.groups?.name ?? "")
    const url = decodeHtmlEntities(match.groups?.url ?? "")
    const avatar = decodeHtmlEntities(match.groups?.avatar ?? "")

    if (!name || !url || !avatar) {
      continue
    }

    contributors.push({ name, url, avatar })
  }

  return contributors
}

async function loadContributors(repositorySlug) {
  try {
    const webContributors = await fetchGithubContributorsFromWeb(repositorySlug)

    if (webContributors.length > 0) {
      return webContributors.filter((contributor) => !isBotContributor(contributor))
    }
  } catch (error) {
    console.warn(
      `[supporters] Failed to fetch contributors from GitHub web page, falling back to REST API: ${error.message}`,
    )
  }

  const apiContributors = await fetchGithubContributors(repositorySlug)

  return apiContributors.filter((contributor) => !isBotContributor(contributor))
}

async function main() {
  if (!fs.existsSync(dataPath)) {
    console.error(`[supporters] Supporter data not found: ${dataPath}`)
    process.exit(1)
  }

  if (!fs.existsSync(packageJsonPath)) {
    console.error(`[supporters] package.json not found: ${packageJsonPath}`)
    process.exit(1)
  }

  const supporters = JSON.parse(fs.readFileSync(dataPath, "utf-8"))
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
  const repositorySlug = resolveRepositorySlug(packageJson.repository)
  const contributors = await loadContributors(repositorySlug)

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

    const generatedBlock = renderSupportersSection(supporters, contributors, config, readmePath)
    const updatedReadme =
      readmeContent.slice(0, startIndex + markerStart.length) +
      "\n\n" +
      generatedBlock +
      "\n\n" +
      readmeContent.slice(endIndex)

    fs.writeFileSync(readmePath, updatedReadme, "utf-8")
  }

  console.log(
    `[supporters] Synced ${supporters.length} supporters and ${contributors.length} contributors into ${readmeConfigs.length} README files`,
  )
}

await main()
