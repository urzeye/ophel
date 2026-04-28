/**
 * sync-contributors.mjs
 *
 * Fetches contributors from GitHub, syncs .all-contributorsrc, and ensures
 * <!-- ALL-CONTRIBUTORS-LIST:START/END --> markers exist in every README.
 *
 * After this script runs, call `npx all-contributors-cli generate` to
 * render the contributor tables based on .all-contributorsrc.
 *
 * Run via: pnpm contributors:sync
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const packageJsonPath = path.resolve(projectRoot, "package.json")
const rcPath = path.resolve(projectRoot, ".all-contributorsrc")

const supportersEndMarker = "<!-- supporters:end -->"
const allContribStartMarker = "<!-- ALL-CONTRIBUTORS-LIST:START"
const allContribEndMarker = "<!-- ALL-CONTRIBUTORS-LIST:END -->"

const githubApiBaseUrl = "https://api.github.com"
const githubApiVersion = "2022-11-28"

/** Per-README config: file path + localized heading & intro text */
const readmeConfigs = [
  {
    file: "README.md",
    contributorsTitle: "## 🌟 Contributors",
    contributorsIntro:
      "> \u{1F30C} *Open source is powered by the stars of its community.*\n>\n> Our deepest gratitude to the amazing individuals below. Your contributions make this repository shine brighter.",
  },
  {
    file: "README_zh-CN.md",
    contributorsTitle: "## 🌟 贡献者",
    contributorsIntro:
      "> \u{1F30C} *开源的璀璨，源于社区中每一颗闪耀的星。*\n>\n> 诚挚致敬以下每一位同行者。因为你们的无私开源与智慧，这个项目才得以不断破浪前行。",
  },
  {
    file: "docs/readmes/README_de.md",
    contributorsTitle: "## 🌟 Mitwirkende",
    contributorsIntro:
      "> \u{1F30C} *Open Source wird von den Sternen seiner Gemeinschaft angetrieben.*\n>\n> Tiefer Dank gilt den folgenden großartigen Personen. Eure Beiträge lassen dieses Projekt heller leuchten.",
  },
  {
    file: "docs/readmes/README_es.md",
    contributorsTitle: "## 🌟 Colaboradores",
    contributorsIntro:
      "> \u{1F30C} *El código abierto es impulsado por las estrellas de su comunidad.*\n>\n> Nuestro más profundo agradecimiento a los increíbles colaboradores. Sus contribuciones hacen brillar este repositorio.",
  },
  {
    file: "docs/readmes/README_fr.md",
    contributorsTitle: "## 🌟 Contributeurs",
    contributorsIntro:
      "> \u{1F30C} *L'open source est alimenté par les étoiles de sa communauté.*\n>\n> Notre plus profonde gratitude aux personnes remarquables ci-dessous. Vos contributions font briller ce dépôt.",
  },
  {
    file: "docs/readmes/README_ja.md",
    contributorsTitle: "## 🌟 コントリビューター",
    contributorsIntro:
      "> \u{1F30C} *オープンソースは、コミュニティの星々によって輝いています。*\n>\n> 以下の素晴らしい方々へ、心よりの感謝を捧げます。皆さんの貢献がこのリポジトリをより輝かせています。",
  },
  {
    file: "docs/readmes/README_ko.md",
    contributorsTitle: "## 🌟 기여자",
    contributorsIntro:
      "> \u{1F30C} *오픈 소스는 커뮤니티의 별들에 의해 빛납니다.*\n>\n> 아래의 놀라운 분들께 깊은 감사를 드립니다. 여러분의 기여가 이 저장소를 더욱 빛나게 합니다.",
  },
  {
    file: "docs/readmes/README_pt-BR.md",
    contributorsTitle: "## 🌟 Contribuidores",
    contributorsIntro:
      "> \u{1F30C} *O código aberto é alimentado pelas estrelas de sua comunidade.*\n>\n> Nossa mais profunda gratidão às incríveis pessoas abaixo. Suas contribuições fazem este repositório brilhar mais.",
  },
  {
    file: "docs/readmes/README_ru.md",
    contributorsTitle: "## 🌟 Участники",
    contributorsIntro:
      "> \u{1F30C} *Открытый исходный код питается звёздами своего сообщества.*\n>\n> Наша искренняя благодарность замечательным людям ниже. Ваш вклад делает этот репозиторий ярче.",
  },
  {
    file: "docs/readmes/README_zh-TW.md",
    contributorsTitle: "## 🌟 貢獻者",
    contributorsIntro:
      "> \u{1F30C} *開源的璀璨，源於社群中每一顆閃耀的星。*\n>\n> 誠摯致敬以下每一位同行者。因為你們的無私開源與智慧，這個專案才得以不斷破浪前行。",
  },
]

// ---------------------------------------------------------------------------
// GitHub fetch helpers
// ---------------------------------------------------------------------------

function decodeHtmlEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function isBotContributor(contributor) {
  const name = contributor.name.toLowerCase()
  const url = contributor.url.toLowerCase()
  return (
    name.endsWith("[bot]") ||
    url.includes("/apps/") ||
    name.includes("claude") ||
    name.includes("copilot") ||
    name.includes("codex")
  )
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
        "User-Agent": "ophel-contributors-sync",
        "X-GitHub-Api-Version": githubApiVersion,
      },
    })

    if (!response.ok) {
      throw new Error(
        `GitHub contributors API failed (${response.status} ${response.statusText}) for ${requestUrl}`,
      )
    }

    const pageItems = await response.json()

    if (!Array.isArray(pageItems)) {
      throw new Error(`Unexpected GitHub contributors response for ${requestUrl}`)
    }

    contributors.push(
      ...pageItems.map((c) => ({ name: c.login, url: c.html_url, avatar: c.avatar_url })),
    )

    if (pageItems.length < 100) break
    page += 1
  }

  return contributors
}

