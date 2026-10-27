# CloudCLI for HarmonyOS

ArkWeb hosts the original remote CloudCLI application. There is no copied React UI or separately maintained chat screen. The native layer adds a sidebar **应用设置** entry, device-local light/dark/automatic appearance, connection settings, logout, file selection and Huawei Push Kit registration. System bars remain visible and content stays inside the device safe area.

## Build using the CLI

Requires Windows PowerShell, DevEco Studio with its HarmonyOS SDK, and a matching development profile. The current project targets SDK 26 and supports API 23 or later.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/harmony/build.ps1
```

Set `DEVECO_STUDIO_HOME` or pass `-DevEcoHome` if DevEco Studio is outside the usual per-user installation directory. Use `-BuildMode release` for a release build. The script copies `build-profile.example.json5` and `runtime-config.example.json` on first use. The resulting local files are ignored by Git.

Configure signing in the local `apps/harmony/build-profile.json5` using your own application, certificate, device and profile. The bundle name in `AppScope/app.json5` must match the registered app. The profile must include `ohos.permission.ACCESS_FIDO2_ONLINEAUTH` for ArkWeb Passkey authentication and the Push Kit capability. A generic unregistered debug profile may build successfully while failing to obtain a push token.

Build output: `entry/build/default/outputs/default/entry-default-signed.hap`. Install using the SDK's `hdc install <hap>` and launch `hdc shell aa start -b <bundle-name> -a EntryAbility`. Web debugging is available only in debug builds through HDC.

Leave runtime configuration blank for a redistributable app: first launch asks for the server origin and optional authentication origins. For a private installation you may populate the ignored `entry/src/main/resources/rawfile/runtime-config.json`. Origins must use HTTPS and contain only hostname and optional port. Configure every OIDC redirect origin explicitly. No certificates are bypassed. Normal password login remains the original website's behavior; Passkeys run through ArkWeb's system authentication.

## Push notifications

The app uses the existing desktop notification channel. On this device, enable system notifications in 应用设置 and allow the system permission. Event switches remain in CloudCLI's existing notification settings. The app registers its token against the authenticated user's endpoint; the modified server sends notifications through Huawei even when the app process is absent. Browser/Electron channels retain their existing behavior.

The server must run this fork's backend. Create a **project-level service account key** for the same Huawei project as the app, enable Push Kit for the app, and keep the downloaded JSON outside the checkout. An API key or an OAuth client secret is a different credential and will not work. Give the service account only the access needed for push delivery.

Set server environment variables and restart CloudCLI:

```dotenv
HARMONY_PUSH_SERVICE_ACCOUNT=/etc/cloudcli/push-service-account.json
HARMONY_PUSH_TEST_MESSAGE=true
HARMONY_PUSH_CATEGORY=MARKETING
```

Restrict the JSON to the service user (for example mode `0600`). It needs `project_id`, `key_id`, `sub_account`, and an RSA PEM `private_key`. The server uses PS256 JWT authentication with Huawei's v3 Push API; credentials are cached until restart. No extra Node dependency is required.

`MARKETING` is the available default without notification classification entitlement; Huawei applies its quota and silent-notification policy. To use `WORK` for task reminders, first obtain Huawei's corresponding classification entitlement and then change `HARMONY_PUSH_CATEGORY=WORK`. Test mode defaults to true and is subject to Huawei's test quotas; use `HARMONY_PUSH_TEST_MESSAGE=false` for production after the app and classification are ready.

Delivery uses a SQLite outbox with bounded batches, exponential retries and one-hour expiry. Endpoint revocation and event preferences are checked again before each send. Huawei acceptance is not proof that a notification appeared on the device. Lock-screen copy is generic; only a validated session ID and event code are sent as routing data, not conversation contents or project names. Clicking opens the original session route. Logging out revokes the endpoint while authenticated and deletes the native token; switching servers disables the old endpoint first.

## Upstream maintenance and publication

See [UPSTREAM.md](UPSTREAM.md) for the baseline and merge procedure. Native integration is isolated under this directory and `scripts/harmony`; the web app has one optional native-appearance hook, and backend notification delivery extends the existing channel.

See [VALIDATION.md](VALIDATION.md) for completed checks and remaining acceptance cases.

Before committing, stage the intended source files and run:

```powershell
node scripts/harmony/check-publication.mjs
```

Set `HARMONY_PRIVATE_HOSTS` to a comma-separated list of private hostnames for an additional local check. The list belongs in your environment, never in tracked source. This guard checks staged additions/changes; it supplements review and does not establish that arbitrary repository history is secret-free. Never commit runtime configuration, signing profiles, account JSON, device identifiers, screenshots, logs or deployment backups.
