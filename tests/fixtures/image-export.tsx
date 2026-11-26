import { showImageExportDialog } from "../../src/components/ImageExportDialog"
import { renderExportImages } from "../../src/utils/export-image"
import { initI18n, setLanguage } from "../../src/utils/i18n"

import response from "./image-export.md?raw"

const input = {
  filename: "ophel-image-smoke",
  metadata: {
    title: "把对话变成值得分享的内容 · Ophel Atlas",
    source: "Ophel smoke test",
    url: "https://ophel.app",
    exportTime: "2026-11-26",
  },
  messages: [
    { role: "user", content: "保留公式、图表和图片，生成清晰的分享卡片。" },
    { role: "assistant", content: response },
  ],
  assets: [
    {
      name: "icon.png",
      relativePath: "assets/images/Ophel logo.png",
      sourceUrl: `${location.origin}/assets/icon.png`,
      kind: "image" as const,
    },
  ],
}

await initI18n()
setLanguage(new URLSearchParams(location.search).get("lang") || "zh-CN")
document.getElementById("open")!.onclick = () => void showImageExportDialog(input)
Object.assign(window, { imageExportSmoke: { input, renderExportImages } })
