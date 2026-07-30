# SitePack FAQ

## How is a SitePack different from a built-in adapter?

Built-in adapters may contain site-specific TypeScript for complex behaviors, while SitePacks are declarative JSON. SitePacks are suitable when stable selectors and the supported configuration DSL can describe the integration.

Built-in adapters take priority and cannot be overridden by a SitePack. Selector-only fixes for configured built-in adapters use the signed patch channel instead.

## Are community packs official Ophel code?

Registry packs are community-contributed manifests reviewed and published through the Ophel registry workflow. They use the same validator and signed distribution chain, but their supported capability set may be narrower than a built-in adapter. The management page shows the pack source and declared capabilities.

## Why does the extension request access to another domain?

Ophel needs optional host permission before it can register its content scripts on a SitePack origin. The request is limited to the pack's referenced HTTPS origins. Denying it rolls back the installation or binding operation.

## Why does the userscript build ask me to edit match rules?

Userscript managers decide where a script may run from `@match` rules. A running script cannot grant itself another match. Ophel therefore shows the exact patterns for you to add in Tampermonkey, Violentmonkey, or ScriptCat.

## Can one pack support self-hosted instances?

Yes. A pack can include `detect` rules and use an empty `matches` list. Bind each HTTPS origin from **Settings → SitePacks** using explicit mode or the detect pool.

Ophel stores each instance under a key derived from pack ID and origin, so settings, themes, reading history, and conversations do not mix between two deployments of the same pack.

## Do registry packs update automatically?

Registry-origin packs participate in the remote registry update flow. The client checks the signed index, version compatibility, immutable package hash, and runtime schema before applying an update. A failed or invalid download does not replace the last-known-good state.

Local imports do not update automatically. Import a higher-version local JSON file when you want to replace one.

## What happens when I disable or uninstall a pack?

Disabling keeps the manifest but stops it from activating. Uninstalling removes the manifest and its registration references. User settings and conversation data are retained.

An origin registration is removed only when no enabled pack or custom binding still references it.

## Can a SitePack run arbitrary JavaScript?

No. SitePacks intentionally reject scripts, expressions, executable callbacks, remote resources, and unrestricted CSS. Complex integrations that require imperative code must be implemented and reviewed as built-in adapters. The userscript L3 code-plugin mechanism is not part of the SitePack format.

## What page data is sent to the registry?

Installing or updating a registry pack performs static CDN GET requests for the signed index and package JSON. Those requests do not include conversation content, prompts, cookies, or page DOM.

The optional AI selector-draft helper also performs no automatic upload: it creates a bounded structural prompt only when you copy it, and you choose whether and where to share it.

## Is a local JSON import safe?

Local imports still pass the SitePack validator, so unknown fields and unsafe declarative values are rejected. They are not authenticated by the signed community registry, however. Review the target domains and capabilities and import only from a source you trust.

## A selector stopped working. What should I do?

First check for a registry or built-in configuration update. If the active version is already current, use the health warning's report action. Include the site, Ophel version, pack version, and failed selector names, but remove account details and private conversation content.
