# Anonymous Health Telemetry Evaluation

## Status

Accepted for P4-04.

**Decision: No-Go for automatic or background transmission of adapter-health events, including a default-off telemetry setting.** Ophel will keep selector-health evidence local and retain the existing user-initiated GitHub issue flow. It will not add a telemetry endpoint, event queue, installation identifier, analytics SDK, new data-collection permission, or userscript tracking metadata.

This decision permanently shelves P4-04 under the current product and privacy model. A future proposal must satisfy every reconsideration gate below and undergo a new review instead of treating this report as implementation approval.

## Scope

P4-04 asks whether confirmed selector failures from P2-08 should be aggregated automatically so maintainers can detect site breakage before users file issues. The candidate feature is default-off, but after consent it would transmit events in the background from both the browser extension and userscript.

The evaluation covers:

- the usefulness of site, configuration, and failed-selector signals;
- whether those signals can honestly be described as anonymous;
- Firefox and Chrome Web Store disclosure and consent impact;
- userscript-manager and Greasy Fork disclosure impact;
- endpoint security, retention, abuse resistance, and operational ownership;
- alternatives that preserve the current local-first boundary.

No telemetry prototype or backend was built. The existing HealthCheckManager and manual report flow provide enough concrete data fields to evaluate the boundary without transmitting real user events.

## Current Trust and Data Boundary

The current selector-health feature is local-first:

- `HealthCheckManager` waits for two applicable failed page loads before warning, and stores its schema-versioned record under `sitepacks/health` in platform-local storage.
- The local record includes a site-instance key, configuration signature, page-load ID, timestamp, exact selector strings, failure groups, and consecutive-failure count.
- The warning UI sends nothing automatically. “Report issue” builds a GitHub issue URL only after the user clicks it, opens a visible editable form, and does not submit the issue.
- That explicit report includes the site name/ID, current origin, Ophel and adapter configuration versions, and exact failed selectors. It excludes the path, query string, page DOM, conversation text, and stored credentials.
- Remote SitePack/configuration updates use bounded GET requests with omitted credentials and do not upload health state or user data.

The public product promise is stricter than merely requiring consent:

- `package.json` declares Firefox `data_collection_permissions.required: ["none"]`.
- `README.md` advertises “zero data collection.”
- The published privacy documentation says Ophel has no analytics or usage telemetry and sends no data to Ophel infrastructure during normal use.
- The repository has no Ophel telemetry receiver, analytics SDK, event queue, stable installation identifier, retention policy, access-control model, or incident process for collected events.

Automatic telemetry would therefore create a new trust boundary rather than extend an existing service.

## Minimum Actionable Event

A report that only says “one selector failed” is not actionable. To select and publish a repair, maintainers need at least:

- built-in site ID or SitePack ID;
- active configuration/pack version;
- failed selector group such as `textarea`, `responseContainer`, or `chatContent`;
- Ophel version and platform type;
- a coarse event time.

The site or pack identifier is essential, but it also reveals which supported service was open when the event occurred. For self-hosted or locally imported packs, the origin and exact selectors would improve diagnosis further while creating substantially greater privacy risk. Hashing those fields does not remove the classification: a stable or enumerable hash remains derived from browsing activity and may be reversible against the small set of known sites.

## Data Classification

| Candidate field | Diagnostic value | Privacy and security impact | Decision |
| --- | --- | --- | --- |
| Failed selector group enum | Identifies the broken capability | Extension error/interaction data; low sensitivity alone | Local only under this decision |
| Built-in site ID / registry pack ID | Required to route a repair | Reveals a visited service or page category | Do not transmit automatically |
| Local pack ID | Routes a community-pack issue | May reveal a private or organization-specific integration | Never transmit automatically |
| Origin / `siteInstanceKey` | Distinguishes self-hosted instances | Can expose private hostnames, tenants, ports, and organization identity | Never transmit automatically |
| Exact selector strings | Gives direct repair evidence | User-authored selectors may contain text, account IDs, tokens, or private DOM conventions | Never transmit automatically |
| Configuration and Ophel versions | Separates fixed and affected cohorts | Technical data; rare tuples become identifying when combined | Local or explicit report only |
| Timestamp | Measures incident onset | Enables correlation with server and site logs | Local or coarsened only in a future review |
| Stable installation ID | Dedupe and cohort counting | Creates a persistent cross-site identifier | Prohibited |
| IP address, user agent, TLS and request metadata | Routing, abuse control, operations | Visible to the receiver or edge even when absent from the JSON body | Cannot be called anonymous without verified stripping and log controls |
| URL path, query, DOM, conversation text, cookies, storage | Not required for selector aggregation | May contain sensitive or authenticated user content | Prohibited |

## Privacy and Security Findings

### High

