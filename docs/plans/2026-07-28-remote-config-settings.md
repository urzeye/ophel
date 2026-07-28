# Remote Config Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a cross-platform settings section for controlling, inspecting, manually checking, and locally resetting adapter configuration updates.

**Architecture:** Keep `RemoteConfigManager` and its persisted snapshot as the only remote-config state source. Add one shared persisted-settings parser for the automatic-update gate, expose remote-config actions through `platform.remoteConfig`, and let the extension implementation delegate to the background while the userscript implementation calls the runtime manager directly. Render the UI as a fifth General-page tab and reset configurable adapters in memory immediately after the ignored patch is persisted.

**Tech Stack:** TypeScript, React 18, Zustand persist, Chrome Extension MV3 APIs, userscript GM storage, Plasmo/Vite, native CSS, project i18n resources.

---

### Task 1: Persist the automatic-update preference

**Files:**
- Modify: `src/types/settings.ts`
- Modify: `src/constants/default-settings.ts`
- Modify: `src/utils/settings-normalize.ts`
- Create: `src/utils/persisted-settings.ts`
- Modify: `docs/developer/settings-schema.json`

**Step 1: Add the settings shape and default**

Add `remoteConfig: { autoUpdate: boolean }` to `Settings`, with `autoUpdate: true` in `DEFAULT_SETTINGS` and the developer schema.

**Step 2: Normalize partial and legacy settings**

Merge `settings.remoteConfig` over `DEFAULT_SETTINGS.remoteConfig` in `normalizeSettings`, so old backups and installations inherit the enabled default without losing newer values.

**Step 3: Parse persisted settings explicitly**

Implement a shared helper that accepts the formats currently present in storage:

```ts
type PersistedSettingsEnvelope = {
  state: {
    settings: SettingsInput
  }
  version?: number
}
```

The helper must accept JSON strings, object envelopes, and legacy bare settings objects. Missing storage or a missing `remoteConfig.autoUpdate` field resolves to the default; malformed JSON, malformed envelopes, or a non-boolean stored value throws a descriptive error.

**Step 4: Verify the settings layer**

Run: `pnpm exec prettier --check src/types/settings.ts src/constants/default-settings.ts src/utils/settings-normalize.ts src/utils/persisted-settings.ts docs/developer/settings-schema.json`

Expected: all listed files pass formatting.

Run: `pnpm typecheck`

Expected: no TypeScript errors.

**Step 5: Commit**

```bash
git add src/types/settings.ts src/constants/default-settings.ts src/utils/settings-normalize.ts src/utils/persisted-settings.ts docs/developer/settings-schema.json
git commit -m "feat(settings): add remote config update preference"
```

### Task 2: Gate automatic checks on both platforms

**Files:**
- Modify: `src/background.ts`
- Modify: `src/platform/userscript/remote-config.ts`
- Modify: `src/platform/userscript/entry.tsx`

**Step 1: Gate extension alarms and scheduled checks**

Before creating the alarm or running any non-forced check, read `remoteConfig.autoUpdate`. When disabled, clear `REMOTE_CONFIG_ALARM_NAME` and do not call the registry transport. Keep forced/manual checks available.

**Step 2: Synchronize the alarm on settings changes**

Watch the persisted `settings` key. Enabling the setting creates or repairs the periodic alarm; disabling it clears the alarm immediately. If persisted settings are malformed, fail closed by clearing the alarm and logging the parser error.

**Step 3: Gate userscript startup checks**

Read the same shared setting before the startup check. Return `null` when automatic checks are disabled and update the userscript entry handler to accept that no-check result. Manual checks remain forced.

**Step 4: Verify the gate statically**

Run: `pnpm exec prettier --check src/background.ts src/platform/userscript/remote-config.ts src/platform/userscript/entry.tsx`

Expected: all listed files pass formatting.

Run: `pnpm typecheck`

Expected: no TypeScript errors.

**Step 5: Commit**

```bash
git add src/background.ts src/platform/userscript/remote-config.ts src/platform/userscript/entry.tsx
git commit -m "feat(remote-config): respect automatic update setting"
```

### Task 3: Expose remote-config actions through the platform facade

