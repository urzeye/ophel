# Conversation sync review

Mode: Operate. Local extension of the established conversation panel. User approved the full flow: preserve, notify, review selected records, local-only cleanup and undo. No new settings or visual identity.

## Direction contract

THESIS: Treat missing chats as uncertain sync results; an optional review task follows the nonblocking result rather than interrupting every sync.

OWN-WORLD: Inherit DESIGN.md's Inter/system text, theme variables, flat lists, existing dialog frame and compact panel controls. Neutral notices, primary links and danger only on the selected local cleanup action.

STORY: User sees records are retained, opens review, searches and checks exact chats, optionally opens original URLs, removes only chosen local records, then can undo with folder/tag/pin metadata restored during the five-second countdown notice. Hover, focus, hidden page and disabled action pause the same clock.

FIRST VIEWPORT: Compact notice below the panel toolbar. A user-opened dialog has a fixed title/explanation, search and selection summary, scrollable rows with metadata, and an always-visible footer. Narrow viewports wrap footer actions; titles and metadata wrap without horizontal overflow.

FORM: seed: none (pinned). Approved: “默认保留 → 提示差异 → 用户核对 → 多选清理”. Signature interaction: a zero-selection default and visible selected count, followed by a single-line undo strip after cleanup: a shrinking theme-color ring with tabular seconds sits immediately before Undo. Repeated cleanups restart the clock; stale expirations cannot affect newer batches.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Documentation boundary: preserve existing DESIGN.md unchanged. No shipping raster assets.
