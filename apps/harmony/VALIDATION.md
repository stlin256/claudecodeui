# Validation record

Validated on 2026-10-27 against the v1.37.6 baseline, using SDK 26 and a physical HarmonyOS device. Mobile release: 0.2.0 (`harmony-v0.2.0`). Private hostnames, account/project IDs, device identifiers, profiles and screenshots are deliberately excluded.

| Check | Result |
| --- | --- |
| Client suite | 119 files, 876 tests passed |
| Harmony notification outbox tests | 7 tests passed, including offline enqueue, persistence, PS256 signature verification, retry, expiry, revocation, all four device levels and independence of other devices |
| Existing notification/session integration | 1 test passed |
| App bridge and settings | 11 tests passed: password/gateway compatibility, concurrent login, per-device settings, unsupported-server detection, About links/version/avatar, connection validation, focus/back behavior and reduced motion |
| Typecheck and web/server build | Passed |
| Lint | Passed with existing repository warnings |
| Signed native debug build and device installation | Passed |
| Signed native release build | 0.2.0 built successfully with the matching development profile |
| Passkey login | User confirmed successful login and normal original interface |
| Native notification registration | Real device obtained a token and authenticated server registration succeeded |
| Huawei provider request | Accepted with success code `80000000` |
| App process terminated | Server event queued in SQLite and delivered by the running server worker; queue drained |
| Notification appearance and click | User confirmed receipt with the app process absent and entry into the corresponding session |
| App-local appearance and settings | Verified on device; original sidebar contains the injected entry and app settings use CloudCLI tokens; fullscreen setting removed |
| Gateway bootstrap after token removal | On-device test restored the existing authenticated cookie session and original interface |
| 0.2.0 About | On-device avatar rendered correctly; project/version, maintainer and exact repository/Issue links verified |
| 0.2.0 device notification levels | On-device important-only preset persisted to native preferences and the authenticated server endpoint |
| 0.2.0 live filtering | The running server refused to queue a completion push while this device had completion disabled; original device preferences were restored afterwards |
| 0.2.0 connection settings | Three sections rendered on-device, existing Passkey mode inferred correctly, no horizontal overflow |
| Publication guard | Checked changed source against local private identifiers and credential/signing file rules before upload |

The live device uses Huawei **test messages** with the `MARKETING` category, so notifications may be silent and remain subject to provider test quotas. `WORK` classification entitlement and production delivery quotas have not been validated. Actual password entry on a separate password-only deployment, first-launch native guide acceptance, real-device logout/token revocation, server switching, tablet layout, and multi-device delivery still need dedicated acceptance testing. Automated password compatibility, guide validation, device independence and revocation tests cover the corresponding protocol behavior.