**Files:**
- Modify: `src/platform/types.ts`
- Modify: `src/platform/index.ts`
- Modify: `src/platform/extension/index.ts`
- Modify: `src/platform/userscript/index.ts`
- Modify: `src/platform/userscript/remote-config.ts`
- Modify: `src/utils/messaging.ts`
- Modify: `src/background.ts`

**Step 1: Define the facade**

Add `platform.remoteConfig` with these explicit methods:

```ts
interface PlatformRemoteConfig {
  getState(): Promise<RemoteConfigState>
  checkForUpdates(): Promise<RemoteConfigCheckResult>
  resetSite(siteId: string, patchVersion?: number): Promise<boolean>
}
```

**Step 2: Implement extension messaging**

Add a typed background message for reading the current state. Reuse the forced check and ignore-patch messages for the other methods, throwing when the background reports failure instead of returning a false success.

**Step 3: Implement userscript direct calls**

Use dynamic imports from the userscript platform implementation to avoid a static `platform` ↔ `remote-config-runtime` cycle. Return the manager state, run forced checks, and persist the ignored patch before resetting the in-memory adapter.

**Step 4: Verify facade types**

Run: `pnpm typecheck`

Expected: both platform objects satisfy the expanded `Platform` interface and all message responses are typed.

**Step 5: Commit**

```bash
git add src/platform/types.ts src/platform/index.ts src/platform/extension/index.ts src/platform/userscript/index.ts src/platform/userscript/remote-config.ts src/utils/messaging.ts src/background.ts
git commit -m "feat(platform): expose remote config controls"
```

### Task 4: Apply local patch resets immediately

**Files:**
- Modify: `src/adapters/index.ts`
- Modify: `src/contents/main.ts`
- Modify: `src/utils/messaging.ts`
- Modify: `src/background.ts`
- Modify: `src/platform/userscript/remote-config.ts`

**Step 1: Add the adapter reset primitive**

Implement `resetBuiltinSiteConfig(siteId)` by locating the matching configurable built-in adapter and reapplying `getBuiltinConfig()`. Return `false` for unknown or non-configurable sites.

**Step 2: Broadcast extension resets**

After the background successfully ignores a patch, broadcast a typed reset message to supported tabs and wait for the broadcasts to settle before replying to the settings UI.

**Step 3: Handle the reset in content scripts**

Register the reset message in `src/contents/main.ts` and invoke the adapter primitive so the current page stops using the cached patch without a reload.

**Step 4: Reset userscript adapters after persistence**

After `ignorePatch` succeeds, dynamically import `~adapters`, call the same primitive, and propagate failure if the site cannot be reset.

**Step 5: Verify reset behavior**

Run: `pnpm typecheck`

Expected: no TypeScript errors and both platform paths use the same adapter reset primitive.

**Step 6: Commit**

```bash
git add src/adapters/index.ts src/contents/main.ts src/utils/messaging.ts src/background.ts src/platform/userscript/remote-config.ts
git commit -m "feat(adapter): reset ignored patches immediately"
```

### Task 5: Add the General-page configuration updates tab

**Files:**
- Create: `src/tabs/options/components/RemoteConfigSettingsCard.tsx`
- Modify: `src/tabs/options/components/index.ts`
- Modify: `src/tabs/options/pages/GeneralPage.tsx`
- Modify: `src/styles/settings.css`
- Modify: `src/constants/ui.ts`
- Modify: `src/components/global-search/settingsSearch.ts`

**Step 1: Build the status card**

Render:

- the persisted automatic-update toggle;
- a manual check button that remains enabled when automatic updates are off;
- registry revision and last-check time;
- active patch rows with site name, patch version, base version, and reset button;
- an empty state when all sites use built-in configuration;
- a privacy notice stating that checks are static CDN GET requests without user data;
- loading, updated, up-to-date, failed, and reset feedback using `role="status"` or `role="alert"` as appropriate.

**Step 2: Add the fifth General tab**

Add `configUpdates` to the existing preserved tab structure and render the new component only for that tab.

**Step 3: Add theme-safe styles**

