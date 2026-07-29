# Element Picker Overlay Design

## Context

P3-01 provides the page-level element picker used by the future SitePack wizard. The extension already mounts React inside a Plasmo Shadow Root, and dynamically registered SitePack origins reuse the same generic bundles. The userscript has the same Shadow DOM path but currently skips mounting when no adapter matches, which would prevent a wizard from starting on an authorized unsupported site.

## Goals

- Expose one asynchronous picker API that resolves with the selected element or an explicit cancellation result.
- Highlight the element under the pointer without changing host-page DOM or styles.
- Prevent selection clicks and context menus from triggering host-page actions.
- Support elements inside open third-party Shadow DOM through composed event paths.
- Keep page scrolling available and refresh geometry on scroll or resize.
- Detect iframe targets, block accidental entry into the child document, and explain that iframe selection is unsupported.
- Reuse the existing Shadow DOM, theme variables, localization, and extension/userscript style paths.

## Non-goals

- Generate or validate CSS selectors; that belongs to P3-02.
- Add the complete multi-step wizard or its public entry points; that belongs to P3-03.
- Inspect iframe contents or bridge picker events into child frames.
- Persist picker state or selected elements.
- Add a second overlay root, stylesheet, or theme source.

## Alternatives Considered

### 1. Singleton controller plus React overlay — selected

A page-scoped controller owns the active request, stable snapshot, pending promise, and completion semantics. A React component subscribes with `useSyncExternalStore`, attaches capture listeners only while active, and renders viewport geometry in the existing Shadow Root. This gives P3-02/P3-03 a small imperative API while preserving one state source and the current UI/theme architecture.

### 2. React component owns all picker state

The wizard could pass callbacks into a picker component. This is simpler for one screen but couples the DOM interaction lifecycle to a future wizard tree and makes starting the picker from settings or another surface awkward.

### 3. Inject picker nodes into the host document

Direct document overlays make viewport geometry straightforward, but they pollute host DOM/CSS, create theme duplication, and conflict with the project rule to reuse the panel Shadow DOM.

## Controller Contract

`ElementPickerController` is the only in-memory state source:

- `start()` enters picking mode and returns a promise.
- A second `start()` while active rejects with a dedicated busy error; it never replaces the first request.
- `setHoveredElement()` records the current element, copied viewport rect, and whether it is an unsupported iframe.
- `select()` resolves `{ status: "selected", element }` and resets to the frozen idle snapshot.
- `cancel()` resolves `{ status: "cancelled", reason }` and resets to idle.
- `subscribe()` and `getSnapshot()` support React without duplicate component state.

The snapshot may hold a live `Element` reference because it never leaves the page, is cleared on completion, and is needed by P3-02. Geometry is copied into a plain immutable object so rendering does not depend on a mutable `DOMRect`.

## Event and Target Resolution

While active, the overlay installs capture listeners on the document/window:

1. `pointermove` takes the first `Element` from `event.composedPath()`, preserving the real target inside open Shadow DOM.
2. Any path rooted in Ophel's own Shadow Root is ignored, so the picker cannot select its instruction card or highlight nodes.
3. Geometry work is coalesced through one `requestAnimationFrame`; pointer moves, scroll events, and resize events update at most once per frame.
4. Primary `pointerdown` is prevented and stopped but does not complete selection. The subsequent captured `click` is also prevented and stopped, then resolves selection. Keeping the controller active through `click` prevents the host handler from firing after cleanup.
5. `contextmenu` is prevented and stopped. `Escape` cancels explicitly.
6. Scrolling remains unlocked. Window resize and capture-phase scroll refresh the current element or clear a disconnected target.

Iframe elements are hover targets but not selectable. The overlay renders a transparent pointer-enabled guard over the iframe rectangle so events cannot enter the child document. Clicking the guard is intercepted and leaves the picker active while the instruction card shows the localized unsupported message.

## Rendering and Styling

`ElementPickerOverlay` always exists under `.gh-root` but renders nothing while idle. During picking it renders a viewport layer, target highlight, optional iframe guard, element label, and compact instruction card.

Styles live in `src/style.css`, which already reaches both Plasmo and userscript Shadow Roots. Colors use existing `--gh-*` variables with fallbacks. The short entrance transition is disabled by `prefers-reduced-motion`.

## Adapter-less Mounting

`App` returns a minimal `.gh-root` containing `ElementPickerOverlay` when adapter-backed managers are unavailable. Existing supported-site UI remains unchanged. The userscript mounts the Shadow Root before checking for an adapter, then skips adapter/core initialization when unmatched. This enables future wizard calls on custom userscript matches without broadening host permissions.

## Error Handling and Lifecycle

Busy starts reject visibly. Invalid selection attempts throw instead of resolving false success. Component unmount cancels an active request with reason `unmounted`, and removes every listener and pending animation frame. Disconnected hovered nodes clear the highlight. No broad fallback or host-page mutation is introduced.

## Verification

- Run a focused controller smoke for start, busy rejection, hover updates, selection, cancellation, and restart.
- Check all 11 application locale dictionaries.
- Run format, lint, typecheck, extension build, userscript build, and `git diff --check`.
- Review the final diff for duplicate state, host DOM injection, event leaks, userscript regressions, and accidental inclusion of the user's `.gitignore` change.