1. **The existing local snapshot is unsafe as a network payload.** It contains exact selectors and a site-instance key. Local SitePacks can encode organization-specific selectors, literal text, IDs, or attributes, while an origin can reveal a private deployment. Reusing the stored record or manual issue payload would violate data minimization.
2. **“Anonymous” cannot be guaranteed at collection time.** The receiving edge observes network metadata, and an event tuple containing site/pack, versions, platform, and time can be rare enough to correlate. Omitting a stable ID reduces longitudinal tracking but does not make the event anonymous.
3. **Useful telemetry changes the disclosed browsing-data boundary.** The site or pack identity is necessary to repair selectors. Firefox conservatively classifies the error fields as `technicalAndInteraction` and the visited-site signal as `browsingActivity`; exact selectors or page-derived values may also enter `websiteContent`. Chrome applies its User Data and Limited Use requirements even to aggregated, anonymized, de-identified, or derived data.

### Medium

1. **Consent would have three different authorities.** Firefox optional data-collection permissions, Chrome in-product prominent consent, and userscript settings/metadata must remain synchronized. An Ophel setting alone cannot override a revoked Firefox data permission, and userscript managers provide no equivalent standardized permission boundary.
2. **A public unauthenticated endpoint is easy to poison.** Selector-health events do not have a trustworthy device identity. Rate limiting by IP collects more metadata, while a persistent installation token creates the identifier the design is trying to avoid. Aggregates could be manipulated into triggering unnecessary registry changes.
3. **Collection creates an operational data system.** A receiver needs schema validation, request-size limits, origin isolation, retention and deletion rules, access logging, breach handling, availability monitoring, and an accountable operator. None exists in the current repository or product operations.
4. **Third-party analytics would widen disclosure and control.** Sending events to an analytics vendor adds another processor and SDK/update surface without solving the site-identity or consent problem.

### Low

1. **Default-off telemetry produces a biased sample.** Privacy-conscious users and managed environments are likely to decline, while long-tail self-hosted failures are precisely the events that cannot safely include enough identity. Counts would not represent the installed population.
2. **Duplicate suppression conflicts with unlinkability.** Reliable “affected users” counts need a stable key, but privacy-preserving events can safely count only reports. Page reloads, manager retries, and malicious clients can inflate that number.

## Platform and Policy Impact

### Firefox / AMO

The current manifest truthfully declares no collection with `required: ["none"]`. Mozilla defines transmitted crash/error and extension-usage metrics as `technicalAndInteraction`; that category cannot be required and must be declared as optional. Firefox exposes it during installation and through the extension's Permissions and data UI.

A default-off implementation would therefore need, at minimum:

- an optional `technicalAndInteraction` data-collection permission;
- a conservative review of whether the required site/pack identity also needs optional `browsingActivity`;
- `browser.permissions.request({ data_collection: [...] })` from a user-activated consent flow;
- runtime checks that disable collection when Firefox permission is absent or revoked;
- a fallback consent flow for Firefox versions without the built-in data-consent API;
- updated AMO listing and privacy documentation.

Keeping `none` while transmitting opted-in telemetry would be an inaccurate manifest declaration.

### Chrome Web Store

Chrome permits proportionate reliability analytics, but requires clear disclosure, data minimization, an accurate Privacy practices declaration, a privacy policy, and prominent in-product consent before collection. Chrome's Limited Use rules explicitly continue to apply to aggregated, anonymized, de-identified, and derived data.

An implementation would have to replace the current zero-collection store disclosures and product copy, document the exact fields, purpose, retention, sharing, and security controls, and add consent UX before the first event. A settings toggle whose surrounding copy still promises no analytics would not satisfy that standard.

### Userscript distribution

Tampermonkey, Violentmonkey, and ScriptCat do not provide a shared data-collection permission comparable to Firefox's built-in consent. Ophel would need its own explicit opt-in and revocation behavior. Greasy Fork treats tracking that benefits the author as an antifeature that must be disclosed through metadata, so the userscript listing and generated metadata would also change.

### Public documentation and localization

The English README and published English/Chinese privacy pages explicitly promise zero collection and no telemetry. Shipping collection would require a coordinated privacy-policy release, store-listing updates, settings and consent copy in all eleven application languages, backup/restore semantics for the preference, and clear separation from WebDAV and remote registry traffic.

Because this evaluation rejects telemetry, those declarations remain accurate and no user-facing text or manifest is changed.

## Approaches Considered

| Approach | Privacy boundary | Operational value | Decision |
| --- | --- | --- | --- |
| Keep local health state and user-previewed GitHub issue | No background transmission; user sees and can edit every submitted field | Lower volume, but reports are actionable and attributable to an explicit support request | **Go — current path** |
| Default-off background event with coarse allowlisted fields | Still transmits site identity plus technical/network metadata after consent | Earlier aggregate signal, but biased and requires full consent, policy, and backend work | **No-Go** |
| Batch events locally and upload periodically after opt-in | Reduces request frequency, not field sensitivity or receiver metadata | Better batching but worse event latency and queue lifecycle complexity | **No-Go** |
| Local differential privacy or randomized response | Can reduce confidence about one report | Sparse failures and many site/version cohorts make the result noisy; endpoint still sees transport metadata | **No-Go at current scale** |
| Third-party analytics/crash SDK | Mature ingestion and dashboards | Adds a processor, SDK, identifiers, and broader disclosures | **No-Go** |
| Explicit “copy diagnostic report” or existing issue form | User controls the transfer and destination | Preserves reviewability; can be improved with more redaction guidance | **Go as a manual support tool** |

