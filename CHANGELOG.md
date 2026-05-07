# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
versioning follows [Semantic Versioning](https://semver.org/).

> 中文版本: [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)

## [Unreleased]

### ✨ Improvements

- **Panel state remembered in auto-snap mode**: Both floating and auto-snap modes now remember whether the panel was open or closed across page refreshes. Previously, auto-snap mode always reopened the panel expanded after a refresh.
- **"Default Position" renamed to "Default Side"**: The setting label and description now clearly reflect its actual behavior — the preferred side the panel expands to, also used as the fallback when auto-snap has no previous position.

---

## [1.0.46]

### 🐛 Bug Fixes

- **Gemini source tooltips broken after Markdown fix**: Fixed source/citation tooltip chips disappearing in Gemini when the Markdown bold fix was enabled. The fixer was rewriting paragraph `innerHTML`, destroying Gemini's native event handlers for source tooltips. Affected paragraphs that contained citation chips are now skipped. (#468)

---

## [1.0.45]

### ✨ Improvements

- **Max page width raised to 99%**: The maximum percentage for page width and user query width is raised from 94% to 99%. (#447)
- **Narrow screen auto-adaptation**: On narrow screens like mobile, percentage-width mode automatically expands to 95% to prevent content from being too narrow. (#447)
- **Auto-hide quick buttons when panel opens**: When the toggle is on, the quick button group auto-collapses when the panel opens and restores when it closes, keeping the interface cleaner.
- **Quick button settings layout improvement**: The "Hide" toggle and "Opacity" control are grouped separately above the button ordering list, making them easier to find.

### 🐛 Bug Fixes

- **Panel position drift on zoom**: Fixed the quick button group and main panel gradually drifting to the center of the screen after using trackpad or browser zoom shortcuts. (#458)
- **Quick button settings lost on refresh**: Fixed some settings being reset after saving and refreshing the page.
- **Untranslated UI strings**: Fixed some dialogs and tooltips showing Chinese text in Russian, English, German, and 10 other languages.
- **Korean/CJK text rendering broken**: Fixed Korean and other CJK characters appearing as boxes or garbled text in the panel for Windows users. (Thanks @Apious #432)
- **DeepSeek page width**: Aligned AI reply width with the input box width.

---

## [1.0.44]

### ✨ Improvements

- **WebDAV provider quick presets**: Added server address presets for popular services including Jianguoyun (NutStore), InfiniCloud, Nextcloud, Synology, and Seafile — click to fill in, no manual lookup needed.
- **Backup action area redesign**: Regrouped buttons for Test Connection, Save Config, Backup Now, and Restore Backup with clearer visual hierarchy.
- **Backup file list style improvement**: File names now use a scrollable horizontal layout to avoid truncation; Restore and Delete buttons are in separate columns for clearer targeting.
- **Settings page description improvements**: Rewrote descriptions for word count, Firefox shortcut notes, and AI Studio model sync for greater accuracy.
- **Reading history default retention reduced to 3 days**: Reduced from 7 days to 3 days to save local storage; existing data is not affected.
- **Send shortcut setting moved to Prompts panel**: The "Send Shortcut" option moved from general settings to the Prompts tab, grouping it with prompt-related features.
- **Global shortcut default changed to Alt+O**: Avoids conflict with Chrome's built-in "Open Gemini" shortcut; displayed as `⌥O` on Mac.
- **ChatGPT bold fix disabled by default**: Reduces interference with ChatGPT's native page styles; can be enabled manually when needed.

### 🐛 Bug Fixes

- **WebDAV backup list parsing compatibility**: Fixed inability to read cloud backup file lists when some WebDAV providers (e.g. pCloud) return XML with namespace prefixes.
- **WebDAV operation interrupted after first authorization**: Fixed the original operation (backup, restore, or test connection) not resuming after confirming the authorization dialog on first WebDAV use.
- **Doubao conversation delete confirmation broken**: Adapted to Doubao's new page structure; fixed the delete confirmation dialog not triggering correctly (also fixed for Traditional Chinese UI).
- **Quick button initialization position jump**: Fixed the visual jump of quick buttons sliding down from the top to their target position on page refresh.

### ℹ️ Notes

- Existing users' global shortcuts will not change automatically. To use `Alt+O`, please update it manually in your browser's shortcut settings.

---

## [1.0.43]

### 🚀 New Features

- **Panel mode toggle shortcut**: Added `Alt+M` (Mac: `⌥M`) shortcut to switch between Auto-Snap and Floating modes with one key.

### ✨ Improvements

- **More visible toast messages**: Toast notifications are now clearer across all themes (including dark mode), long text is auto-truncated, and the system "Reduce Motion" setting is respected.
- **Anchor button click animation**: Added a light spring animation when clicking anchor buttons in the main panel footer and floating quick buttons for more responsive feedback.

### 🐛 Bug Fixes

- **Tooltip lingering after tab switch**: Fixed tooltips appearing unexpectedly when switching away and back to the browser tab during a hover-triggered countdown.
- **Horizontal image carousel blocked**: Fixed horizontal image carousels on ChatGPT and similar pages being unable to swipe left/right when "Prevent Auto-Scroll" was enabled.

---

## [1.0.42]

### ⚠️ Breaking Changes

- **Double-click title bar behavior changed**: The double-click action on the panel title bar changed from "Toggle Privacy Mode" to "Quick switch panel display mode (Floating ↔ Auto-Snap)".

### ✨ Improvements

- **Double-click title bar to switch panel mode**: Double-click the panel's top title bar (Logo or brand name area) to quickly switch between Floating and Auto-Snap modes without entering settings.
- **Hover on Logo/brand name to show advanced guide**: Moving the mouse over the panel's Logo or Ophel brand name automatically shows the advanced shortcut guide (MagicCodex), which closes when the mouse leaves.
- **Overall UI refinement**: Numerous UI detail improvements.
- **Community links in settings page**: Added store rating, GitHub, Ko-fi, and Discord quick links in the bottom-left corner, with theme and language switching integrated.
- **About page visual polish**: Comprehensive refinement of buttons, headings, navigation, and theme cards.
- **Feature tip tour**: Added feature hint bubbles to the panel and outline tabs to help discover hidden functionality.
- **Panel tab icons slightly enlarged**: Outline, conversation, and prompt icons enlarged from 14px to 16px for better clarity.

### 🐛 Bug Fixes

- **Update notification showing repeatedly**: Fixed the "plugin updated" dialog reappearing shortly after being closed.
- **Settings slider reset not persisting**: Fixed "Restore Default" taking effect immediately but reverting to old values after page refresh.
- **Panel briefly flashing default light theme on refresh**: Fixed panels briefly flashing to the default appearance before switching back to the user's theme on fast-loading sites like Gemini.

---

## [1.0.41]

### ✨ Improvements

- **"Tips & Tricks" category in global search**: Type `tip:` in global search to quickly filter all feature tips; a dedicated tab makes tips easy to discover and review.
- **Fuzzy search button active state visual improvement**: When fuzzy search is enabled, the button shows themed text + bold + solid themed border + light background highlight, clearly indicating the active state with automatic adaptation for dark/light and custom themes.

### 🐛 Bug Fixes

- **Search syntax example clicks not working**: Fixed clicking syntax examples (e.g. `type:outline`, `date:7d`) in global search only closing the overlay without inserting into the input.
- **Toast blocked by backdrop-filter**: Fixed toast notifications being blocked and blurred by the backdrop-filter used in global search and the settings page. Moved the mount point from `document.body` to the top-level Shadow DOM container to avoid stacking context isolation.
- **AI Studio adapted to new sidebar**: Updated adapter for AI Studio's new sidebar structure.

---

## [1.0.40]

### ✨ Improvements

- **Outline scroll sync performance**: When scrolling the conversation page, outline highlight indicator switched from full React re-render to direct DOM classList operations — only 2 DOM operations per scroll, eliminating useless reconciles across 1000+ OutlineNodeView components. (#397)
- **MutationObserver scope narrowed**: Outline auto-update MutationObserver scope narrowed from `document.body` to the AI reply container level, reducing callbacks triggered by unrelated DOM changes. (#395)
- **treeKey hash compression**: Outline tree keys now use djb2 hash algorithm, compressing long keys to 8-character hex strings, improving string comparison efficiency for large numbers of headings. (#395)

### 🐛 Bug Fixes

- **Sibling headings with same text overwriting collapse state**: Fixed two sibling headings with identical text (e.g. two `## Summary`) overwriting each other's collapse/expand state; key generation now prioritizes node ID. (#395)
- **Outline fallback refresh race condition**: Fixed the fallback timer forcing a tree rebuild after treeKey had already updated naturally, preventing unnecessary resets of user collapse state. (#395)
- **Outline missing refresh on tab switch**: Fixed outline refresh being lost when the outline tab was in the background during AI generation completion; automatically refreshes when switching back to the outline tab. (#395)
- **Panel mode switch flash**: Fixed panel flashing on the left side of the page for one frame when switching from floating mode to edge-snap mode. (#398)
- **Accidental quick button drag**: Raised the long-press drag threshold from 150ms to 220ms to reduce accidental drag triggers on quick clicks.
- **Position jump on floating mode switch**: Panel no longer resets to `defaultEdgeDistance` when switching to floating mode from settings; it stays in place. `defaultEdgeDistance` is now only used as the initial position on page refresh.
- **Panel not retracting after closing settings/search in snap mode**: Fixed settings modal and global search being rendered inside Shadow DOM causing MutationObserver to miss their close events; unified overlay detection scope and synced panel hover state on close.
- **No preview when switching to snap mode from settings**: Panel now immediately snaps/retracts as a preview when switching to edge-snap mode from settings, instead of staying expanded due to detecting the settings modal still open.

---

## [1.0.39]

### ✨ Improvements

- **Panel mode simplified**: Panel behavior settings simplified to two modes (Floating / Edge Snap), more intuitive without needing separate toggles.
- **One-click mode switch in panel header**: Added a pin/snap toggle button in the header for quick mode switching without entering settings.
- **Panel header streamlined**: Removed infrequently used buttons from the header for a cleaner look.
- **Title bar hover tips**: Random usage tips shown when hovering the panel title bar to help discover hidden features.
- **Navigation buttons always visible in edge-snap mode**: Scroll-to-top/bottom and anchor quick buttons no longer hide when panel is not overlapping them.
- **Conversation list performance**: Large numbers of conversations under a folder no longer cause lag; progressive loading implemented. (#369)
- **Global search performance**: Reduced redundant re-rendering of search results for smoother search experience.
- **Userscript load speed improved**: Significantly faster userscript loading after page refresh.
- **Theme adaptation refined**: Native theme now only colors the sidebar, no longer affecting the main content area of AI platforms.
- **Bundled Inter font**: Extension version bundles Inter Variable font for improved typography.

### 🐛 Bug Fixes

- **Permissions management page restored**: Fixed permissions page stuck in loading state with unresponsive "Allow" button. Root cause was `chrome.notifications` API lacking optional permission guard causing Service Worker initialization failure; also changed Options page permission requests to call `chrome.permissions.request()` directly instead of routing through Service Worker. (#384)
- Fixed scrollbar flashing, position jumps, and other interaction issues when switching panel modes.
- Fixed left-side snap animation delay; behavior is now unified on both left and right sides.
- Fixed double-clicking the title causing the panel to accidentally leave snap state.
- Fixed several memory leaks (animation frames and timers not cleaned up).
- Fixed Korean characters appearing as boxes in userscript. (#373)
- Fixed position drift and icon issues after quick button liquid collapse.
- Fixed slider max value label in settings page being displaced below the "Restore Default" button.

## [1.0.38]

### ✨ Improvements

- **Zen Mode and Clean Mode split**: The original "Zen Mode" is now split into "Zen Mode" (hides sidebar and navigation) and "Clean Mode" (hides disclaimers, ads, and other redundant elements) as two independent settings. Clean Mode is enabled by default; Zen Mode automatically includes the clean effect when enabled. (#365)
- **Notification click to foreground**: Desktop notifications for completed AI generation in the browser extension now support clicking to jump directly to the corresponding tab and focus the window, matching userscript behavior. (#359)

### 🐛 Bug Fixes

- **Firefox outline panel scroll bounce**: Fixed the outline panel jumping back to the active item position when scrolling in Firefox (including Zen Browser); debouncing the wheel event to pause auto-positioning. (#360)
- **ChatGPT reading position jumping to bottom after restore**: Fixed reading progress being successfully restored on page refresh but then immediately pulled to the bottom by ChatGPT's auto-scroll. Added a DOM attribute-based position lock mechanism for synchronous cross-world communication, replacing the race-prone async postMessage approach; introduced an adaptive timeout strategy (2-second idle release, 15-second max) with support for outline clicks and anchor jumps during the lock period.
- **macOS ghost pass-through restored**: Fixed the panel occasionally not entering the low-interference ghost pass-through state on macOS when holding the Command key, reducing obstruction of page content and click operations.

### 📝 Documentation

- **User docs fully rewritten**: All user guides rewritten in Chinese and English, covering Quick Start, Panel Overview, Quick Buttons, Smart Outline, Conversation Management, Prompt Library, Enhancement Features, Appearance Themes, Backup & Sync, Shortcuts, and FAQ — more complete and easier to follow.

## [1.0.37]

### ✨ Improvements

- **Main panel and quick button style overhaul**: Overall visual refresh of the main panel and quick buttons, further unifying hierarchy, spacing, and hover interactions for a lighter feel.
- **Quick button ghost pass-through**: Quick buttons enter a low-interference "ghost state" when idle and support mouse event pass-through to the underlying page, reducing obstruction of site content and operations.

## [1.0.36]

### ✨ Improvements

- **Quick button experience upgrade**: Integrated "Zen Mode" and "Global Settings" into the outer quick group with defaults enabled; redesigned intelligent grouping — feature toggles at top, navigation actions fixed at bottom with a separator.
- **Zen Mode immersive icon animation**: When Zen Mode is enabled, the related icon in quick buttons seamlessly switches to the closed-eye state (EyeClosedIcon) with a minimalist 4-second breathing glow animation, providing visual feedback that matches the "immersive focus" mental model.
- **Native page color sync label clarified**: "Sync native page theme" labels unified as "Sync native page colors", clarifying that page light/dark mode always follows Ophel, and this toggle only additionally controls some native element colors; descriptions updated in all 10 languages to reduce confusion.
- **Zen Mode exit button visual overhaul**: Exit button redesigned as a top-centered floating glassmorphism capsule with smooth entrance animation that seamlessly adapts to the global theme system.
- **Global Toast notification upgrade**: Replaced heavy gradient color blocks with a premium frosted glass card style; built-in smart avoidance mechanism automatically moves down when Zen Mode is active to prevent overlap.
- **Watermark removal indicator repositioned**: The loading indicator during Gemini image watermark removal moved to the bottom-right corner of the image, reducing obstruction of the top-right action buttons and image content.
- **Zen Mode site adaptation and exit entry improved**: Unified Zen Mode configuration across sites, adding default hidden elements for more AI sites; enabling it directly hides sidebar, disclaimers, and distraction areas, with a fixed floating "Exit Zen Mode" entry at the top level of the page.
- **Zen Mode shortcut and collapsed state compatibility**: Added "Toggle Zen Mode" in "Settings → Shortcuts → Interaction Controls" with default shortcut `Ctrl + Shift + Z`; also improved Zen Mode layout behavior on Kimi and other sites with collapsed sidebars.
- **Qwen Studio site name unified**: The display name of `chat.qwen.ai` unified to `Qwen Studio` across adapter display names, settings items, conversation hints, README, and issue templates.

### 🐛 Bug Fixes

- **AI Studio theme fallback conflict**: Fixed AI Studio applying a generic fallback on top of already-completed native theme switching when "Sync native page colors" was enabled, causing theme class conflicts and style corruption.
- **System theme preference lost on refresh for multiple sites**: Fixed DeepSeek, Qwen Studio, and ChatGLM reverting panel theme state to `light` on page refresh after switching to "Follow System" via Ophel, even though the `system` preference had been written to the site.
- **Zen Mode component i18n disconnect**: Fixed the static-injected exit button text not updating when switching plugin language after Zen Mode was enabled.
- **Userscript Gemini inline image watermark removal positioning fix**: For generated images on Gemini `/app` and `/share` pages that only have `blob:` / `data:` URLs, the watermark removal process now validates both `48px` and `96px` watermark candidates and their adjacent positions, only using a result when confirmed to improve quality.
- **Userscript inline image result reuse**: Auto-display, preview zoom, copy, and download for the same Gemini inline image now reuse the same watermark-removed result to reduce inconsistency across different entry points.

## [1.0.35]

### 🚀 New Features

- **Native page theme sync toggle**: Added "Sync Native Page Theme" toggle in "Appearance & Theme" to independently control whether Ophel theme changes also update the current site's light/dark mode and native colors; also added to global search index for direct navigation.

### ✨ Improvements

- **Gemini user query image export**: Exported conversations now include images uploaded in Gemini user queries, preventing export results that only contain text prompts with missing reference images.

### 🐛 Bug Fixes

- **ChatGPT thinking mode completion timing**: Introduced per-round completion detection logic for ChatGPT `thinking_effort` requests; normal replies continue using network monitoring, while standard/advanced thinking waits for the page to actually enter and exit the generating state before signaling completion, avoiding false "conversation complete" detection during the `stream_handoff` phase. (#343)
- **Doubao conversation sync restored**: Adapted to Doubao's new sidebar DOM structure, restoring conversation list recognition, current conversation location, and new conversation entry sync, reducing sidebar feature failures caused by the official page update. (#342)
- **Doubao outline and export structure adapted**: Switched to Doubao's new chat message area DOM, restoring outline extraction, latest reply extraction, and conversation export functions, preventing empty outlines or missing export content after the official update. (#342)
- **Gemini image Markdown export restored**: Compatible with Gemini's new generated image structure, correctly preserving generated images in replies when exporting Markdown, no longer losing images due to wrapper changes or temporary `blob:` URLs. (#339)
- **Gemini watermark removal compatible with new image components**: Watermark removal now supports Gemini's new generated image component structure, compatible with new image cards, copy buttons, and "Download full size image" buttons.
- **Gemini conversation image watermark misidentification fix**: Adjusted Gemini watermark size detection logic to prioritize `48px` watermark config when preview image source is detected on `/app` conversation pages. (#335)
- **Extension update notification z-index fix**: Raised the z-index of the "plugin updated" notification card to prevent it from being covered when the panel or quick overlays are open.
- **Grok user query width alignment fix**: Fixed Grok user query bubbles being incorrectly centered instead of right-aligned after enabling "User Query Width".
- **Grok content area width abnormal shrinkage**: Fixed `--content-max-width` being applied redundantly on nested containers during Grok page width adjustment, causing the latest conversation content to be noticeably narrower than older messages.

## [1.0.34]

### 🐛 Bug Fixes

- **Firefox idle callback compatibility**: Fixed errors in Firefox caused by calling `requestIdleCallback` / `cancelIdleCallback` without the `window` context, preventing `TypeError` during outline scroll sync.
- **Theme sync hydration race condition**: Delayed theme callback registration and theme listener startup to ensure theme state writes only happen after settings hydration is complete, reducing the risk of disclaimer dialogs reappearing or settings being overwritten by defaults on Firefox after switching to dark or "Follow System" mode. (#333)

## [1.0.33]

### 🐛 Bug Fixes

- **Site width toggle not working**: Fixed the "Enable Page Width" and "Enable User Query Width" toggles not opening for ChatGPT, Claude, and other sites in "Site Settings". Width config normalization now preserves already-saved site keys, preventing saved configs for sites not in the default table from being accidentally overwritten. (#330)

## [1.0.32]

### 🐛 Bug Fixes

- **Userscript settings reverting to defaults**: Fixed userscript resetting the entire config to defaults whenever any setting was changed after a page refresh; tightened `settings-store` preview state and hydration persistence timing to prevent temporary state from overwriting saved settings.
- **Userscript legacy settings format compatibility**: Added compatibility for old userscript versions that stored the raw `settings` object directly in GM storage; upgrades now automatically wrap it in the structure required by Zustand `persist`, reducing settings failures caused by the old data format.
- **Disclaimer false-positive fix**: Disclaimer dialog now waits for settings hydration to complete before evaluating display conditions, preventing userscript from incorrectly judging "not agreed" before settings are loaded and showing the dialog repeatedly.

## [1.0.31]

### ✨ Improvements

- **Doubao page width sync**: Page width control now also covers `--content-max-width` related containers and variables, fixing the bottom input box not changing when adjusting page width.
- **Quick button group position memory**: The position of the quick button group after dragging is now automatically saved and restored after page refresh, reducing the need to reposition on every page visit. (#293, #3)
- **Quick button settings structure consolidation**: Quick button order, opacity, toolbox menu, floating toolbar state, and position are unified under `settings.quickButtons`, with compatibility for old configs scattered at the top level and old backup files.
- **Layout settings converted to sliders**: Page width, user query width, default margin, panel width, panel height, and snap trigger distance now use slider controls with real-time value display, reducing input complexity.
- **Width config unified to percentage**: Page width and user query width now use `%` config exclusively, with quick preset buttons removed from the bottom; default value restore entry added for consistent settings UX.
- **Legacy width config auto-migration**: Old `px` width data from previous versions is automatically converted and migrated to the new percentage config after upgrading.

### 🐛 Bug Fixes

- **Doubao native theme cleanup**: Removed native theme override style injection for Doubao to avoid continued reliance on the separately maintained theme adaptation file.
- **Quick button group drift on zoom**: Improved positioning logic when the browser window is zoomed or resized; quick buttons now better maintain their relative position, reducing cases where they end up in the center of the page.
- **Slider preview state lingering**: Fixed temporary preview values persisting when switching pages or closing the panel while dragging a slider in settings; unsubmitted preview states are now cleaned up when the component unmounts.

## [1.0.30]

### 🚀 New Features

- Theme switching now also affects the native site (partial support, continuously improving)

### ✨ Improvements

- Improved quick button background effect (glassmorphism transparency)

## [1.0.29]

### ✨ Improvements

- **Userscript bundle size reduction**: Userscript build now loads `react` and `react-dom` via CDN, and splits localization strings into external JSON resources, significantly reducing `ophel.user.js` bundle size, resolving Greasy Fork sync failures due to script length, without affecting the browser extension build.
- **Userscript i18n load chain optimized**: Userscript now prioritizes initializing the current language resource on startup and automatically refreshes UI text when the language is changed, ensuring stable first-screen loading and switching experience with external language packs.

### 🐛 Bug Fixes

- **Theme switch animation origin fix**: Fixed theme switch animation in quick buttons always starting from the top-right corner of the page; theme switching in both quick buttons and main panel now consistently radiates from the triggering button's position.

## [1.0.28]

### 🚀 New Features

- **AI reply Mermaid fallback rendering**: Added Mermaid code block detection and rendering for sites without native support, with code/diagram toggle, zoom, fullscreen, and PNG download. (#285)

### ✨ Improvements

- **KaTeX font size reduction**: Extension bundle now only includes `.woff2` fonts, reducing bundle size while maintaining Firefox compatibility.
- **Mermaid toolbar experience**: Improved button icons, page and fullscreen viewing experience.
- **Panel and outline icon refresh**: Upgraded Sparkle icon in panel header/collapsed entry and "Show user queries only" button in outline panel to more consistent SVG icons, with minor button size and hierarchy adjustments for better visibility in dark and light themes.
- **Prompt icon system improved**: Redrawn prompt-related icons with a separate icon for the prompt queue, reducing visual confusion between different entry points.
- **UI improvements**: Improved icon display and adjusted About page supported platforms section and related feature descriptions for better visual consistency and readability.
- **Extension update notification improved**: When the browser extension detects a new version, a custom Ophel refresh notification card now appears at the bottom-right corner of the page, clearly indicating "Plugin Updated" with a one-click refresh entry, reducing confusion when users continue in old context after an update.

### 🐛 Bug Fixes

- **Gemini Enterprise export noise cleanup**: Cleaned up unexpected noise content (extra style and status text) appearing in some Gemini Enterprise export results, improving output consistency and readability.
- **Input focus stealing on native sites**: Fixed an issue where Ophel could steal input focus on native sites like ChatGPT in Firefox, causing the first character typed in the outline search box to lose focus and prevent continuous input. (#304)
- **Unified focus protection**: Unified input focus protection logic across Settings, Global Search, Prompt Queue, and the main panel, while preserving local keyboard interactions (`Enter`, `Escape`, etc.) inside queue and modal dialogs.
- **Duplicate update notification**: Fixed an issue where after extension updates, multiple notifications appeared simultaneously (Ophel's own notification, a fallback notice, and Plasmo's default "Context Invalidated, Press to Reload"), consolidated into a single update notification card.

## [1.0.27]

### 🚀 New Features

- **User query math formula rendering**: User query Markdown rendering now supports detecting and displaying LaTeX math formulas (inline and block formulas). (#299)

### ✨ Improvements

- **Export progress notification enhanced**: Unified improved export start toast text clearly reminding "please do not operate the current page during export", with slightly longer display time; synced in 10 languages to reduce accidental operations during long AI Studio and DeepSeek conversation exports.
- **Markdown export header typography improved**: Adjusted spacing structure between the title and metadata block at the top of exported documents for better first-screen readability.

### 🐛 Bug Fixes

- **AI Studio virtual scroll export misalignment**: Refactored round pairing and ordering logic for AI Studio exports during virtual scrolling, fixing user queries, thinking content, and AI replies being misaligned or stacked at the bottom of the document in long conversations.
- **AI Studio export missing content and format issues**: Fixed empty off-screen replies, only exporting thinking without body, truncated user queries, and incomplete extraction of lists, quotes, inline code, code blocks, Markdown, and formulas during virtual scrolling.
- **Export title polluted by tab renaming**: Fixed AI Studio export document title incorrectly using the browser tab title rewritten by the extension, now prioritizing the original conversation title; also added protection for Grok and the general export pipeline to avoid being overwritten by the current page title.

## [1.0.26]

### 🚀 New Features

- **Gemini Voyager incremental import**: Added "Import from Gemini Voyager" in data management, flattening Voyager folder structures into path names and incrementally merging into the current Gemini account for easy migration from Voyager. (#287)

### ✨ Improvements

- **Multi-line block formula delimiter format**: Adjusted block-level LaTeX wrapping rules so multi-line formulas use newline-wrapped `$$` delimiters when exporting Markdown, reducing adhesion to body text; double-click copy formula base delimiter logic also synchronized. (#296)

### 🐛 Bug Fixes

- **DeepSeek page width sync**: Adjusted `chat.deepseek.com` page width control logic to unify the message area and bottom input box under the same `--message-list-max-width` variable, so the input box matches the message area when page width is expanded. (#281)
- **Claude outline and scroll navigation broken**: Compatible with Claude's new chat scroll container structure, fixing empty outline extraction and broken "go to top / go to bottom / return to anchor" navigation based on scroll container. (#291)
- **Gemini formula copy losing closing parenthesis**: Fixed double-clicking to copy LaTeX formulas on Gemini incorrectly removing `)` at the end of formulas; export pipeline not affected. (#292)
- **Markdown export format fix**: Improved general `htmlToMarkdown()` conversion logic, fixing code block language titles being merged with content, code content being flattened to one line, and multi-level list first-level indent being lost when exporting/copying Markdown on ChatGPT and similar sites. (#296)

## [1.0.25]

### 🚀 New Features

- **Yuanbao site support**: Added initial compatibility for `yuanbao.tencent.com`. (#279)

### 🐛 Bug Fixes

- **Settings modal input focus protection**: Changed keyboard event capture interception for input controls in the settings modal to apply to all sites universally, fixing focus being stolen by native input boxes on some sites in Firefox environments in settings items like "Page Width Control".

## [1.0.24]

### 🚀 New Features

- **Tencent ima site support**: Added initial compatibility for `ima.qq.com`. (#275)

### 🐛 Bug Fixes

- **QwenAI international version width control**: Fixed "Page Width" and "User Query Width" settings not taking effect on `chat.qwen.ai`, now correctly overriding conversation container and user bubble width styles.
- **DeepSeek width control**: Fixed page width control and user query width setting not taking effect on `chat.deepseek.com`, switched to overriding virtual list width variable and stable user message structure. (#281)

## [1.0.23]

### 🚀 New Features

- **QwenAI international version support**: Added initial compatibility for `www.qianwen.com`. (#240)

### 🐛 Bug Fixes

- **New conversation shortcut compatibility**: Fixed new conversation shortcut not working on macOS and some sites, and Doubao falling back to full page refresh.
- **Advanced model settings search i18n**: Fixed advanced model usage stats related settings titles not being localized in global search results.

## [1.0.22]

### ✨ Improvements

- **Userscript external resource publishing**: Changed userscript styles, notification sounds, and watermark base images to hashed external static resources distributed via a separate `userscript-assets` release channel, preventing repeated bundling of the same resources in every GitHub Release.
- **Tooltip capability consolidation**: Extracted a shared tooltip core, unifying styles, positioning, container selection, and hide timing between React panel and site injection scenarios, reducing duplicate implementations.
- **Streaming request monitoring precision**: Narrowed the generation request matching conditions for ChatGPT, Grok, Kimi, and ChatGLM to reduce misidentifying regular network requests as AI streaming replies.

### 🐛 Bug Fixes

- **Userscript resource loading stability**: Userscript now references stable external resource URLs, reducing publish risk from continued script size growth and providing a foundation for future versions to reuse unchanged resources.
- **Gemini My Stuff userscript compatibility**: Fixed "Open in New Tab" hover button icon not rendering on the Gemini "My Stuff" page in userscript environment due to CSP / Trusted Types restrictions.
- **Gemini My Stuff hover state lingering**: Fixed hover button and tooltip text still showing after clicking "Open in New Tab" and returning to the original page.
- **Gemini Usage panel userscript compatibility**: Fixed the advanced model Usage stats panel continuously erroring on the Gemini page in userscript environment due to Trusted Types blocking `innerHTML`.
- **Gemini user query rendering userscript compatibility**: Fixed Gemini user query Markdown rendering erroring in userscript environment due to Trusted Types blocking direct `innerHTML` assignment.
- **Gemini Enterprise Shadow DOM compatibility**: Fixed user query Markdown preview failing in Shadow DOM scenario and advanced model Usage stats panel mounting issues causing missing styles and text appearing in the input area.
- **Single-line Markdown user query rendering**: Relaxed user query Markdown detection to support single-line quotes, headings, lists, bold, inline code, and links triggering rendering normally.
- **ThemeManager global singleton reuse**: Fixed `App` and core modules creating duplicate `ThemeManager` instances on page refresh, causing theme state competition and `[App] Global ThemeManager not found, creating fallback instance` warnings in console.
- **Gemini refresh false positive completion notification**: Fixed Gemini standard and Gemini Enterprise occasionally incorrectly judging "AI generation complete" and showing completion notifications and playing sounds on page refresh.
- **ChatGPT model lock compatible with new page**: Adapted to ChatGPT's new model selection menu, fixing the model lock repeatedly opening/closing the model dialog, old model names being mistakenly identified as the current model, and model name in tab title being unstable on the new page.
- **DeepSeek deep thinking export and outline extraction**: Fixed outline, copy Markdown, and export Markdown incorrectly extracting thinking chain content when DeepSeek deep thinking is enabled; export results now respect the "Include thinking chain in export" setting.
- **DeepSeek share conversation export**: Fixed `chat.deepseek.com/share/*` share page export showing "Please open a conversation to export" error, now directly recognizing share conversations and completing export.
- **DeepSeek virtual scroll outline out of order**: Fixed AI reply headings occasionally being sorted before their corresponding user queries in DeepSeek long conversation virtual scroll scenarios.

## [1.0.21]

### 🚀 New Features

- **Advanced model usage stats and local estimation**: Added local conversation counting and estimation panel for advanced models, with a history usage stats chart on the features page that can be viewed by site and hour, day, or month in counts or rough token estimates. (#103, #256) by @KanameMadoka520

### 🐛 Bug Fixes

- Fixed userscript failing to load due to a name change; rolled back script name
- Fixed DeepSeek virtual scroll causing missing outline and export format loss
- Fixed DeepSeek not refreshing after deletion and Doubao conversation deletion not syncing to the original site
- Fixed Doubao "Copy Latest Reply" having no content; upgraded multi-site "Copy Latest Reply" to Markdown extraction to preserve headings, bold, tables, formulas, and code blocks; compatible with DeepSeek / AI Studio virtual scroll and Gemini Enterprise Shadow DOM scenarios

## [1.0.20]

### 🚀 New Features

- **Gemini MyStuff open in new tab**: Added an "Open in New Tab" button to media cards on the Gemini "My Content" page, supporting direct jump to the original conversation location. (#185)

### ✨ Improvements

- **Shortcut cross-platform compatibility**:
  - Unified primary and secondary modifier key cross-platform semantics: Windows/Linux uses `Ctrl`/`Alt`, macOS uses `Command`/`Option`, improving consistency for multi-device shared configs.
  - Shortcut settings page and queue shortcut hints now uniformly display by physical key normalization; recording `Option + letter/number/common symbol` on macOS no longer shows abnormal display due to system special character input.
  - Fixed some shortcuts on macOS saving as `∂`, `†`, `¬` and other characters due to `Option` participating in special character input, causing display issues or unstable triggering.
  - Added compatibility migration for locally saved old shortcut configs, covering extension startup, settings page hydration, cross-page sync, and full settings replacement scenarios to reduce reconfiguration cost for existing users after upgrading.

## [1.0.19]

### 🚀 New Features

- **Qianwen (Tongyi Qianwen) site support**: Added initial compatibility for `www.qianwen.com`. (#189)
- **Prompt queue batch import**: Support pasting multiple items at once in the prompt queue, parsed as "split by line" or "custom delimiter" and batch-enqueued; the first item is sent immediately when AI is idle, remaining items auto-queue and send in sequence. (#223)

### ✨ Improvements

- **Completion notification enhanced**: Added 3 built-in notification sound presets with configurable play count and interval, automatically stopping repeated playback when the user returns to the page. (#228)
- **i18n text completed**: Completed missing and residual English text in German, Spanish, French, Japanese, Korean, Portuguese, and Russian, unifying multilingual display experience.

### 🐛 Bug Fixes

- Fixed unstable go-to-top, go-to-bottom, return-to-anchor, outline scroll follow, and highlight state on DeepSeek and Z.ai in some long conversations. (#241)
- Fixed Gemini page repeatedly resetting tab title to `Google Gemini` in the background, causing flickering conflicts with the auto-rename logic.
- Fixed shortcut conflict hint falling back to Chinese in non-Chinese languages due to empty text.
- Fixed Korean shortcut list missing `shortcutShowShortcuts` text.
- Fixed Spanish panel title still containing old brand name `Gemini Helper`.

## [1.0.18]

### 🚀 New Features

- **Z.ai site support**: Added initial compatibility for `chat.z.ai`. (#218)

### ✨ Improvements

- Temporarily hidden "Manual Anchor" settings and quick button to reduce user confusion
- Improved Gemini and AI Studio Markdown table rendering styles after enabling page width expansion
- Popup site support list aligned with adapters, quick access now shows all supported sites

### 🐛 Bug Fixes

- Limit user query image sizes when "User query Markdown rendering" is enabled. (#224) by @tjsky
- Fixed floating toolbar being pushed outside the visible area after dragging to the screen edge and then resizing the window. (#221)
- Fixed Grok conversation sync incorrectly treating command panel Actions as conversations
- Fixed Grok pin recognition logic to prevent all pinned/unpinned anomalies after sync

## [1.0.17]

### 🚀 New Features

- **ChatGLM site support**: Added initial compatibility for `chatglm.cn`.

### ✨ Improvements

- i18n improvement: "Inbox" internationalization adaptation

## [1.0.16]

### 🚀 New Features

- **Kimi site support (initial)**: Added complete initial site support for `www.kimi.com`

### ✨ Improvements

### 🐛 Bug Fixes

## [1.0.15]

### 🚀 New Features

- **Global search shortcut customizable**: Added `openGlobalSearch` configurable action, default key `Ctrl+K` (shown as `⌘K` on Mac), configurable in "Shortcuts → Interaction Controls".
- **Global search settings direct shortcut**: Added "Global Search Shortcut" setting in "Global Search → Search Matching" with a one-click jump to shortcut settings and highlight to the corresponding key row.
- **DeepSeek site support**: Added initial compatibility for `chat.deepseek.com`.

### ✨ Improvements

- **Dynamic trigger hint**: The trigger description at the top of the global search page changed from fixed text to dynamically assembled, reflecting the current user config (double Shift / custom key) in real time.
- **Delete shortcut scenario compatibility**: When user removes the global search shortcut, the trigger description automatically degrades to show available trigger methods; shows "Not set" if all are disabled.
- **Conversation sync result diagnostics enhanced**: After manual sync, new "scanned/added/updated" result hints are shown; clear guidance is provided when no conversations are detected in the sidebar; and update count calculation and metadata backfill write logic are corrected. by @joevalleyfield
- **DeepSeek conversation sync enhanced**: Added conversation rename sync, link and CID backfill updates, and pinned conversation recognition with support for distinguishing pinned/normal conversation groups.
- **DeepSeek generation state monitoring**: Integrated DeepSeek streaming generation request monitoring for more timely generation start/end state, more accurate tab state and completion notification pipeline.

### 🌍 Internationalization

- **10 language text completed**: Completed and synced `globalSearchTriggerHint` template text, `globalSearchTriggerDoubleShift`, and "Global Search Shortcut" jump item (title/description/button) key values in 10 languages.

### 🐛 Bug Fixes

- **Settings search missing items**: Added "Shortcuts", "Global Search", "Conversation sync delete" and other previously unsearchable config items to settings search, with support for finding by name and keywords.
- **Shortcut settings search stability**: Shortcut entry index now dynamically generated from metadata; no manual maintenance needed when adding/adjusting shortcuts in the future, reducing miss risk.
- **DeepSeek send button misidentification**: Fixed send button selector incorrectly matching the attachment button, with added fallback to simulate `Enter` / `Ctrl+Enter` when using send shortcut for better compatibility.
- **ChatGPT Projects export failure**: Fixed "Export Markdown / Copy Markdown" failing in Projects conversations with `Conversation not found` error because project conversations weren't synced to local index; now immediately supplements conversation metadata from the current page before exporting.

## [1.0.14]

### 🚀 New Features

- **Doubao (ByteDance) support**: Ophel now fully supports Doubao, ByteDance's AI assistant.

### 🐛 Bug Fixes

- **Backup restore data loss**: Fixed restored backup data being overwritten by empty data from open AI pages that still had old data in memory after restore. Now automatically notifies all open AI pages to refresh after successful restore and skips the first auto-sync to keep restored data clean.
- **Backup export/import data structure errors**: Fixed `lastUsedFolderId` and other auxiliary properties being lost on export, and a condition error preventing correct restoration of backups with 2+ conversations on import.
- **Reading history restore structure compatibility**: Fixed `readingHistory` being incorrectly wrapped as `{ readingHistory: ... }` during local import and WebDAV restore; now correctly restores as `{ history, lastCleanupRun }` to prevent reading history loss.
- **WebDAV restore status writeback fix**: Fixed `lastSyncStatus` remaining at `syncing` after successful download restore; now correctly writes back `lastSyncTime` and `lastSyncStatus: success`.
- **Gemini cross-browser import invisible conversations**: Upgraded Gemini conversation isolation from numeric `cid` (`/u/n`) to account email priority, with automatic migration from old data (numeric `cid` → email `cid`) on first Gemini open after upgrade, supporting `u/0` to `u/1` cross-browser import scenarios.
- **Import backup module load error**: Fixed `Cannot find module` error during dynamic import of the validation module in local import and WebDAV restore pipelines; switched to static import for stable availability in build artifacts.
- **Import failure diagnosis**: Added clear console error logs for import parse and write failures, with actual error message shown in Toast for easier issue identification.
- **Import confirm dialog and i18n text**: Improved "backup time/type" info display style in the import confirm dialog; added and completed "Type" and "Open AI pages will be refreshed" key values in 10 languages.

## [1.0.13] - 2026-03-02

### 🚀 New Features

- **Zen Mode**: Added Zen Mode setting to hide unnecessary page elements (such as model disclaimers at the bottom) for a purer conversation interface experience.

### 🐛 Bug Fixes

- **Gemini Enterprise prompt queue fix**: Fixed prompt queue on Gemini Enterprise after the page update — prompts were not being inserted into the native input box, incorrectly triggering the voice button causing "Could not recognize your speech" error.
  - Fixed global Enter key capture listener intercepting Enter events in the queue input box, causing content to be submitted without being inserted.
  - Fixed `findTextarea()` incorrectly matching the extension's own queue input (`gh-queue-input`) instead of the Gemini Enterprise ProseMirror editor.
  - Fixed submit button selector missing the "Send" label, unable to match the redesigned send button.
  - Fixed submission confirmation logic timing out and retrying due to editor placeholder "Continue asking" being mistaken for empty content.
- **WebDAV backup display fix**: Fixed backup list not showing on non-Jianguoyun WebDAV servers (e.g. Nextcloud, Synology, Aliyun Drive WebDAV) due to XML namespace prefix parsing failure.

## [1.0.12] - 2026-02-27

### 🚀 New Features

- **Prompt Queue**: A seamless new interaction experience that keeps your train of thought uninterrupted while AI is generating.

  - **Smart queue mechanism**: When entering prompts via the floating window, if AI is idle the prompt is sent immediately; if AI is generating, the prompt is automatically added to the floating queue and sent in sequence when AI is idle again.
  - **Immersive floating window (Ghost UI)**: Floats above the native input box providing a queue overview. Supports external invocation; double-clicking a prompt in the Prompts panel also uses this queue mechanism.
  - **Full management actions**: Supports one-click clear, delete, jump-send (force send), and displays an "Edit" button on hover before sending to support inline editing of multi-line long text.
  - **Highly customizable and adaptive**: Supports globally custom invocation shortcut (default `Alt+J`); the floating input box seamlessly expands width and height based on input content; bottom tip for closing guide.
  - **Deep infrastructure integration**: Global search (Double Shift) fully covers "Prompt Queue" settings; search and multilingual translation synchronized.

- **Prompt variable advanced usage**: Added default value and dropdown selection syntax support for prompt variables.
  - `{{variable:default_value}}`: Variable dialog pre-fills the default value on open for quick confirmation.
  - `{{variable:option1|option2|option3}}`: Variable dialog presents a dropdown selector for precise preset option selection.
  - Fully backward compatible with basic `{{variable}}` syntax; no need to modify existing prompts.

### 🐛 Bug Fixes

- **Prompt variables multilingual support**: Fixed prompt variables (`{{variable_name}}`) only supporting English letters and numbers; now fully supports Chinese, Japanese, Korean, Russian, and all languages and special characters.
- **Gemini Enterprise theme switch**: Fixed "Settings and Help" button not clickable due to Gemini Enterprise page update, which prevented theme-following-system switching.

## [1.0.11] - 2026-02-24

### New Features

- Added `Include thinking chain in export` toggle in export settings (enabled by default), supporting optional inclusion or exclusion of thinking chain content.
- Added export lifecycle capability: site adapters can implement pre-export preparation and post-export restoration, providing a unified extension point for future cross-site export enhancements.

### Improvements

- Gemini (standard) export now supports auto-expanding thinking chains in conversations and restoring original collapsed state and reading position after export.
- Gemini (standard) thinking chain export now presented as Markdown blockquote (`>`), clearly separated from the body and avoiding duplicate content.
- Global search settings retrieval now always uses the complete settings set for scoring, improving settings title hit rate in multilingual interfaces.
- Added `export-include-thoughts` settings index and title mapping to global search for direct location by name and keywords.
- Conversation list information density improved: title and tags now on the same line, preventing blank second-line placeholder for conversations without tags.
- Removed update time display from conversation list to prioritize title and tag information in the visible space.
- Multi-tag collapse enhanced: continues to show `+N` when tags exceed displayable count, with hover support to view full tag list (with tag colors and names).
- Narrow panel adaptation: automatically tightens tag display strategy at narrower widths to ensure title readability.
- Conversation action entry improved: right-side action buttons use lighter hover show/hide interaction to reduce interference with main information in default state.

### Bug Fixes

- Gemini (standard) outline extraction now filters `cdk-visually-hidden` auxiliary headings, fixing language-related hidden headings like "Gemini says" incorrectly appearing in the outline.
- Gemini (standard) export Markdown now cleans `cdk-visually-hidden` nodes before export to prevent auxiliary hidden headings from appearing in exported files.
- Added 10-language key values for `Include thinking chain in export` related text, fixing missing settings text in non-Chinese/English environments.

## [1.0.10] - 2026-02-15

### New Features

- Conversation management added "Cloud sync delete" capability, supporting batch trigger to also delete conversations from the site cloud after sync.
- Settings page sync delete text and capability description unified to a cross-site model for easier future expansion.
- Allow disabling double Shift global search shortcut.

### Improvements

- ChatGPT sync delete pipeline simplified and standardized reason codes, reducing redundant logic and debug branches.
- Claude organization ID parsing switched to environment-based routing with API fallback, improving plugin and script environment compatibility.
- Grok now uses API/UI dual-channel delete strategy; when cloud sync is enabled, page refreshes automatically after delete to keep the list consistent.

### Bug Fixes

- Fixed inaccurate remote failure count in conversation batch delete stats.
- Fixed Gemini / Gemini Enterprise UI delete flow stability issues, covering menu trigger, delete click, and completion state detection.
- Fixed Gemini Enterprise cloud delete success not removing local conversation in time.
- Fixed AI Studio cloud delete API instability causing rollback; switched to stable UI delete path.

## [1.0.9] - 2026-02-11

### 🚀 New Features

### ✨ Improvements

- Create/edit prompt dialog now disallows clicking overlay to close; retains button close and `Esc` close, preventing accidental close when releasing mouse outside the dialog after text selection.
- Category management dialog and "Rename category" input dialog unified to disallow overlay close for consistent interaction behavior.
- `ConfirmDialog` and `InputDialog` added `closeOnOverlayClick` config to control whether clicking overlay closes the dialog per scenario.
- `VariableInputDialog` integrated with shared `DialogOverlay`, unifying Portal, keyboard close, and overlay interaction behavior.
- Fixed `Esc` close order for multi-layer dialogs, now always closing the topmost dialog first.
- Global search result area refactored to "context bar + non-floating group titles", keeping main content fully visible during keyboard up/down navigation without group title obstruction.
- Global search keyboard navigation scroll strategy upgraded to "safe zone scroll", keeping highlighted items stably within the visible safe area, reducing edge jitter and jumpy feel.
- Global search added `combobox / listbox / option` ARIA semantics and `aria-activedescendant` linkage for improved keyboard and screen reader accessibility.
- Global search top-right shortcut label unified to `⌨ Ctrl+K / double shift`, with `Ctrl+K` weak hint added to search input placeholder for better shortcut discoverability.
- Added "contextual reminder" light hint: when user opens global search via UI, hints "next time press shortcut to open quickly" with support for dismissal and "don't show again".
- Contextual reminder frequency control and auto-convergence strategy: max once per day, total count limit, auto-dismiss, auto-stops reminding after shortcut usage threshold is reached.
- Global search context meta text changed to semantic expression (e.g. "Item X · Showing Y/Z"), reducing new user comprehension cost.
- Global search result area scroll improved: fixed horizontal overflow and beautified vertical scrollbar style for visual consistency.
- Global search hit reason tags completed: conversations (title/folder/tag), outline (title/type/number), prompts (title/category/content/ID), settings (name/keyword/ID/alias).
- Global search sort strategy enhanced: sorted by "exact match > prefix match > contains match > combined score > recent use", reducing misclicks and improving first-screen relevance.
- Prompts now show a one-line hit snippet preview with "Content hit:" prefix and keyword highlighting when matched by content.
- Fixed hit reason text garbled in multiple languages; unified 10-language text readability.
- Global search added "Fuzzy Search" capability (optional toggle) supporting spell-error-tolerant fallback matching, with "fuzzy match" label in results.
- Fuzzy match results show differentiated highlight style (distinct from exact match) to reduce misidentification cost.
- Global search "Fuzzy Search" default changed to off; users can enable in "Settings → Global Search" as needed.

### 🐛 Bug Fixes

- **Gemini watermark removal (standard)**: Fixed copy/download pipeline still getting watermarked or non-full-size images in some scenarios; unified to prioritize full-size watermark-removed results with safe fallback for copy pipeline.
- **Gemini watermark removal compatibility**: Improved extension and userscript interception strategy, cleaned up debug remnants, improved stability and consistency.
- Added `.gh-dialog-overlay` recognition in panel auto-hide and Portal active detection to prevent panel from being incorrectly retracted when dialog is open in Tampermonkey environment.
- Fixed global search `ArrowUp` navigation being covered by floating group titles.
- Fixed global search result area showing horizontal scrollbar at certain widths.

## [1.0.8] - 2026-02-11

### 🚀 New Features

- Added Search Everywhere global search dialog, triggered by double Shift / Ctrl(Cmd)+K, covering categories: All, Outline, Conversations, Prompts, Settings.
- Settings page added "Site Settings → Global Search" config page with prompt Enter behavior config (Smart/Locate only) and trigger method description.
- Quick button group added "Search" button (enabled by default) below the toolbox button for one-click global search access.
- Supports settings deep link location (page + sub-tab + row highlight) for precise navigation to specific settings.

![search](https://github.com/user-attachments/assets/4e004b47-98de-4d14-a3d7-60993ed85b1f)

### 🎨 UI & Interaction Upgrades

- Global search category bar and results area layout improved with category counts, All group rate limiting, and "Show more".
- Search results unified hit highlight style; conversation result meta info on one line (site/folder/tag).
- Outline results enhanced user query and AI reply hierarchy distinction for better readability.
- Fixed hover highlight jumping during rapid scroll (short-term hover lock).

### 🐛 Bug Fixes

- Fixed abnormal search result category height and keyboard up/down navigation not scrolling to visible area.
- Fixed global search text and category display inconsistency in multiple languages.
- Fixed global search results not refreshing in time after conversation switch or outline delayed load.
- Fixed inconsistent prompt search Enter behavior across scenarios (no variable: insert directly; with variable: open fill dialog).
- Fixed folder name emoji double display and dropdown text alignment; extracted shared `SelectDropdown` component for unified dropdown style.

### 🌍 Internationalization

- Completed key values for all new global search text in 10 languages, including categories, empty states, prompt behavior, site names, and in-page hints.

## [1.0.7] - 2026-02-08

### 🚀 New Features

- Added "Settings → Features → Prompts Tab" config: `Double-click prompt to send directly` (off by default); when enabled, double-clicking a prompt sends it directly; prompts with variables auto-send after variable confirmation
- Support custom send shortcut (Enter / Ctrl+Enter) #59

### 🎨 UI & Interaction Upgrades

- **Outline visual overhaul (Focus Card)**:
  - **Card design**: Completely refactored "user query" display style in the outline, using a refined card style (Focus Card) to stand out among headings.
  - **Visual anchor**: Added a left-floating "Pill Indicator" for clear visual rhythm in long lists.
  - **Interaction feedback**: Removed old highlight right-side vertical bar; replaced with **border color change and subtle glow** that better matches the card metaphor for immersive feedback during sync scrolling (Sync) and manual positioning (Locate).
  - **Dark mode adaptation**: All card colors, shadows, and highlight effects are theme-adaptive, perfectly supporting dark/black modes without jarring white backgrounds.

### 🐛 Bug Fixes

- **Outline highlight fix**: Fixed AI reply headings showing square corners in manual Locate mode (caused by sync style overriding), all highlight states now maintain perfect rounded rectangles.
- **Theme style improvements**:
  - **Dark mode upgrade**: Improved brand gradient colors for Classic Dark, Aurora, Cyberpunk, and other dark themes by reducing brightness to minimize glare and improve reading comfort.
  - **Button visual unification**: Refactored "Add Prompt" button style to match the bottom navigation button style (header background + hover shadow) for high UI language consistency.
  - **Contrast fix**: Fixed text contrast in dark mode to ensure bottom navigation buttons and other elements are clearly visible.
  - **Export filename optimization**: Changed export timestamp format from `YYYYMMDD_HHmmss` to more readable `YYYY-MM-DD_HH-mm-ss` for easier file management.

### 📜 License & Documentation

- **Open source license switch**: Project license migrated from `CC BY-NC-SA 4.0` to `GNU GPLv3`, with `package.json` SPDX identifier updated to `GPL-3.0-only`.
- **License text updated**: `LICENSE` file replaced with official GPLv3 text with copyright attribution.
- **Multilingual docs synced**: Main README and multilingual READMEs under `.github/readmes` updated to unified license badge and license description.
- **Authorization notice cleaned**: Removed "contact for commercial license" text from README to avoid ambiguity with GPL terms.

## [1.0.6] - 2026-02-07

### 🚀 New Features

- **System theme mode**: Added Follow System Theme, keeping panel and page theme in sync (including Gemini Enterprise system theme detection and switching).
- **System switch animation**: Consistent theme switch animation experience when manually switching to system mode.
- **New quick toolbox**: Added new entry point in button group operations, improving convenience for certain actions
- **Toolbox customization**: Added toolbox menu configuration, allowing users to freely customize buttons shown in the toolbox.
- **Auto full sync**: Changed to trigger based on whether current site/team data is empty, preventing false blocking by other site historical data.
- **Full sync stability**: Added sidebar ready wait and multi-round scroll sync to improve completeness in lazy-load scenarios.
- **Quick button transparency**: Added overall quick button group transparency adjustment (40%–100%) to reduce obstruction.
- **Quick button drag interaction**: Long-press shows progress hint, drag trigger clearer; drag position no longer persisted, switching panel position resets.
- **Export enhancements**: Support custom export filename (with automatic site prefix), Markdown content starts with H1 heading, and optional filename timestamp suffix.

### 🐛 Bug Fixes

- **Grok manual sync**: Fixed shortcut error when closing the "View All" dialog.
- **Multilingual sync**: Synced and completed missing translations for German, Spanish, French, Japanese, Korean, Portuguese, and Russian.
- **Code quality**: Fixed type definition issues in the export module.

### 🔧 Improvements

- **Config experience**: Moved toolbox settings to the "Basic Settings" page; added "Settings" button inside toolbox to directly open config dialog without navigating to a new tab.
- **Internationalization**: Toolbox menu and config items fully support 10-language display.
- **Export text**: Optimized "Export" button text to "Export Markdown" for clearer intent.
- **Settings improvements**: Improved export settings UI interaction, moved "Convert images to Base64" option to the bottom, improved input box experience.

## [1.0.5] - 2026-02-04

### 🚀 New Features

- **Outline word count**:
  - **Reply word count**: In the outline panel, each user query shows the word count of the corresponding AI reply (e.g. `1.2k`, `3.5k`) for quick content volume assessment.
  - **Heading word count**: Each heading node also shows the word count of its sub-content for content structure analysis.
  - **Thinking chain excluded**: Automatically excludes AI "thinking process" (Thinking/Reasoning) content, counting only actual reply word count.
  - **Optional toggle**: New "Show word count" option in settings panel, enabled by default and can be disabled as needed.
  - **Format optimization**: Large numbers auto-formatted (1000 → 1k) for a clean interface.

### 🔧 Improvements

- **AI Studio virtual scroll compatibility**: Added word count cache for AI Studio to solve word count loss caused by virtual scrolling.
- **Outline highlight flow refactored**: Changed to data-driven flow for improved consistency and maintainability.
- **Follow mode optimization**: Scroll highlight observer only enabled in follow mode, reducing unnecessary listeners.
- **Scroll tracking stability**: Improved highlight visibility and scroll tracking stability.
- **Dev experience**: Reduced hooks and logging related lint noise.
- **Settings disabled hint**: Clicking a setting with unmet dependencies prompts to enable the prerequisite setting first, with hint throttling to prevent frequent popups.
- **Quick button group optimization**: Improved button grouping and separator logic; anchor hints support localization; manual anchor button off by default.
- **Quick button position sync**: When panel default position switches to left, quick button group also moves to the left.

### 🐛 Bug Fixes

- **TypeScript type check**: Fixed `pnpm typecheck` failure due to missing error variable in `catch`.
- **Markdown export**: Fixed Markdown structure loss when exporting files and copying to clipboard (headings/lists/code blocks etc. restored).
- **Markdown export**: Fixed emoji garbled text (using Unicode codepoint + UTF-8 BOM to ensure correct encoding).
- **Outline scroll tracking**: Fixed unstable scroll tracking in some scenarios.
- **Outline navigation hint**: Overly long text is cleaned of whitespace and truncated to prevent hint overflow.

### ⚠️ Known Limitations

- **Gemini Enterprise**: Due to Shadow DOM limitations, new replies require page refresh to correctly display word count.

## [1.0.4] - 2026-02-02

### 🚀 New Features

- **Outline Favorites System**:

  - **Favorites**: Support bookmarking any outline node (click the star on the right side of the node) for quick access to important content.
  - **Filter mode**: New "Favorites Mode" toggle in toolbar; when enabled, only favorited content and its context is shown.
  - **Smart context**: Favorites mode automatically expands the path of favorited nodes and smartly hides irrelevant nodes for a clean view.

- **Inline Bookmarks**:

  - **Instant bookmarking**: Bookmark icon shown directly next to user queries and AI reply headings in the main page content without opening the sidebar.
  - **State sync**: Inline bookmark actions fully sync with the outline panel; solid yellow star indicates bookmarked.
  - **Smart visibility**: Unbookmarked icons show semi-transparent, brightening on hover to minimize visual distraction.

- **Global Custom Tooltip System**:

  - **Premium visual**: Introduced unified dark semi-transparent glassmorphism style tooltips, replacing native browser hints for a more refined and stable visual effect.
  - **Smart interaction**: Improved tooltip trigger logic for outline action buttons, supporting automatic hint switching when entering sub-buttons, and resolving layout jumps from nested triggers.
  - **Environment compatibility**: Resolved style loss issues for dialogs (Portaled Dialogs) in Shadow DOM environments.

- **UI Visual Upgrade**:

  - **Icon improvements**: Redrawn toolbar and list icons using rounder, fuller style for improved refinement.
  - **Layout improvements**: Improved action icon (copy, bookmark) layout and gradient mask to prevent long text from blocking.
  - **Search box highlight**: Unified focus style for prompt and outline search boxes, using theme blue instead of browser default black border for stronger interaction feel.

- **Outline shortcut enhancements**:

  - New `Alt + C`: Quick toggle outline favorites mode.
  - New `Alt + Shift + 4/5/6`: One-click expand outline to deeper levels (4–6).
  - New `Alt + Shift + Q`: One-click show only user queries (auto-enables display and resets expand level).

- **Panel width customization**: New panel width setting, adjustable from 200px to 600px.
- **Panel snap optimization**: Improved edge snap hide logic; snap always maintains 10px exposure regardless of panel width.

### 🔧 Improvements

- **All-language text improvement**: Ambiguous "Toggle Panel" text unified across all 10 languages to the clearer "Expand/Collapse Panel" for more explicit interaction intent.

- **Tooltip performance**: Improved tooltip component measurement and positioning algorithm, supporting `disabled` prop for dynamic disabling.
- **Text truncation**: Unified outline text truncation to 200 characters across all site adapters, removing hardcoded "..." suffix (handled by CSS).
- **Full node copy**: Enhanced copy functionality to support full text copy of all outline nodes (including regular headings and user queries) with smart full text extraction.

- **Config experience upgrade**:
  - Introduced `NumberInput` component to completely resolve conflicts between settings input boxes and Chinese input methods, and focus loss issues.
  - Adjusted panel default height to 85vh for a more comfortable visual experience.
  - Expanded panel default margin adjustable range to 0–400px.
  - Optimized snap trigger threshold default to 18px to reduce accidental triggering.
- **Panel interaction**: Improved panel behavior when clicking outside in "Edge Snap" mode; now retracts to edge instead of minimizing to floating ball.
- **Settings text**: "Auto-hide on click outside" description now dynamically updates based on snap state for more accurate interaction feedback.
- **Anchor state unified**: Refactored anchor management to use global `anchorStore` instead of scattered component states, resolving anchor state desync between panel buttons, shortcuts, and QuickButtons.

### 🐛 Bug Fixes

- **UI fix**: Fixed missing class name in prompt search box causing focus style failure.
- **Outline follow**: Enhanced scroll container detection to fix outline not correctly following reading progress on some sites. by @urzeye
- **Markdown fix**: Resolved Markdown rendering fix compatibility issues in streaming output scenarios. by @urzeye
- **Settings sync**: Fixed settings page input values potentially being overwritten by background sync during editing. by @urzeye
- **Position sync**: Fixed snap state being lost or not following correctly when switching panel default position in snap state.
- **Init state**: Fixed panel not correctly maintaining snap state after page refresh with edge snap enabled.
- **Outline navigation**: Fixed `Alt + ↑/↓` shortcut navigation potentially getting stuck on the same item or inaccurate jumps during continuous key presses; now uses "viewport distance check" to automatically distinguish continuous navigation from manual scrolling.
- **AI Studio bookmark fix**:
  - **Side-Channel Hydration**: Resolved AI Studio virtual scroll/lazy load preventing retrieval of user query text, causing empty or missing outline titles; now intelligently backfills text via sidebar (`ms-prompt-scrollbar`).

## [1.0.3] - 2026-01-29

### 🚀 New Features

- **ChatGPT Markdown fix**: Added ChatGPT bold text rendering fix, resolving Markdown `**bold**` not rendering correctly. by @urzeye

### 🐛 Bug Fixes

- Support Gemini multi-account `/u/<n>` URLs (keep single-user `/app` style). #16 by @lanvent
- **ChatGPT login issue**: Fixed ChatGPT not being able to log in normally. by @urzeye
- **Release workflow**: Fixed missing previous version number in GitHub Release Full Changelog comparison link. by @urzeye

### 🔧 Improvements

- **Adapter refactor**: Migrated Markdown fix config to adapter pattern for improved code maintainability. by @urzeye

## [1.0.1] - 2026-01-23

### 🚀 New Features

- **Userscript support**: Complete build support for Tampermonkey/GreaseMonkey scripts, extending usage beyond browser extensions.
- **Multilingual docs**: Published and synced detailed README docs in 8 additional languages (Japanese, Korean, Traditional Chinese, German, French, Spanish, Portuguese, Russian).
- **Engineering**: Added Pull Request template to standardize community contributions.

### 🐛 Bug Fixes

- **CI/CD**: Optimized documentation build workflow to avoid triggering unnecessary builds when only updating README files under the `docs` directory.
- **Documentation**: Fixed missing "Demo", "Local Build", and "Star History" sections in multilingual docs.

## [1.0.0] - 2026-01-18

### 🎉 Initial Release

This is the first official release of Ophel, providing comprehensive enhancement experience for Gemini, ChatGPT, Claude, Grok, and AI Studio.

### ✨ Core Features

#### Smart Outline Navigation

- Automatically parses AI reply content to generate a clickable table of contents outline
- Supports multi-level heading hierarchy
- Quick navigation to specific content positions

#### Conversation Management

- Organize conversations by folders
- Batch conversation operations
- Conversation search and location
- Sync native sidebar pin state

#### Prompt Library

- Rich built-in prompt templates
- Support custom creation and editing
- Group management and quick search
- One-click fill to input box

#### Shortcut System

- Rich keyboard shortcuts
- Support custom key bindings
- Covers common operation scenarios

#### Themes & Appearance

- 20+ carefully designed themes
- Separate light/dark mode themes
- Support custom page width

#### Reading History Restore

- Automatically saves reading position
- Restores last reading progress on reopen
- Intelligently distinguishes new content

#### WebDAV Sync

- Sync settings to personal WebDAV server
- Multi-device config sharing
- Full data control

### 🌐 Platform Support

- **Gemini** - Full feature support
- **Gemini Business** - Full feature support
- **ChatGPT** - Full feature support
- **Claude** - Full feature support
- **Grok** - Full feature support
- **AI Studio** - Full feature support

### 🌍 Multilingual Support

- Simplified Chinese
- Traditional Chinese
- English
- Deutsch
- Español
- Français
- 日本語
- 한국어
- Português
- Русский

### 🔒 Privacy Protection

- All data stored locally
- No remote data collection
- No third-party tracking
- Open source and transparent

---

[1.0.45]: https://github.com/urzeye/ophel/releases/tag/v1.0.45
[1.0.44]: https://github.com/urzeye/ophel/releases/tag/v1.0.44
[1.0.43]: https://github.com/urzeye/ophel/releases/tag/v1.0.43
[1.0.42]: https://github.com/urzeye/ophel/releases/tag/v1.0.42
[1.0.41]: https://github.com/urzeye/ophel/releases/tag/v1.0.41
[1.0.40]: https://github.com/urzeye/ophel/releases/tag/v1.0.40
[1.0.39]: https://github.com/urzeye/ophel/releases/tag/v1.0.39
[1.0.38]: https://github.com/urzeye/ophel/releases/tag/v1.0.38
[1.0.37]: https://github.com/urzeye/ophel/releases/tag/v1.0.37
[1.0.36]: https://github.com/urzeye/ophel/releases/tag/v1.0.36
[1.0.35]: https://github.com/urzeye/ophel/releases/tag/v1.0.35
[1.0.34]: https://github.com/urzeye/ophel/releases/tag/v1.0.34
[1.0.33]: https://github.com/urzeye/ophel/releases/tag/v1.0.33
[1.0.32]: https://github.com/urzeye/ophel/releases/tag/v1.0.32
[1.0.31]: https://github.com/urzeye/ophel/releases/tag/v1.0.31
[1.0.30]: https://github.com/urzeye/ophel/releases/tag/v1.0.30
[1.0.29]: https://github.com/urzeye/ophel/releases/tag/v1.0.29
[1.0.28]: https://github.com/urzeye/ophel/releases/tag/v1.0.28
[1.0.27]: https://github.com/urzeye/ophel/releases/tag/v1.0.27
[1.0.26]: https://github.com/urzeye/ophel/releases/tag/v1.0.26
[1.0.25]: https://github.com/urzeye/ophel/releases/tag/v1.0.25
[1.0.24]: https://github.com/urzeye/ophel/releases/tag/v1.0.24
[1.0.23]: https://github.com/urzeye/ophel/releases/tag/v1.0.23
[1.0.22]: https://github.com/urzeye/ophel/releases/tag/v1.0.22
[1.0.21]: https://github.com/urzeye/ophel/releases/tag/v1.0.21
[1.0.20]: https://github.com/urzeye/ophel/releases/tag/v1.0.20
[1.0.19]: https://github.com/urzeye/ophel/releases/tag/v1.0.19
[1.0.18]: https://github.com/urzeye/ophel/releases/tag/v1.0.18
[1.0.17]: https://github.com/urzeye/ophel/releases/tag/v1.0.17
[1.0.16]: https://github.com/urzeye/ophel/releases/tag/v1.0.16
[1.0.15]: https://github.com/urzeye/ophel/releases/tag/v1.0.15
[1.0.14]: https://github.com/urzeye/ophel/releases/tag/v1.0.14
[1.0.13]: https://github.com/urzeye/ophel/releases/tag/v1.0.13
[1.0.12]: https://github.com/urzeye/ophel/releases/tag/v1.0.12
[1.0.11]: https://github.com/urzeye/ophel/releases/tag/v1.0.11
[1.0.10]: https://github.com/urzeye/ophel/releases/tag/v1.0.10
[1.0.9]: https://github.com/urzeye/ophel/releases/tag/v1.0.9
[1.0.8]: https://github.com/urzeye/ophel/releases/tag/v1.0.8
[1.0.7]: https://github.com/urzeye/ophel/releases/tag/v1.0.7
[1.0.6]: https://github.com/urzeye/ophel/releases/tag/v1.0.6
[1.0.5]: https://github.com/urzeye/ophel/releases/tag/v1.0.5
[1.0.4]: https://github.com/urzeye/ophel/releases/tag/v1.0.4
[1.0.3]: https://github.com/urzeye/ophel/releases/tag/v1.0.3
[1.0.1]: https://github.com/urzeye/ophel/releases/tag/v1.0.1
[1.0.0]: https://github.com/urzeye/ophel/releases/tag/v1.0.0
