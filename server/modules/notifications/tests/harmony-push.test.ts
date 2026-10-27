import assert from 'node:assert/strict';
import { generateKeyPairSync, constants, verify } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, getConnection, harmonyPushJobsDb, initializeDatabase,
  notificationChannelEndpointsDb, notificationPreferencesDb, userDb } from '@/modules/database/index.js';
import { sendDesktopNotification } from '@/modules/notifications/services/desktop-notification-clients.service.js';
import { flushHarmonyPush, harmonyRoutingPayload } from '@/modules/notifications/services/harmony-push.service.js';

test('HarmonyOS outbox survives restart, retries provider failures and honors revocation', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cloudcli-harmony-'));
  const previousDatabase = process.env.DATABASE_PATH;
  const previousAccount = process.env.HARMONY_PUSH_SERVICE_ACCOUNT;
  const previousFetch = globalThis.fetch;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.DATABASE_PATH = path.join(directory, 'database.sqlite');
  process.env.HARMONY_PUSH_SERVICE_ACCOUNT = path.join(directory, 'account.json');
  await writeFile(process.env.HARMONY_PUSH_SERVICE_ACCOUNT, JSON.stringify({
    project_id: '123', key_id: 'test-key', sub_account: 'test-account',
    private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  }));
  closeConnection();
  await initializeDatabase();
  const userId = Number(userDb.createUser('push-test', 'unused').id);
  notificationPreferencesDb.updatePreferences(userId, { channels: { desktop: true } });
  notificationChannelEndpointsDb.upsertEndpoint({ userId, channel: 'desktop', endpointId: 'phone',
    metadata: { platform: 'harmonyos', huaweiPushToken: 'test-token-1234567890' } });
  const event = { title: 'Private project name', body: 'Private conversation text',
    data: { sessionId: 'session-1', code: 'permission.required', tag: 'private-tag' } };
  let responsesFail = false;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://push-api.cloud.huawei.com/v3/123/messages:send');
    assert.equal(options?.redirect, 'error');
    const body = String(options?.body);
    assert.ok(!body.includes('Private'));
    assert.ok(!body.includes('private-tag'));
    const payload = JSON.parse(body);
    assert.equal(payload.payload.notification.category, 'MARKETING');
    assert.deepEqual(payload.payload.notification.clickAction.data, { sessionId: 'session-1', code: 'permission.required' });
    const authorization = new Headers(options?.headers).get('Authorization');
    assert.ok(authorization);
    const [header, claims, signature] = authorization.slice(7).split('.');
    assert.equal(JSON.parse(Buffer.from(header, 'base64url').toString()).alg, 'PS256');
    assert.equal(verify('sha256', Buffer.from(`${header}.${claims}`), {
      key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
    }, Buffer.from(signature, 'base64url')), true);
    return Response.json({ code: responsesFail ? '80000001' : '80000000' });
  };
  try {
    await t.test('sanitizes arbitrary routing metadata', () => {
      assert.deepEqual(harmonyRoutingPayload({ data: { sessionId: 'https://evil.example/', code: '<script>' } }),
        { sessionId: null, code: 'generic.info' });
    });
    await t.test('enqueues with no live socket and resumes from the database', async () => {
      assert.deepEqual(sendDesktopNotification(userId, event), { attempted: 0, sent: 0 });
      assert.equal(harmonyPushJobsDb.due().length, 1);
      closeConnection();
      await initializeDatabase();
      await flushHarmonyPush();
      assert.equal(requests, 1);
      assert.equal(harmonyPushJobsDb.due().length, 0);
    });
    await t.test('retries HTTP-200 application failures with backoff', async () => {
      responsesFail = true;
      sendDesktopNotification(userId, event);
      await flushHarmonyPush();
      assert.equal(requests, 2);
      assert.equal(harmonyPushJobsDb.due().length, 0);
      const delayed = harmonyPushJobsDb.due(Date.now() + 11000);
      assert.equal(delayed.length, 1);
      assert.equal(delayed[0].attempts, 1);
      getConnection().prepare('UPDATE harmony_push_jobs SET next_attempt_at = 0').run();
      responsesFail = false;
      await flushHarmonyPush();
      assert.equal(requests, 3);
    });
    await t.test('checks device revocation and per-event preferences before sending', async () => {
      sendDesktopNotification(userId, event);
      notificationChannelEndpointsDb.setEndpointEnabled(userId, 'desktop', 'phone', false);
      await flushHarmonyPush();
      assert.equal(requests, 3);
      assert.equal(harmonyPushJobsDb.due().length, 0);
      notificationChannelEndpointsDb.setEndpointEnabled(userId, 'desktop', 'phone', true);
      sendDesktopNotification(userId, event);
      notificationPreferencesDb.updatePreferences(userId, { channels: { desktop: true }, events: { actionRequired: false } });
      await flushHarmonyPush();
      assert.equal(requests, 3);
    });
    await t.test('expires stale jobs without delivering them', async () => {
      harmonyPushJobsDb.enqueue(userId, 'phone', JSON.stringify(harmonyRoutingPayload(event)), Date.now() - 3600001);
      await flushHarmonyPush();
      assert.equal(requests, 3);
      assert.equal(harmonyPushJobsDb.due().length, 0);
    });
  } finally {
    globalThis.fetch = previousFetch;
    closeConnection();
    if (previousDatabase === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabase;
    if (previousAccount === undefined) delete process.env.HARMONY_PUSH_SERVICE_ACCOUNT;
    else process.env.HARMONY_PUSH_SERVICE_ACCOUNT = previousAccount;
    await rm(directory, { recursive: true, force: true });
  }
});
