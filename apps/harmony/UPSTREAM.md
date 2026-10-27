# Upstream provenance

This repository is a GitHub fork of [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui), licensed AGPL-3.0-or-later. Preserve the upstream license and notices. The integration started at CloudCLI **v1.37.6**, commit **c17c2f6d5f7e1e1d47fe37144ce0b2030002e331**. Original files and history are retained.

The maintained integration branch is `codex/harmonyos-client`. The original upstream UI is loaded remotely; upstream frontend improvements appear after updating the server, without porting a separate mobile UI.

## Check for updates

```sh
git remote add upstream https://github.com/siteboon/claudecodeui.git
git fetch upstream --tags
git log --oneline HEAD..upstream/main
git diff --stat HEAD...upstream/main
```

Skip `remote add` if the remote already exists. The manual `Harmony upstream status` workflow performs a read-only comparison and publishes its result in the workflow summary. It never automatically merges or deploys upstream code.

## Integrate an update

Start from a clean working tree, make a `codex/harmony-sync-*` branch from the integration branch, merge the chosen upstream release commit, and resolve conflicts. Record the exact upstream commit and release in the PR and update this document after validation. Do not rewrite the inherited upstream history.

Check especially:

- The existing `cloudcliDesktopNotifications` bridge contract and notification endpoint authentication/preferences.
- Sidebar footer structure and classes used by the app's injected settings entry.
- Session routing, gateway login redirects and ArkWeb Passkey permission requirements.
- ThemeContext's optional app-local appearance override and design tokens used by app settings.
- Database initialization and the durable HarmonyOS notification outbox.

The `Harmony integration checks` workflow runs bridge/login compatibility tests, notification tests, client tests, typecheck, lint and the web/server build. Native compilation requires the HarmonyOS SDK and private signing material on a local machine; CI does not upload private HAPs. Rebuild the HAP with the installed SDK and own signing files. On a real device verify password and Passkey login, safe areas, all three appearance modes, background and terminated-process push, notification click routing, per-event switches, device disable, logout and connection changes. Record unverified cases explicitly.

Deploy the server from a separate staged directory after backing up its live SQLite database. Keep rollback artifacts and credentials outside Git. Changing native permissions or Huawei capabilities also requires updating the development profile before installing a new HAP.
