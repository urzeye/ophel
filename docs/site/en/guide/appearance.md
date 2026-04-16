# Appearance & Themes

![Appearance & Themes settings — theme preview and switcher](/images/appearance/theme-preview.png)

## Light / Dark Mode

Ophel follows three modes:

- **Light** — always use the light theme
- **Dark** — always use the dark theme
- **System** — automatically match your operating system preference

Switch modes using the theme button in the floating quick buttons group, the `Alt+D` (Mac: `Option+D`) shortcut, or Settings → Appearance.

## Built-in Theme Presets

Each mode has 12 presets to choose from.

### Light Presets

| Name                        | Description                                   |
| --------------------------- | --------------------------------------------- |
| Google Gradient _(default)_ | Clean white with a blue-green gradient header |
| Violet                      | Soft purple accent palette                    |
| Ocean Blue                  | Calm sea-blue tones                           |
| Sakura                      | Delicate pink blossom palette                 |
| Mint                        | Fresh mint-green highlights                   |
| Nordic Frost                | Cool Nordic minimalism                        |
| Lemon Soda                  | Cheerful yellow-citrus palette                |
| Ancient Scroll              | Warm parchment and sepia tones                |
| Mono Pro                    | Minimal black-and-white typography            |
| Blue-and-White Porcelain    | Classic Chinese porcelain blue                |
| Shortbread                  | Warm cream and biscuit tones                  |
| Unicorn Dream               | Pastel gradient dream theme                   |

### Dark Presets

| Name                     | Description                            |
| ------------------------ | -------------------------------------- |
| Classic Dark _(default)_ | Deep gray panel, timeless and readable |
| Midnight Blue            | Deep blue night palette                |
| Dark Forest              | Muted green shadows                    |
| Cyberpunk Neon           | Electric neon on dark                  |
| Roasted Coffee           | Warm brown dark palette                |
| Sunset Dream             | Purple-orange sunset gradient          |
| Dracula                  | The beloved Dracula color scheme       |
| Deep Abyss               | Almost-black ultra-deep dark           |
| Crimson Moon             | Dark red and crimson accents           |
| Retro Terminal           | Hacker green-on-black terminal look    |
| EVA Unit-01              | Purple-and-green mecha-inspired        |
| Aurora                   | Cool teal aurora borealis              |

## Choosing a Theme

1. Open Settings (`Alt+,`, Mac: `Option+,`)
2. Go to **Appearance**
3. Select **Light** or **Dark** from the mode tabs
4. Click any preset card to preview and apply it

The transition uses a radial animation that expands from the point you clicked.

## Custom CSS

For full control over appearance, go to Settings → Appearance → **Custom CSS** and write your own CSS rules. The panel runs inside a Shadow DOM so your rules are isolated from the AI page.

The panel's styles use CSS variables prefixed with `--gh-`. You can override any of them in custom CSS. For example:

```css
:host {
  --gh-bg: #1a1a2e;
  --gh-primary: #e94560;
  --gh-text: #eaeaea;
}
```

Key variables:

| Variable              | Controls                                          |
| --------------------- | ------------------------------------------------- |
| `--gh-bg`             | Main panel background                             |
| `--gh-bg-secondary`   | Secondary background (sidebars, alternating rows) |
| `--gh-text`           | Primary text color                                |
| `--gh-text-secondary` | Muted text color                                  |
| `--gh-primary`        | Accent / active color (buttons, highlights)       |
| `--gh-border`         | Border color                                      |
| `--gh-shadow`         | Panel drop shadow                                 |
| `--gh-header-bg`      | Panel header background (supports gradients)      |
| `--gh-danger`         | Delete / destructive action color                 |
| `--gh-hover`          | Row hover background                              |

Changes apply instantly without reloading.
