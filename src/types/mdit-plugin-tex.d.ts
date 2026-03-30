declare module "@mdit/plugin-tex" {
  import type MarkdownIt from "markdown-it"

  export type MarkdownItTexOptions<MarkdownItEnv = unknown> = {
    delimiters?: "brackets" | "dollars" | "all"
    mathFence?: boolean
    render: (content: string, displayMode: boolean, env: MarkdownItEnv) => string
    allowInlineWithSpace?: boolean
  }

  export const tex: (md: MarkdownIt, options: MarkdownItTexOptions) => void
}
