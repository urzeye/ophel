# Install and manage SitePacks

Open **Settings → SitePacks** in Ophel. The same management page is available from the extension Options page and the in-page settings dialog.

## Install from the community registry

1. In **Community registry**, select **Refresh registry** if the list is empty or stale.
2. Review the pack name, version, target domain, description, and compatibility status.
3. Select **Install**.
4. In the browser extension, approve the requested target-domain permission. Ophel requests only the origins referenced by the pack.
5. Reload the target site after the installation completes.

Registry packs update through the signed remote registry. Ophel verifies the signed index, immutable package digest, application-version requirement, and complete runtime schema before replacing an installed version.

## Import a local JSON pack

Use **Local JSON import** when testing a pack you created or received outside the community registry.

1. Select **Import JSON** and choose a `.json` file.
2. Review the confirmation dialog, especially the pack ID, version, match-pattern count, and risk notice.
3. Confirm the import.
4. Approve target-domain permission in the extension, then reload the site.

Local imports are validated, but they are not authenticated by the community registry signature and do not update automatically. Install a newer local file to update them.

## Extension permissions

The extension uses optional host permissions and dynamic content-script registration for SitePack origins. Installation is rolled back if required permission is denied, so a half-installed pack is not left active.

After restoring a backup on another browser, the pack data is restored but domain permission must be granted again. The SitePack page lists packs that need reauthorization.

Disabling or uninstalling the last pack that references an origin removes its dynamic registration. If several packs or custom bindings share one origin, Ophel keeps the registration until the final reference is removed.

## Userscript match rules

Userscript managers cannot let Ophel add new `@match` entries automatically. When an installed pack or custom origin is outside the script's current coverage, the SitePack page shows the required match patterns.

1. Copy every displayed pattern.
2. Open the installed Ophel script in Tampermonkey, Violentmonkey, or ScriptCat.
3. Add the patterns to the manager's user-match settings.
4. Save, then reload each target site.

The exact menu name differs by manager. Keep the rule limited to the site you intend to use; do not replace it with a global match.

## Bind a custom origin

Custom origins support self-hosted or same-application deployments whose domain is not listed in a pack's static `matches`.

Enter an HTTPS origin such as `https://chat.example.com` and choose an installed pack. The selected pack always activates on that origin.

The extension requests the origin before saving the binding. The userscript build instead shows the match-rule steps above.

## Update, disable, or uninstall

- **Check for updates** compares an installed registry pack with the latest compatible registry version.
- **Disable** keeps the pack installed but removes it from adapter activation and origin references.
- **Uninstall** removes the manifest and its registration references. Site settings and conversation data are retained so reinstalling the pack does not erase user history.

When a registry pack is disabled by the registry or requires a newer Ophel version, the management page shows the reason instead of silently activating it.

## Troubleshooting

If a pack installs but the site is not recognized:

1. Confirm the pack is enabled.
2. Reload the target tab after granting permission or adding a userscript match.
3. Check that the current origin matches the pack or custom binding exactly.
4. Use the health warning's **Check configuration updates** action if the site recently changed.
5. If the latest pack still fails, use **Report issue** and include the site URL, pack version, and failed selector names without including private conversation content.
