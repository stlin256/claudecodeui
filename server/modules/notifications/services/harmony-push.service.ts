import { readFileSync } from 'node:fs';
import { constants, createPrivateKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { harmonyPushJobsDb, notificationChannelEndpointsDb, notificationPreferencesDb } from '@/modules/database/index.js';

type HuaweiAccount = { project_id: string; key_id: string; sub_account: string; private_key: string };
type HuaweiCredentials = { project: string; keyId: string; issuer: string; key: KeyObject };
let credentials: HuaweiCredentials | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let draining = false;

function loadCredentials(): HuaweiCredentials | null {
  const filename = process.env.HARMONY_PUSH_SERVICE_ACCOUNT;
  if (!filename) return null;
  if (credentials) return credentials;
  const account = JSON.parse(readFileSync(filename, 'utf8')) as HuaweiAccount;
  if (!/^\d+$/.test(String(account.project_id)) || !account.key_id || !account.sub_account) {
    throw new Error('Invalid HarmonyOS Push Kit service account');
  }
  const key = createPrivateKey(account.private_key);
  if (key.asymmetricKeyType !== 'rsa') throw new Error('Push Kit requires an RSA service account');
  credentials = { project: String(account.project_id), keyId: account.key_id, issuer: account.sub_account, key };
  return credentials;
}

/** Used by notification registration to report whether server delivery is configured. */
export function isHarmonyPushConfigured(): boolean {
  try { return loadCredentials() !== null; } catch { return false; }
}

function jwt(account: HuaweiCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'PS256', typ: 'JWT', kid: account.keyId })}.${encode({
    iss: account.issuer, aud: 'https://oauth-login.cloud.huawei.com/oauth2/v3/token', iat: now, exp: now + 3600,
  })}`;
  return `${input}.${sign('sha256', Buffer.from(input), {
    key: account.key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  }).toString('base64url')}`;
}

function deviceAllowsEvent(metadata: Record<string, unknown>, code: string): boolean {
  const levels = metadata.notificationEvents;
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return true;
  const key = code === 'permission.required' ? 'actionRequired'
    : code === 'run.failed' ? 'error' : code.startsWith('run.') ? 'completion' : 'info';
  return (levels as Record<string, unknown>)[key] !== false;
}

/** Used by the desktop delivery adapter and notification tests. Only routing metadata
 * is retained; neither the session name nor the original body reaches the lock screen. */
export function harmonyRoutingPayload(payload: unknown): { sessionId: string | null; code: string } {
  const data = (payload as { data?: { sessionId?: unknown; code?: unknown } })?.data;
  const sessionId = typeof data?.sessionId === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(data.sessionId) ? data.sessionId : null;
  const code = typeof data?.code === 'string' && /^[a-z._]{1,80}$/.test(data.code) ? data.code : 'generic.info';
  return { sessionId, code };
}

/** Used by the existing desktop channel to enqueue push notifications for offline
 * HarmonyOS devices. Existing web/Electron notification behavior stays intact. */
export function enqueueHarmonyPush(userId: number, payload: unknown): void {
  if (!isHarmonyPushConfigured()) return;
  const event = harmonyRoutingPayload(payload);
  const routing = JSON.stringify(event);
  for (const endpoint of notificationChannelEndpointsDb.getEnabledEndpoints(userId, 'desktop')) {
    const metadata = notificationChannelEndpointsDb.parseMetadata(endpoint.metadata_json);
    if (metadata.platform === 'harmonyos' && typeof metadata.huaweiPushToken === 'string' && deviceAllowsEvent(metadata, event.code)) {
      harmonyPushJobsDb.enqueue(userId, endpoint.endpoint_id, routing);
    }
  }
}

/** Used by the outbox scheduler and integration tests to deliver a bounded batch. */
export async function flushHarmonyPush(): Promise<void> {
  if (draining) return;
  const account = loadCredentials();
  if (!account) return;
  draining = true;
  try {
    for (const job of harmonyPushJobsDb.due()) {
      const endpoint = notificationChannelEndpointsDb.getEndpoint(job.user_id, 'desktop', job.endpoint_id);
      const prefs = notificationPreferencesDb.getPreferences(job.user_id);
      const metadata = notificationChannelEndpointsDb.parseMetadata(endpoint?.metadata_json ?? null);
      const routing = JSON.parse(job.payload_json) as { sessionId: string | null; code: string };
      const eventKey = routing.code === 'permission.required' ? 'actionRequired'
        : routing.code === 'run.failed' ? 'error' : routing.code.startsWith('run.') ? 'stop' : null;
      // Re-check revocation, channel and event switches immediately before sending.
      if (!endpoint?.enabled || !prefs.channels.desktop || (eventKey && !prefs.events[eventKey]) ||
        metadata.platform !== 'harmonyos' || typeof metadata.huaweiPushToken !== 'string' || !deviceAllowsEvent(metadata, routing.code)) {
        harmonyPushJobsDb.remove(job.id);
        continue;
      }
      try {
        const response = await fetch(`https://push-api.cloud.huawei.com/v3/${account.project}/messages:send`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${jwt(account)}`, 'Content-Type': 'application/json', 'push-type': '0' },
          body: JSON.stringify({
            payload: { notification: {
              // WORK requires Huawei's notification classification entitlement.
              category: process.env.HARMONY_PUSH_CATEGORY || 'MARKETING', title: 'CloudCLI',
              body: routing.code === 'permission.required' ? '有任务需要你确认' : '你的任务有新进展',
              clickAction: { actionType: 0, data: routing },
            } },
            target: { token: [metadata.huaweiPushToken] },
            pushOptions: { testMessage: process.env.HARMONY_PUSH_TEST_MESSAGE !== 'false', ttl: Math.max(1, Math.floor((job.expires_at - Date.now()) / 1000)) },
          }),
        });
        const result = await response.json() as { code?: string };
        if (!response.ok || String(result.code) !== '80000000') throw new Error('Push provider rejected delivery');
        harmonyPushJobsDb.remove(job.id);
      } catch {
        // Do not print the provider response, device token, account or private key.
        harmonyPushJobsDb.retry(job.id, job.attempts + 1);
      }
    }
  } finally { draining = false; }
}

/** Used by server startup to resume the durable outbox after process restarts. */
export function startHarmonyPush(): void {
  if (timer || !isHarmonyPushConfigured()) return;
  const tick = () => { void flushHarmonyPush().catch(() => { console.error('HarmonyOS push outbox unavailable'); }); };
  timer = setInterval(tick, 5000);
  timer.unref();
  tick();
}
