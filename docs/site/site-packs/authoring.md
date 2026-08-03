# Author a SitePack

A SitePack is a declarative JSON manifest. It describes where Ophel may run, which page elements represent chat roles, and which capabilities are safe to expose. It cannot execute JavaScript or load remote code.

This tutorial follows the official [Duck.ai manifest](https://github.com/urzeye/ophel/blob/main/registry/sites/duck-ai.json). Use the repository's Site Adapter Wizard to create a first local draft, then review and simplify every selector before contributing it.

## Start from the example

Copy [`registry/examples/site-pack.example.json`](https://github.com/urzeye/ophel/blob/main/registry/examples/site-pack.example.json) to `registry/sites/<id>.json`, or export a local JSON draft from the Wizard.

Do not add a `$schema` property to the manifest. The repository maps SitePack JSON files to the editor schema externally, while the runtime rejects unknown keys.

## Identity and compatibility fields

```json
{
  "schemaVersion": 1,
  "id": "duck-ai",
  "version": 1,
  "minAppVersion": "1.1.8"
}
```

- `schemaVersion` is currently `1`.
- `id` is a globally unique lowercase ID using letters, digits, and hyphens. It must not collide with a built-in site ID or another registry pack.
- `version` is a positive integer. Increase it for every published change; published versions are immutable.
- `minAppVersion` is the earliest Ophel version that understands the fields and behavior you verified.

## Name and description

```json
{
  "name": "Duck.ai",
  "nameI18n": { "en": "Duck.ai", "zh-CN": "Duck.ai" },
  "description": "Adds Ophel outlines, export, generation controls, layout tools, and prompt insertion to Duck.ai.",
  "descriptionI18n": {
    "en": "Adds Ophel outlines, export, generation controls, layout tools, and prompt insertion to Duck.ai."
  }
}
```

`name` and `description` are the fallback strings. `nameI18n` and `descriptionI18n` override them for matching languages. The application resolves the current language first, then English, then the fallback field.

Registry contributions should provide all eleven project languages when user-facing metadata is added or changed.

## Match the target site

```json
{
  "matches": ["https://duck.ai/*"]
}
```

`matches` accepts at most ten HTTPS extension match patterns. Global matches, top-level host wildcards, overlaps with built-in sites, and overlaps with existing packs are rejected.

For self-hosted applications, `matches` may be empty. The pack then activates only on HTTPS origins that users bind to it from the SitePack management page.

## Declare capabilities honestly

Duck.ai declares only the features covered by its configuration:

```json
{
  "capabilities": [
    "outline",
    "outline-user-queries",
    "export-basic",
    "generation-detect",
    "new-chat",
    "stop-generation",
    "width",
    "zen",
    "prompt-insert"
  ]
}
```

Capabilities are a UI contract, not marketing metadata. Each one requires supporting fields. For example, `prompt-insert` requires a textarea selector and `input`; `export-basic` requires `export`; `width` requires `widthSelectors`; and `zen` requires `zenMode`.

If a feature is not verified, omit the capability. Ophel hides unsupported controls automatically.

## Select the chat elements

```json
{
  "selectors": {
    "textarea": ["textarea[name='user-prompt']"],
    "submitButton": ["[data-testid='duckai-chat-input'] button[type='submit']"],
    "responseContainer": "section:has([data-testid='duckai-chat-input'])",
    "userQuery": "[data-testid='user-message']",
    "assistantResponse": "[data-activeresponse='true'] > :nth-child(2)",
    "newChatButton": ["[data-testid='duckai-sidebar'] > div > div:has([role='search']) + div button[type='button']"],
    "stopButton": ["[data-testid='duckai-chat-input'] div:has(> button[type='submit']) + div > button[type='button']"]
  }
}
```

- `textarea` identifies supported text inputs or contenteditable editors.
- `submitButton` identifies the send action.
- `responseContainer` scopes the conversation for outline and containment checks.
- `userQuery` and `assistantResponse` may match repeated message elements.
- `newChatButton` and `stopButton` enable their corresponding actions.

Prefer stable `data-testid`, stable IDs, semantic attributes, and short structural relationships. Avoid generated hashes, utility-only classes, translated visible text, and brittle positional selectors when a stable attribute exists.

Duck.ai's assistant selector uses `:nth-child(2)` because the verified page structure did not expose a better semantic attribute. Treat positional selectors as a last resort and document the real-browser evidence in the pull request.

## Configure input behavior

```json
{
  "input": {
    "mode": "textarea",
    "submitKey": "Enter"
  }
}
```

`mode` is either `textarea` or `contenteditable`. Ophel uses the native value setter for textareas and its validated beforeinput/execCommand strategy for contenteditable editors. It does not silently fall back to assigning `textContent`.

`submitKey` records whether the site submits with `Enter` or `Ctrl+Enter`.

## Detect generation

```json
{
  "generating": {
    "existsSelectors": [
      "[data-testid='duckai-chat-input'] div:has(> button[type='submit']) + div > button[type='button']"
    ]
  }
}
```

`generating.existsSelectors` marks the site as generating while any configured element is visible. A pack may instead use a validated `networkMonitor` configuration when DOM state is insufficient.

## Configure basic export

```json
{
  "export": {
    "userQuerySelector": "[data-testid='user-message']",
    "assistantResponseSelector": "[data-activeresponse='true'] > :nth-child(2)",
    "turnSelector": null,
    "useShadowDOM": false
  }
}
```

The two message selectors identify export content. `turnSelector` is a shared per-turn wrapper when one exists; Duck.ai uses `null`. Set `useShadowDOM` only when the messages are inside an open Shadow Root that the declarative adapter must traverse.

## Configure Zen mode

```json
{
  "zenMode": {
    "hide": ["[data-testid='duckai-sidebar']", "[data-testid='duckai-top-toolbar']"]
  }
}
```

`zenMode.hide` lists page chrome that can be hidden while Zen mode is active. Keep the list narrow and never hide the conversation or required input controls.

## Configure width controls

```json
{
  "widthSelectors": [
    {
      "selector": "section:has([data-testid='duckai-chat-input']) div:has(> [data-testid='user-message'])",
      "property": "max-width",
      "extraCss": "width: 100% !important; box-sizing: border-box !important;"
    },
    {
      "selector": "form:has([data-testid='duckai-chat-input'])",
      "property": "max-width",
      "extraCss": "width: 100% !important; box-sizing: border-box !important;"
    }
  ]
}
```

Each entry identifies an element and the width-related property Ophel controls. Optional `extraCss` is passed through the restricted CSS-value validator. Remote resource functions, imports, expressions, and JavaScript URLs are rejected after decoding and normalization.

## Validate and contribute

Run the same source checks used by the registry workflow:

```bash
pnpm registry:validate
pnpm registry:build
```

Then verify the declared capabilities on the real site, including reload stability and both idle/generating states. Submit the JSON with the [SitePack pull request template](https://github.com/urzeye/ophel/blob/main/.github/PULL_REQUEST_TEMPLATE/site-pack.md) and follow the [review checklist](https://github.com/urzeye/ophel/blob/main/docs/developer/site-pack-review-checklist.md).

The [JSON Schema](https://github.com/urzeye/ophel/blob/main/registry/schema/site-pack.schema.json) provides editor assistance, but `src/adapters/declarative/validate.ts` remains authoritative for runtime, regex, selector, CSS, overlap, and serialized-size rules.