async function fetchGithubContributorsFromWeb(repositorySlug) {
  const repoName = repositorySlug.split("/")[1]
  const requestUrl = `https://github.com/${repositorySlug}/contributors_list?current_repository=${encodeURIComponent(repoName)}&deferred=true`

  const response = await fetch(requestUrl, {
    headers: { "User-Agent": "ophel-contributors-sync" },
  })

  if (!response.ok) {
    throw new Error(
      `GitHub contributors web request failed (${response.status} ${response.statusText})`,
    )
  }

  const html = await response.text()
  const pattern =
    /<a href="(?<url>https:\/\/github\.com\/[^"]+)"[\s\S]*?<img src="(?<avatar>https:\/\/avatars\.githubusercontent\.com\/[^"]+)" alt="@(?<name>[^"]+)"/g

  const contributors = []

  for (const match of html.matchAll(pattern)) {
    const name = decodeHtmlEntities(match.groups?.name ?? "")
    const url = decodeHtmlEntities(match.groups?.url ?? "")
    const avatar = decodeHtmlEntities(match.groups?.avatar ?? "")
    if (name && url && avatar) contributors.push({ name, url, avatar })
  }

  return contributors
}

async function loadContributors(repositorySlug) {
  try {
    const webContributors = await fetchGithubContributorsFromWeb(repositorySlug)
    if (webContributors.length > 0) {
      return webContributors.filter((c) => !isBotContributor(c))
    }
  } catch (error) {
    console.warn(
      `[contributors] GitHub web scrape failed, falling back to REST API: ${error.message}`,
    )
  }

  const apiContributors = await fetchGithubContributors(repositorySlug)
  return apiContributors.filter((c) => !isBotContributor(c))
}

// ---------------------------------------------------------------------------
// .all-contributorsrc sync
// ---------------------------------------------------------------------------

/**
 * Adds newly discovered contributors to .all-contributorsrc.
 * Existing entries (including custom contribution types) are preserved.
 * New contributors default to the "code" contribution type.
 */
function syncAllContributorsRc(contributors) {
  if (!fs.existsSync(rcPath)) {
    console.warn("[contributors] .all-contributorsrc not found, skipping sync")
    return
  }

  const rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"))
  const existingLogins = new Set((rc.contributors ?? []).map((c) => c.login.toLowerCase()))
  const newEntries = contributors.filter((c) => !existingLogins.has(c.name.toLowerCase()))

  if (newEntries.length === 0) return

  rc.contributors = [
    ...(rc.contributors ?? []),
    ...newEntries.map((c) => ({
      login: c.name,
      name: c.name,
      avatar_url: c.avatar,
      profile: c.url,
      contributions: ["code"],
    })),
  ]

  fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2) + "\n", "utf-8")
  console.log(`[contributors] Added ${newEntries.length} new contributor(s) to .all-contributorsrc`)
}

// ---------------------------------------------------------------------------
// README marker management
// ---------------------------------------------------------------------------

/**
 * Builds the skeleton contributors section (heading + intro + empty markers).
 * The actual table is populated by `npx all-contributors-cli generate`.
 */
function buildContributorsSkeleton(config) {
  return (
    `${config.contributorsTitle}\n\n` +
    `${config.contributorsIntro}\n\n` +
    `<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->\n` +
    `<!-- prettier-ignore-start -->\n` +
    `<!-- markdownlint-disable -->\n` +
    `\n` +
    `<!-- markdownlint-restore -->\n` +
    `<!-- prettier-ignore-end -->\n` +
    `<!-- ALL-CONTRIBUTORS-LIST:END -->`
  )
}

/**
 * Ensures the <!-- ALL-CONTRIBUTORS-LIST:START/END --> markers exist in the
 * given README *outside* the <!-- supporters:start/end --> block.
 * If missing, inserts a skeleton section immediately after <!-- supporters:end -->.
 */
function ensureContributorsSection(readmePath, config) {
  const content = fs.readFileSync(readmePath, "utf-8")

  // If markers already exist anywhere in the file, nothing to do
  if (content.includes(allContribStartMarker)) {
    return
  }

  const supportersStartMarker = "<!-- supporters:start -->"
  const supportersStartIdx = content.indexOf(supportersStartMarker)

  if (supportersStartIdx === -1) {
    console.warn(
      `[contributors] Missing '${supportersStartMarker}' in ${path.basename(readmePath)}, skipping`,
    )
    return
  }

  // Insert skeleton BEFORE supporters:start so contributors appear above sponsors
  const skeleton = buildContributorsSkeleton(config) + "\n\n"
  const updatedContent =
    content.slice(0, supportersStartIdx) + skeleton + content.slice(supportersStartIdx)

  fs.writeFileSync(readmePath, updatedContent, "utf-8")
  console.log(`[contributors] Inserted contributors skeleton into ${path.basename(readmePath)}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`[contributors] package.json not found: ${packageJsonPath}`)
    process.exit(1)
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
  const repositorySlug = resolveRepositorySlug(packageJson.repository)

  const contributors = await loadContributors(repositorySlug)
  syncAllContributorsRc(contributors)

  for (const config of readmeConfigs) {
    const readmePath = path.resolve(projectRoot, config.file)

    if (!fs.existsSync(readmePath)) {
      console.warn(`[contributors] README not found: ${config.file}`)
      continue
    }

    ensureContributorsSection(readmePath, config)
  }

  console.log(`[contributors] Synced ${contributors.length} contributors to .all-contributorsrc`)
  console.log(`[contributors] Run 'npx all-contributors-cli generate' to refresh README tables`)
}

await main()
