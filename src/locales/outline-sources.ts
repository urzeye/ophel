/** 与完整语言包共用文案，并随代码内联，兼容尚未包含新栏目的外置语言包。 */
export const outlineSourceMessages = {
  "zh-CN": { outlineSourceSources: "来源", outlineSourceStudio: "工作台" },
  "zh-TW": { outlineSourceSources: "來源", outlineSourceStudio: "工作台" },
  en: { outlineSourceSources: "Sources", outlineSourceStudio: "Studio" },
  ja: { outlineSourceSources: "ソース", outlineSourceStudio: "Studio" },
  ko: { outlineSourceSources: "소스", outlineSourceStudio: "스튜디오" },
  it: { outlineSourceSources: "Fonti", outlineSourceStudio: "Studio" },
  de: { outlineSourceSources: "Quellen", outlineSourceStudio: "Studio" },
  es: { outlineSourceSources: "Fuentes", outlineSourceStudio: "Studio" },
  fr: { outlineSourceSources: "Sources", outlineSourceStudio: "Studio" },
  pt: { outlineSourceSources: "Fontes", outlineSourceStudio: "Studio" },
  ru: { outlineSourceSources: "Источники", outlineSourceStudio: "Студия" },
}

export function getBundledOutlineSourceMessage(lang: string, key: string): string | undefined {
  const messages = outlineSourceMessages[lang as keyof typeof outlineSourceMessages]
  return messages?.[key as keyof typeof messages]
}
