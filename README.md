# CloudCLI Harmony

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

A HarmonyOS app for the original [CloudCLI](https://github.com/siteboon/claudecodeui) remote interface, maintained by [@stlin256](https://github.com/stlin256).

<img src="apps/harmony/entry/src/main/resources/rawfile/maintainer-avatar.png" width="64" height="64" alt="stlin256 GitHub avatar">

**Mobile version:** 0.2.0 · **Tag:** `harmony-v0.2.0` · **Branch:** `codex/harmonyos-client` · **License:** AGPL-3.0-or-later

## What this fork adds

- The remote CloudCLI interface runs directly in ArkWeb, with its original chat, projects and tools. There is no separately rewritten chat UI.
- Original account/password and first-run registration flows; Passkey gateways use the system authentication prompt with explicit trusted identity origins.
- A three-step connection guide and recovery settings for failed connections. No deployment address is built in to the public source.
- An app settings entry in the sidebar: device-local light/dark/automatic appearance, connection/login configuration, logout and About.
- Per-device notification switches for **action required, failures, completion and other messages**, plus important-only/all/mute presets. Both server account preferences and device preferences apply, including when the app process is absent.
- App-level settings, dialog, sidebar and route animations; reduced-motion preferences are respected and streaming messages are not individually animated.
- About shows the actual app manifest version, project, maintainer avatar, source repository and [issue reporting](https://github.com/stlin256/claudecodeui/issues/new/choose).

System bars stay visible with safe areas. The app does not have a fullscreen setting.

## Connect

1. Enter your CloudCLI **HTTPS origin**, such as `https://cloudcli.example.com:9443`, without a page path.
2. Select official account/password or Passkey/gateway login. For a gateway, add only the HTTPS identity-provider origins that your own deployment redirects through. Same-origin authentication needs no extra origin.
3. Confirm and connect. Complete login on the original web page; passwords and Passkey private keys are not stored by the app.

Open **应用设置 → 分级通知** to allow notifications and choose event levels. Changes affect this device; they do not mute other devices. CloudCLI's existing account event switches can additionally suppress delivery.

## Build and run

Install DevEco Studio with HarmonyOS SDK 26 and use your own application signing profile. Minimum supported API: 23. All development can use the CLI.

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/harmony/build.ps1 -BuildMode release
```

The first build creates ignored local signing/runtime configuration files. A device profile must match the bundle and include Push Kit and the FIDO2 permission. For details, see the [native build and Push Kit guide](apps/harmony/README.md).

Huawei push delivery requires this fork's backend, an enabled Push Kit application and a project-level service account JSON kept outside Git. The current validated setup uses **silent test messages**; production `WORK` classification needs Huawei's corresponding entitlement. Event-level switches cannot grant cloud classification or system sound/banner rights.

## Maintenance and validation

- [Upstream baseline and sync procedure](apps/harmony/UPSTREAM.md): full upstream history retained, baseline v1.37.6; manually run **Harmony upstream status** in Actions to compare upstream changes.
- [Verification record and limitations](apps/harmony/VALIDATION.md).
- CI checks app bridge/settings behavior, notification delivery, existing client tests, typecheck, lint and web/server builds. Native builds use your local SDK/signing material.
- Run `node scripts/harmony/check-publication.mjs` against staged changes before publishing. Never upload private runtime origins, profiles, keys, service accounts, logs or screenshots.

Use the fork's merge/build/deploy procedure for upgrades. The upstream in-app updater targets the official package and does not maintain this mobile integration.

[Original upstream README](README.upstream.md) · [Report an issue](https://github.com/stlin256/claudecodeui/issues/new/choose) · [Maintainer](https://github.com/stlin256)
