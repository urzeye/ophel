# Site Adapter AI Draft Prototype Evaluation

## Scope

This report evaluates the P4-02 provider-neutral AI selector-draft prototype. It measures the local snapshot, strict response contract, live selector application, existing Wizard validation, privacy boundary, and UI states.

No external model was called. The selector drafts used below are deterministic fixture inputs, so these results must not be presented as general LLM accuracy.

## Prototype Boundary

- Ophel creates a bounded structural candidate inventory only after the user clicks the copy action.
- Nothing is uploaded automatically.
- The user sends the prompt to an AI provider of their choice and pastes selector-only JSON back into the Wizard.
- Prompt text and AI responses remain in component memory for the current page lifecycle and are not written to localStorage, sessionStorage, settings, or a SitePack.
- Imported selectors still pass through the existing live selector, uniqueness, containment, capability, and SitePack validation pipeline.

## Real-Browser Fixture

The Playwright Chromium fixture contained:

- all seven Wizard target roles;
- repeated user and assistant messages;
- conversation text, a populated textarea value, and a URL token used as privacy sentinels;
- generated/noisy classes;
- an open Shadow Root with semantic candidates and private text;
- an optional 4,200-element noise set for scan and size bounds.

The actual `SiteAdapterWizard`, AI draft core module, locale resources, and Shadow DOM CSS were loaded. Only platform actions unrelated to the prototype, such as saving a pack or opening a tab, were replaced with inert fixture adapters.

## Results

### Snapshot coverage

The baseline snapshot scanned 31 elements and included 16 grouped candidates. Stable structural records were present for all seven target roles:

| Wizard role | Fixture structure available to the snapshot |
| --- | --- |
| Message input | stable `id`, `name`, and `aria-label` |
| Send button | stable `id` and `data-testid` |
| Conversation container | stable `id`, `role`, and `data-testid` |
| User messages | `data-message-author-role=user`, grouped with 2 occurrences |
| Assistant messages | `data-message-author-role=assistant`, grouped with 2 occurrences |
| Conversation item | stable `data-testid` |
| New-chat button | stable `id` and `data-testid` |

Three candidates were recorded from the open Shadow Root. Closed Shadow Roots were intentionally inaccessible.

Snapshot coverage on this fixture: **7/7 roles (100%)**.

### Bounds and truncation

After adding 4,200 noisy elements:

- scanning stopped at the configured 4,000-element limit;
- 101 candidates fit before the character boundary;
- the compact serialized snapshot was 23,991 characters, below the 24,000-character limit;
- `truncated` was explicitly `true`;
- the complete formatted prompt was 41,533 characters because indentation and framing expand the bounded compact snapshot.

The prototype therefore exposes truncation rather than silently continuing. The formatted prompt size should still be considered when choosing an external model context window.

### Privacy observations

The copied prompt did not contain any of the fixture sentinels:

- conversation text: absent;
- textarea value: absent;
- URL token / `href`: absent;
- private Shadow Root text: absent;
- Ophel `gh-*` UI classes: absent.

The snapshot did include approved structural attributes such as `aria-label`, `name`, `role`, `data-testid`, and `data-message-author-role`. Users are still told to inspect the prompt before sharing it from a sensitive page.

### Response parsing and selector resolution

The browser flow accepted both direct JSON and a single fenced JSON block. Invalid JSON and an unsupported schema version produced localized errors without changing the draft.

A canonical seven-selector draft produced:

- live selector resolution: **7/7 (100%)**;
- existing Wizard acceptance: **7/7 (100%)**;
- manual corrections required: **0/7**;
- live outline and all expected capabilities available.

These numbers describe this controlled fixture and hand-authored draft, not an LLM run.

### Rejection and manual correction paths

The adversarial cases confirmed that matching an element is not treated as automatic acceptance:

- `button` resolved live for the send-button role but matched 10 controls, so the existing Wizard rejected it as non-unique and disabled progression.
- In a two-selector partial draft, the conversation container passed while the broad send-button selector remained in review: 1 accepted, 1 requiring correction.
- A non-matching replacement applied 0 selectors and preserved the existing manually edited textarea selector and its manual source marker.
- AI-applied selectors displayed a distinct AI source label; manual edits changed that label back to the existing manual source.

The demonstrated manual correction was replacing the broad `button` selector with the stable `#send-button` selector.

### UI and runtime checks

Verified states:

- collapsed by default and expanded native-details state;
- empty response with disabled apply action;
- keyboard focus-visible state on the response textarea;
- copied, complete-success, partial-review, parse/schema error, no-match, and clipboard-error feedback;
- clipboard errors do not mark an otherwise valid response textarea as invalid;
- 390 × 780 narrow viewport with no Wizard horizontal overflow;
- representative light and dark theme variables;
- reduced motion enabled, with Wizard animation disabled and AI summary/textarea transitions at `0s`;
- 0 console errors and 0 console warnings after fixture setup;
- 0 external network requests;
- no localStorage or sessionStorage entries.

## Provider and Cost Conclusion

The embedded-provider option remains a no-go for this prototype. Adding it would require credentials, provider selection, quota and billing UX, transport for two platforms, consent, policy changes, and localized provider errors before selector usefulness is established.

The implemented clipboard round trip adds no provider dependency, no Ophel API cost, no new credential storage, and no automatic data transfer. Any external model cost is chosen and paid under the user's existing provider arrangement and was not measured here.

## Limitations

- The fixture is synthetic and represents one page structure.
- No named model, model version, temperature, or repeated prompt run was evaluated.
- The 7/7 resolution and acceptance result used a hand-authored canonical selector draft.
- Open Shadow Root coverage does not imply access to closed Shadow Roots.
- Real model accuracy requires a representative multi-site dataset and separate reporting of snapshot coverage, returned-selector resolution, Wizard acceptance, and manual correction rate.

## Conclusion

The prototype establishes the requested privacy-preserving DOM snapshot → external AI draft → existing Wizard review loop at zero built-in provider cost. It is suitable as an optional draft accelerator, but the Wizard must remain authoritative and no broad LLM accuracy claim is supported by this evaluation.
