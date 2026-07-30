# SitePacks

SitePacks add declarative support for AI chat sites that are not built into Ophel Atlas. A pack is a reviewed JSON manifest containing site match rules, stable DOM selectors, and the capabilities those selectors enable.

SitePacks do not contain arbitrary JavaScript. Ophel loads them through the same runtime validator, permission boundary, and feature-capability system used by the community registry.

## Choose a path

- [Install and manage a SitePack](./installation) if you want to add support for a community or self-hosted site.
- [Author a SitePack](./authoring) if you want to create or contribute a selector-based integration.
- [Read the FAQ](./faq) for permissions, updates, userscript behavior, privacy, and built-in adapter differences.

## What a SitePack can provide

Depending on its declared capabilities, a SitePack can enable:

- conversation outlines and user-query headings;
- prompt insertion and submit behavior;
- basic conversation export;
- generation and stop-button detection;
- new-chat actions;
- width and Zen mode controls;
- reading history, model locking, or conversation-list integration when the required configuration is present.

The management page only shows controls backed by the active pack's capability declaration. A pack should therefore declare only behavior that has been verified on the target site.

## Trust boundary

Registry packages are downloaded from immutable version paths, checked against the signed registry index and SHA-256 digest, and then validated locally. Local JSON imports skip the registry trust chain, so import them only from a source you trust and review their domains and capabilities first.
