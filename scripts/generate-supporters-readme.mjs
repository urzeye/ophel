import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const projectRoot = process.cwd()
const dataPath = path.resolve(projectRoot, "assets/support/supporters.json")
const packageJsonPath = path.resolve(projectRoot, "package.json")
const markerStart = "<!-- supporters:start -->"
const markerEnd = "<!-- supporters:end -->"
const readmeConfigs = [
  {
    file: "README.md",
    featuredTitle: "### 👼 天使投资特别鸣谢",
    supportersTitle: "### 🤝 支持者",
    contributorsTitle: "### 🌟 贡献者",
  },
  {
    file: "README_EN.md",
    featuredTitle: "### 👼 Angel Support",
    supportersTitle: "### 🤝 Supporters",
    contributorsTitle: "### 🌟 Contributors",
  },
  {
    file: ".github/readmes/README_de.md",
    featuredTitle: "### 👼 Besonderer Dank",
    supportersTitle: "### 🤝 Unterstützer",
    contributorsTitle: "### 🌟 Mitwirkende",
  },
  {
    file: ".github/readmes/README_es.md",
    featuredTitle: "### 👼 Agradecimiento especial",
    supportersTitle: "### 🤝 Patrocinadores",
    contributorsTitle: "### 🌟 Colaboradores",
  },
  {
    file: ".github/readmes/README_fr.md",
    featuredTitle: "### 👼 Remerciement special",
    supportersTitle: "### 🤝 Soutiens",
    contributorsTitle: "### 🌟 Contributeurs",
  },
  {
    file: ".github/readmes/README_ja.md",
    featuredTitle: "### 👼 特別な感謝",
    supportersTitle: "### 🤝 支援者",
    contributorsTitle: "### 🌟 コントリビューター",
  },
  {
    file: ".github/readmes/README_ko.md",
    featuredTitle: "### 👼 특별한 감사",
    supportersTitle: "### 🤝 후원자",
    contributorsTitle: "### 🌟 기여자",
  },
  {
    file: ".github/readmes/README_pt.md",
    featuredTitle: "### 👼 Agradecimento especial",
    supportersTitle: "### 🤝 Apoiadores",
    contributorsTitle: "### 🌟 Contribuidores",
  },
  {
    file: ".github/readmes/README_ru.md",
    featuredTitle: "### 👼 Особая благодарность",
    supportersTitle: "### 🤝 Поддержавшие",
    contributorsTitle: "### 🌟 Участники",
  },
  {
    file: ".github/readmes/README_zh-TW.md",
    featuredTitle: "### 👼 天使支持特別鳴謝",
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

function renderImageCell({ name, url, avatar, readmePath, size = 84 }) {
  const avatarPath = resolveAvatarPath(readmePath, avatar)
  const image = `<img src="${escapeHtml(avatarPath)}" width="${size}" height="${size}" alt="${escapeHtml(name)}" />`

  if (!url) {
    return image
  }

  return `<a href="${escapeHtml(url)}">${image}</a>`
}

function renderName({ name, url }) {
  const content = `<strong>${escapeHtml(name)}</strong>`

  if (!url) {
    return content
  }

  return `<a href="${escapeHtml(url)}">${content}</a>`
}

function renderFeaturedSection(featuredSupporters, config, readmePath) {
  if (featuredSupporters.length === 0) {
    return ""
  }

  const cards = featuredSupporters
    .map(
      (supporter) => `  <tr style="border: none;">
    <td align="center" width="520" style="border: none; padding: 0;">
      ${renderImageCell({ ...supporter, readmePath, size: 96 })}
      <br />
      ${renderName(supporter)}
    </td>
  </tr>`,
    )
    .join("\n")

  return `${config.featuredTitle}

<table
  align="center"
  border="0"
  cellpadding="0"
  cellspacing="0"
  style="border-collapse: collapse; border: none;">
${cards}
</table>`
}

function chunk(items, size) {
  const rows = []

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }

  return rows
}

function renderPersonCell(person, readmePath, options = {}) {
  const { width = 220, padding = "0 18px", avatarSize = 84 } = options

  return `    <td align="center" width="${width}" style="border: none; padding: ${padding};">
      ${renderImageCell({ ...person, readmePath, size: avatarSize })}
      <br />
      ${renderName(person)}
    </td>`
}

function renderSupportersGrid(supporters, config, readmePath) {
  if (supporters.length === 0) {
    return ""
  }

  const rows = chunk(supporters, 3)
    .map(
      (row) => `  <tr style="border: none;">
${row.map((supporter) => renderPersonCell(supporter, readmePath)).join("\n")}
  </tr>`,
    )
    .join("\n")

  return `${config.supportersTitle}

<table
  align="center"
  border="0"
  cellpadding="0"
  cellspacing="0"
  style="border-collapse: collapse; border: none;">
${rows}
</table>`
}

function renderContributorsGrid(contributors, config, readmePath) {
  if (contributors.length === 0) {
    return ""
  }

  const rows = chunk(contributors, 4)
    .map(
      (row) => `  <tr style="border: none;">
${row
  .map((contributor) =>
    renderPersonCell(contributor, readmePath, {
      width: 160,
      padding: "0 12px 18px",
      avatarSize: 72,
    }),
  )
  .join("\n")}
  </tr>`,
    )
    .join("\n")

  return `${config.contributorsTitle}

<table
  align="center"
  border="0"
  cellpadding="0"
  cellspacing="0"
  style="border-collapse: collapse; border: none;">
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
    normalizedName.includes("copilot")
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
