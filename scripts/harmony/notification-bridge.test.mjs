import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = readFileSync(new URL('../../apps/harmony/entry/src/main/resources/rawfile/notification-bridge.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function page(fetchResponse, initialToken = null, enabled = false) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://cloudcli.example.invalid/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
  });
  const { window } = dom;
  if (initialToken) window.localStorage.setItem('auth-token', initialToken);
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  const requests = [];
  window.fetch = async (url, options) => { requests.push({ url, options }); return fetchResponse(url, options); };
  let levels = { actionRequired: true, error: true, completion: true, info: true };
  const commands = [];
  window.cloudcliHarmonyNotifications = {
    request(id, command, value) {
      commands.push(command);
      if (command === 'setNotificationEvents') levels = JSON.parse(value);
      window.__cloudcliHarmonyResponse(id, true, command === 'pushToken' ? 'test-push-token-1234567890' : JSON.stringify(command === 'getHostState'
        ? { themeMode: 'auto' } : { enabled, permitted: true, deviceId: 'device', notificationEvents: levels }));
    },
  };
  window.eval(source);
  return { dom, window, requests, commands };
}

test('password-only server retains its login when cookie refresh is rejected', async () => {
  const { dom, window, requests } = page(() => Response.json({}, { status: 401 }));
  try {
    await settle();
    assert.equal(window.localStorage.getItem('auth-token'), null);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.equal(requests[0].options.redirect, 'error');
  } finally { dom.window.close(); }
});

test('disabled device keeps notification-level preferences locally without a server request', async () => {
  const { dom, window, requests } = page(() => { throw new Error('Unexpected request'); }, 'password-token');
  try {
    const levels = { actionRequired: true, error: true, completion: false, info: false };
    const result = await window.cloudcliDesktopNotifications.updateEvents(levels);
    assert.deepEqual(JSON.parse(JSON.stringify(result.desktopNotifications.notificationEvents)), levels);
    assert.equal(requests.length, 0);
  } finally { dom.window.close(); }
});

test('enabled device sends all levels to the endpoint and refuses unsupported servers', async () => {
  let supported = false;
  const { dom, window, requests, commands } = page(() => Response.json({ harmonyPushConfigured: true, harmonyNotificationLevels: supported }), 'password-token', true);
  try {
    await settle();
    const levels = { actionRequired: true, error: false, completion: false, info: true };
    await assert.rejects(window.cloudcliDesktopNotifications.updateEvents(levels), /升级服务器/);
    assert.equal(commands.includes('setNotificationEvents'), false);
    supported = true;
    await window.cloudcliDesktopNotifications.updateEvents(levels);
    const body = JSON.parse(requests.at(-1).options.body);
    assert.deepEqual(body.metadata.notificationEvents, levels);
    assert.equal(commands.includes('setNotificationEvents'), true);
  } finally { dom.window.close(); }
});

test('gateway cookie session bootstraps through the existing refresh API', async () => {
  const token = 'authenticated-gateway-token';
  const { dom, window } = page(() => Response.json({ token }));
  try {
    await settle();
    assert.equal(window.localStorage.getItem('auth-token'), token);
  } finally { dom.window.close(); }
});

test('stored password session is preserved without cookie bootstrap', async () => {
  const { dom, window, requests } = page(() => { throw new Error('Unexpected refresh'); }, 'existing-password-token');
  try {
    await settle();
    assert.equal(requests.length, 0);
    assert.equal(window.localStorage.getItem('auth-token'), 'existing-password-token');
  } finally { dom.window.close(); }
});

test('late gateway response does not overwrite a newly completed password login', async () => {
  let complete;
  const { dom, window } = page(() => new Promise(resolve => { complete = resolve; }));
  try {
    window.localStorage.setItem('auth-token', 'new-password-login-token');
    complete(Response.json({ token: 'late-gateway-session-token' }));
    await settle();
    assert.equal(window.localStorage.getItem('auth-token'), 'new-password-login-token');
  } finally { dom.window.close(); }
});