## Decision Record

### Decision

Do not implement automatic selector-health telemetry in the extension or userscript. Do not add a telemetry setting that is merely dormant by default. Keep `sitepacks/health` local, keep Firefox `data_collection_permissions: none`, and keep the public zero-data-collection promise.

The existing GitHub issue action remains the escalation path because it is initiated by the user, opens a visible editable payload, and never submits automatically. Future improvements may make that preview clearer or remove fields, but must not turn it into background transport.

### Rationale

- The minimum actionable event necessarily identifies a site or pack, so the feature is not a content-free uptime counter.
- The network receiver and rare event tuple prevent an honest guarantee of anonymity.
- Existing local checks, manual reports, signed remote updates, and targeted real-site validation already form a repair loop without a new data controller.
- The expected sample is sparse and opt-in biased, while the policy, localization, backend, and trust costs are permanent.
- Preserving the current privacy promise is more valuable than an unproven reduction in selector-breakage detection time.

## Reconsideration Gates

A new proposal may reopen this decision only if it provides evidence for every gate:

1. at least three documented selector incidents were not detected within an agreed 72-hour target through manual reports, maintainer checks, or approved public-page smoke coverage;
2. a first-party receiver and accountable operator exist before client code is added, with a published schema, threat model, retention schedule, access policy, deletion process, and incident plan;
3. the payload is enforced by a strict allowlist and contains no origin, URL, route, exact selector, DOM-derived string, free-form text, local-pack identity, conversation data, credential, cookie, or storage value;
4. the design uses no stable installation or account identifier, no cookie, no fingerprint, and documents how duplicate and abuse handling work without introducing one;
5. IP and request metadata are stripped before application storage, infrastructure logging is documented, and raw-event retention has a short explicit maximum verified by deployment tests;
6. Firefox `technicalAndInteraction` and any required browsing-data permissions, Chrome disclosures and prominent consent, and userscript opt-in/antifeature metadata are implemented and tested as one revocable cross-platform consent state;
7. the English and Chinese privacy pages, README claims, store listings, and all eleven application locales describe the exact fields, purpose, destination, retention, and revocation behavior before release;
8. event authentication/poisoning, request size and rate limits, schema downgrade, replay, outage, and kill-switch behavior have automated tests and an independent security/privacy review;
9. a time-boxed PoC defines a quantitative success threshold and is deleted, including collected raw data, if it does not materially improve detection latency without false repair signals.

If any gate requires transmitting a site origin, exact selector, DOM content, or persistent identifier, the proposal remains No-Go.

## Consequences

### Positive

- Ophel keeps its local-first architecture, Firefox `none` declaration, and public zero-telemetry promise.
- Private origins, custom selectors, and conversation-page context cannot leak through an automatic diagnostic path.
- No telemetry backend, third-party processor, persistent identifier, consent drift, or new incident-response obligation is introduced.
- Maintainers continue receiving actionable evidence only when a user knowingly opens and submits a report.

### Negative

- Selector breakage may remain unknown until a user reports it or a maintainer reproduces it.
- Aggregate affected-installation counts are unavailable.
- Long-tail SitePack health cannot be ranked automatically.

### Neutral

- P3-08 public-page smoke remains a separate optional task and must meet its own stable-public-page coverage requirement.
- Local health records can continue to support warnings and recovery without becoming telemetry.
- Manual diagnostic UX may be improved later without changing the transmission boundary.

## References

### Repository evidence

- `src/core/health-check-manager.ts` local failure records and explicit GitHub issue URL
- `src/hooks/useAdapterHealthCheck.ts` user-triggered report action
- `docs/plans/2026-07-29-health-check-manager-design.md` explicit no-telemetry boundary
- `package.json` Firefox `data_collection_permissions.required: ["none"]`
- `README.md` zero-data-collection promise
- `docs/developer/site-adapter-pluginization-plan.md` privacy constraint and Phase 4 scope

### Published product documentation

- [Ophel privacy documentation](https://ophel.app/docs/data/privacy)
- [Ophel Chinese privacy documentation](https://ophel.app/docs/zh/data/privacy)

### Browser and distribution policy

- [MDN `browser_specific_settings.gecko.data_collection_permissions`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox built-in consent for data collection and transmission](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox best practices for collecting user data consents](https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/)
- [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Chrome Web Store privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Greasy Fork code rules](https://greasyfork.org/en/help/code-rules)
