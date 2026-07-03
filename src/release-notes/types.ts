export type ReleaseNotesLocale = "en" | "zh"
export type ReleaseNotesMediaType = "image" | "video"

export interface ReleaseNotesMedia {
  readonly id: string
  readonly type: ReleaseNotesMediaType
  readonly src: string
  readonly poster?: string
  readonly alt: Readonly<Record<ReleaseNotesLocale, string>>
  readonly caption?: Readonly<Partial<Record<ReleaseNotesLocale, string>>>
}

export interface ReleaseNotesContent {
  readonly version: string
  readonly date?: string
  readonly notes: Readonly<Record<ReleaseNotesLocale, string>>
  readonly fullChangelogUrls: Readonly<Record<ReleaseNotesLocale, string>>
  readonly media?: readonly ReleaseNotesMedia[]
}
