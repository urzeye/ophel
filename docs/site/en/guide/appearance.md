# 🎨 Appearance

This page maps to `AppearancePage.tsx` and focuses on theme presets plus custom styles. It does not manage font size, panel layout, or other settings from different menus.

## Structure

| Tab           | Purpose                                    |
| ------------- | ------------------------------------------ |
| Theme Presets | Choose built-in light/dark presets         |
| Custom Styles | Create, edit, and delete custom CSS styles |

## Theme Presets

### Dual preset sets

- Light presets: 12 (`lightPresets`)
- Dark presets: 12 (`darkPresets`)
- Total built-in presets: 24

### How they apply

- Each site stores `lightStyleId` and `darkStyleId` independently
- In `system` mode, style switches with OS light/dark mode
- In fixed light/dark mode, only that mode’s preset ID is updated

> Theme mode switching (Light / Dark / System) is in the settings sidebar footer, not inside the Appearance cards.

## Custom Styles

### Style fields

- Style name (required)
- Mode scope (Light / Dark)
- CSS content

### Editor capabilities

- CSS syntax highlighting
- In-place editing
- Saved custom styles appear directly in preset grids

### Management actions

- Add style
- Edit style
- Delete style (with confirmation)

## Example variables to override

The theme system uses `--gh-*` variables. Example:

```css
:host {
  --gh-primary: #4285f4;
  --gh-bg: #ffffff;
  --gh-text: #1f2937;
  --gh-border: #e5e7eb;
}
```

## Recommended workflow

1. Start from the closest built-in preset.
2. Fine-tune with custom CSS.
3. Maintain separate light/dark custom styles for stable contrast.

## Related pages

- [Settings Center Overview](/en/guide/enhancements)
- [Shortcuts](/en/guide/shortcuts)
