# Validation record

Validated on 2026-10-27 against the v1.37.6 baseline, using SDK 26 and a physical HarmonyOS device. Private hostnames, account/project IDs, device identifiers, profiles and screenshots are deliberately excluded.

| Check | Result |
| --- | --- |
| Client suite | 119 files, 876 tests passed |
| Harmony notification outbox tests | 6 tests passed, including offline enqueue, persistence, PS256 signature verification, retry, expiry, revocation and event switches |
| Existing notification/session integration | 1 test passed |
| App bridge login compatibility | 4 tests passed: password rejection, existing password session, gateway cookie bootstrap and a concurrent login race |
| Typecheck and web/server build | Passed |
| Lint | Passed with existing repository warnings |
| Signed native debug build and device installation | Passed |
| Passkey login | User confirmed successful login and normal original interface |
| Native notification registration | Real device obtained a token and authenticated server registration succeeded |
| Huawei provider request | Accepted with success code `80000000` |
| App process terminated | Server event queued in SQLite and delivered by the running server worker; queue drained |
| Notification appearance and click | User confirmed receipt with the app process absent and entry into the corresponding session |
| App-local appearance and settings | Verified on device; original sidebar contains the injected entry and app settings use CloudCLI tokens; fullscreen setting removed |
| Gateway bootstrap after token removal | On-device test restored the existing authenticated cookie session and original interface |
| Publication guard | Checked changed source against local private identifiers and credential/signing file rules before upload |

The live device uses Huawei **test messages** with the `MARKETING` category, so notifications may be silent and remain subject to provider test quotas. `WORK` classification entitlement and production delivery quotas have not been validated. Actual password entry on a separate password-only deployment, real-device logout/token revocation, server switching, tablet layout, and multi-device delivery still need dedicated acceptance testing. Automated password compatibility and revocation tests cover the corresponding protocol behavior.
