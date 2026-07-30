import { defineConfig } from "vitepress"

const normalizeBase = (value: string): string => {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`
}

const favicon = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill="#7357d9" />
    <path d="M46 17c-12-5-27 2-29 15-2 12 8 23 20 21 10-2 16-12 12-21-3-7-12-10-18-6-6 4-7 12-2 17 4 4 11 4 15-1" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" />
  </svg>
`)}`

export default defineConfig({
  lang: "en-US",
  title: "Ophel SitePack Guide",
  description: "Install, manage, and author declarative SitePacks for Ophel Atlas.",
  base: normalizeBase(process.env.DOCS_BASE ?? "/ophel/"),
  head: [["link", { rel: "icon", type: "image/svg+xml", href: favicon }]],
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "SitePacks", link: "/site-packs/" },
      { text: "Install", link: "/site-packs/installation" },
      { text: "Author", link: "/site-packs/authoring" },
      { text: "FAQ", link: "/site-packs/faq" },
    ],
    sidebar: {
      "/site-packs/": [
        {
          text: "SitePacks",
          items: [
            { text: "Overview", link: "/site-packs/" },
            { text: "Install and manage", link: "/site-packs/installation" },
            { text: "Author a SitePack", link: "/site-packs/authoring" },
            { text: "FAQ", link: "/site-packs/faq" },
          ],
        },
      ],
    },
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    editLink: {
      pattern: "https://github.com/urzeye/ophel/edit/main/docs/site/:path",
      text: "Edit this page on GitHub",
    },
    socialLinks: [{ icon: "github", link: "https://github.com/urzeye/ophel" }],
    footer: {
      message: "SitePack documentation for Ophel Atlas",
      copyright: "Released under GPL-3.0-only",
    },
  },
})
