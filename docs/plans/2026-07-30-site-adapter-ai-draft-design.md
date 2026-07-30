# Site Adapter AI Draft Prototype Design

## Status

Accepted for P4-02 implementation.

## Context

The Site Adapter Wizard already captures seven page roles, generates stable CSS selectors, validates live matches and containment, previews capabilities, and saves or exports a local SitePack. P4-02 asks whether a DOM snapshot can let an LLM produce a useful first selector draft before the user performs the same mandatory live review.

The repository has no generic LLM provider, API-key store, billing boundary, or privacy consent flow. Adding one provider directly would turn a low-priority prototype into a cross-platform account and policy feature. The prototype therefore needs to measure whether AI-generated selector drafts are useful without silently transmitting page data or introducing a second validation path.

## Decision

Implement a provider-neutral, user-mediated round trip inside the existing Wizard:

1. Ophel builds a bounded, sanitized structural snapshot of the current page.
2. The user explicitly copies a generated prompt and sends it to an AI assistant of their choice.
3. The AI returns one strict JSON object containing any subset of the seven wizard selectors.
4. The user pastes that JSON into Ophel and applies it.
5. Ophel resolves every selector against the live page and feeds the resulting selections into the existing wizard validation, containment, preview, save, and export pipeline.

Nothing is uploaded automatically. AI output is never treated as trusted configuration and cannot bypass the existing SitePack validator.

## Snapshot Contract

The snapshot is a candidate inventory rather than a raw `outerHTML` dump. It contains the page origin plus bounded structural records for likely inputs, controls, containers, message nodes, navigation items, and elements with stable attributes or classes.

Each record may contain:

- tag name;
- whitelisted semantic attributes such as `role`, `type`, `name`, `aria-label`, `data-testid`, `data-role`, and `data-message-author-role`;
- stable class names filtered through the existing selector-generator heuristic;
- a short composed ancestor path;
- whether the node is inside an open Shadow Root;
- a duplicate count for structurally identical candidates.

The snapshot never reads or includes conversation text, input values, `href`, `src`, inline styles, event attributes, cookies, local storage, or closed Shadow Root contents. Ophel's own Plasmo host and `gh-*` UI are excluded. Candidate count and serialized size are capped, and truncation is stated in the prompt instead of being hidden.

## AI Response Contract

The accepted response shape is:

```json
{
  "schemaVersion": 1,
  "selectors": {
    "textarea": "textarea[aria-label=\"Message\"]",
    "submitButton": "button[data-testid=\"send\"]",
    "responseContainer": "main[role=\"main\"]",
    "userQuery": "article[data-author=\"user\"]",
    "assistantResponse": "article[data-author=\"assistant\"]",
    "conversationItem": null,
    "newChatButton": null
  }
}
```

The parser accepts the JSON directly or as the sole fenced JSON block. Unknown root keys, unknown selector keys, wrong schema versions, non-string/non-null selector values, oversized responses, and selectors over the SitePack limit are rejected explicitly. It never uses `eval`, JavaScript expressions, XPath, or text pseudo-selectors.

Applying a response updates only selectors that parse and resolve to at least one live element. Missing, null, invalid, or non-matching fields do not erase existing manual work. Resolved selectors receive an `ai` source marker, then the existing wizard validation determines whether each field is valid, ambiguous, outside the response container, or still needs manual correction.

## UI and Interaction

Add a compact optional AI section below the Wizard header and above step progress. It stays collapsed by default and preserves the current information architecture.

The expanded section contains:

- a concise explanation that no data is sent automatically;
- the exact snapshot exclusions in plain language;
- a “Copy AI prompt” action with success/error feedback;
- a labeled response textarea;
- an “Apply draft” action disabled for empty input;
- applied/review/rejected counts and a direct reminder to inspect every step.

The section uses existing `--gh-*` variables, button hierarchy, focus-visible language, responsive panel scrolling, and reduced-motion behavior. It adds no theme variables and remains in `src/style.css`, which is already injected into extension and userscript Shadow Roots.

## Error and Privacy Model

- Clipboard unavailability or write failure is visible and does not change the draft.
- Invalid AI response JSON or schema is visible and does not change the draft.
- Invalid or non-matching individual selectors are reported and leave the corresponding existing selection intact.
- Partial valid responses are allowed because manual completion is the intended workflow.
- The component does not call a network API, store the copied prompt, persist AI responses, or add API-key settings.
- The prompt warns users to review the sanitized snapshot before sharing it when the host page itself is sensitive.

## Cost and Accuracy Evaluation

### Embedded provider API

No-go for this prototype. It would require provider selection, key storage, quota and billing UX, request transport for both platforms, privacy-policy updates, error localization, and a consent model. Those costs are disproportionate before selector usefulness is established.

### Host-site prompt insertion

No-go. It depends on an active adapter capability, can pollute the user's conversation, and cannot help on the unsupported sites where the Wizard is needed.

### Browser built-in Prompt API

No-go as the primary path because availability is browser/version/model dependent and would split extension and userscript behavior.

### Clipboard round trip

Selected. It has no provider cost, no new credentials, explicit user consent, and identical behavior across supported platforms. Its trade-off is one manual copy/paste round trip.

Accuracy is measured separately at three layers:

1. snapshot coverage: whether all seven target roles have usable structural candidates;
2. AI draft resolution: how many returned selectors match live elements;
3. wizard acceptance: how many resolved selectors pass identity, uniqueness, containment, and required-step validation.

The prototype report must not equate parser/apply success with general LLM accuracy. A small fixture matrix can establish the end-to-end baseline and identify where manual correction remains necessary; production accuracy claims require a named model, version, prompt, and representative site dataset.

## Alternatives Considered

### Send full HTML to an LLM

Rejected because it maximizes privacy exposure, token cost, and noise while including input values, conversation text, links, scripts, and unrelated page chrome.

### Accept a complete SitePack JSON from the LLM

Rejected for the first prototype. It asks the model to invent metadata and unsupported DSL fields, makes errors harder to localize, and duplicates the Wizard's existing manifest builder. The AI should suggest selectors only.

### Automatically accept selectors that match something

Rejected because a syntactically valid selector can still point to the wrong control, be dangerously broad, or escape the response container. Existing live validation remains authoritative.

## Verification

- Unit tests cover prompt framing and strict response parsing without a DOM dependency.
- A real-browser fixture covers snapshot redaction, candidate bounds, fenced JSON import, partial import, invalid response errors, live selector application, AI source labels, and mandatory wizard validation.
- Static UI review covers empty, success, partial-review, error, disabled, focus-visible, narrow viewport, light theme, dark theme, and reduced motion.
- Extension and userscript builds prove the same no-network prototype is bundled for both platforms.

## References

- `docs/developer/site-adapter-pluginization-tasks.csv` P4-02
- `docs/plans/2026-07-29-site-adapter-wizard-design.md`
- `docs/plans/2026-07-29-stable-element-selector-design.md`
- `DESIGN.md` sections 0, 1, 2, 5, 7, 9, 11, and 12