Use existing `--gh-*` variables for surfaces, borders, text, focus rings, and status colors. Add hover, active, focus-visible, disabled, narrow-layout, and reduced-motion behavior without adding a new theme source or style injection path.

**Step 4: Add deep-link and search routing**

Route the `remote-config-` prefix to General / `configUpdates`. Add search entries for automatic updates, manual checks, and active patch reset, plus localized title/subtab mappings.

**Step 5: Verify the UI layer**

Run: `pnpm exec prettier --check src/tabs/options/components/RemoteConfigSettingsCard.tsx src/tabs/options/components/index.ts src/tabs/options/pages/GeneralPage.tsx src/styles/settings.css src/constants/ui.ts src/components/global-search/settingsSearch.ts`

Expected: all listed files pass formatting.

Run: `pnpm typecheck`

Expected: no TypeScript errors.

**Step 6: Commit**

```bash
git add src/tabs/options/components/RemoteConfigSettingsCard.tsx src/tabs/options/components/index.ts src/tabs/options/pages/GeneralPage.tsx src/styles/settings.css src/constants/ui.ts src/components/global-search/settingsSearch.ts
git commit -m "ux(settings): add config update controls"
```

### Task 6: Localize all user-facing copy

**Files:**
- Modify: `src/locales/zh-CN/index.ts`
- Modify: `src/locales/zh-TW/index.ts`
- Modify: `src/locales/en/index.ts`
- Modify: `src/locales/ja/index.ts`
- Modify: `src/locales/ko/index.ts`
- Modify: `src/locales/it/index.ts`
- Modify: `src/locales/de/index.ts`
- Modify: `src/locales/es/index.ts`
- Modify: `src/locales/fr/index.ts`
- Modify: `src/locales/pt/index.ts`
- Modify: `src/locales/ru/index.ts`

**Step 1: Add the complete key set to all locales**

Translate the tab label, card labels/descriptions, status text, version labels, empty state, reset action, privacy notice, and error/success feedback in all 11 application locales.

**Step 2: Check locale parity**

Run a read-only script that extracts the new `remoteConfig*` keys from all locale objects and fails if any locale is missing or has an extra key.

Expected: every locale reports the same new-key set as `zh-CN` and `en`.

**Step 3: Verify formatting and types**

Run: `pnpm exec prettier --check src/locales/*/index.ts`

Expected: all locale files pass formatting.

Run: `pnpm typecheck`

Expected: no TypeScript errors.

**Step 4: Commit**

```bash
git add src/locales
git commit -m "feat(i18n): localize config update settings"
```

### Task 7: Verify the complete cross-platform change

**Files:**
- Modify if required by verification: only files already listed above

**Step 1: Run repository checks in CI order**

Run: `pnpm format:check`

Expected: pass.

Run: `pnpm lint:check`

Expected: zero errors; pre-existing warnings may remain.

Run: `pnpm typecheck`

Expected: pass.

Run: `pnpm build`

Expected: Chrome extension build completes.

Run: `pnpm build:userscript`

Expected: userscript build completes.

**Step 2: Run focused storage and gate smoke checks**

Exercise the persisted-settings parser with a JSON envelope, object envelope, legacy bare settings, missing value, invalid JSON, malformed envelope, and invalid `autoUpdate` type. Confirm invalid inputs throw and disabled automatic updates do not reach the registry transport.

**Step 3: Run focused UI smoke checks**

Open the settings UI and verify the `configUpdates` tab in both the modal and standalone Options page. Check loading, built-in empty state, updated/up-to-date/failed feedback, one active patch row, reset-in-progress/disabled states, keyboard focus, and narrow layout in at least one light and one dark theme.

**Step 4: Review the diff**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff --stat`

Confirm there is no second remote-config state source, no platform checks in the React component, no omitted locale, no unrelated formatting, and no generated files.

**Step 5: Update task tracking and commit**

Keep P0-10 marked in progress until the merged build is exercised against the real registry/CDN if that external verification is still pending; otherwise mark it complete with the verification evidence.

```bash
git add docs/developer/site-adapter-pluginization-tasks.csv
git commit -m "docs(plan): update remote config settings status"
```
