/**
 * Latin-only @font-face for "Inter" that works without a bundled woff2.
 *
 * This provides the same unicode-range restriction as the woff2 rule injected by
 * ui-entry.tsx (extension), ensuring:
 *   - Latin glyphs → resolved via local system fonts (Helvetica Neue, Arial, …)
 *   - CJK glyphs  → fall through to the explicit CJK fonts in the :host stack
 *
 * Include this in every isolated Shadow Root (zen exit button, update-notice card,
 * toast fallback, options page …) that does NOT inherit styles from the main
 * Ophel Shadow DOM where style.css already declares this @font-face.
 */
export const INTER_LOCAL_FONT_FACE = `@font-face {
  font-family: "Inter";
  src:
    local("Inter"),
    local("InterVariable"),
    local("Helvetica Neue"),
    local("Arial"),
    local("Roboto"),
    local("Liberation Sans");
  font-style: normal;
  font-weight: 100 900;
  unicode-range:
    U+0000-02FF, U+0304, U+0308, U+0329, U+0370-03FF, U+1D00-1DBF, U+1E00-1EFF,
    U+1F00-1FFF, U+0400-052F, U+1C80-1C88, U+2116, U+2DE0-2DFF, U+A640-A69F,
    U+1EA0-1EF9, U+20AB, U+2000-206F, U+20A0-20C0, U+20AC, U+2113, U+2122,
    U+2191, U+2193, U+2212, U+2215, U+2C60-2C7F, U+A720-A7FF, U+FEFF, U+FFFD;
}`

/**
 * CJK-first font-family stack for inline React styles.
 *
 * Matches the :host and .settings-layout declarations in style.css / settings.css.
 * Use wherever fontFamily cannot be inherited from a parent Shadow Root rule,
 * e.g. inline React style={{ fontFamily }} overrides on panel/page root elements.
 */
export const INTER_CJK_FONT_FAMILY =
  '"Inter", "PingFang SC", "Hiragino Sans SC", "Apple SD Gothic Neo", "Malgun Gothic", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif'
