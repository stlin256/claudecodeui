import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const raw = new URL('../../apps/harmony/entry/src/main/resources/rawfile/', import.meta.url);
const settle = () => new Promise(resolve => setImmediate(resolve));
async function setup() {
  const dom = new JSDOM('<!doctype html><button id="launcher">Settings</button>', { url: 'https://cloudcli.example.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const calls = [];
  let levels = { actionRequired: true, error: true, completion: true, info: true };
  const state = () => ({ desktopNotifications: { enabled: true, connectedCount: 1, notificationEvents: levels, lastError: null } });
  window.cloudcliHarmonyHost = {
    animate: async () => {}, logout: async () => {},
    request: async (command, value) => {
      calls.push({ command, value });
      return JSON.stringify({ themeMode: 'auto', serverOrigin: 'https://cloudcli.example.invalid', authenticationOrigins: ['https://auth.example.invalid'], loginMode: 'passkey' });
    },
  };
  window.cloudcliDesktopNotifications = {
    getState: async () => state(), update: async () => state(),
    updateEvents: async value => { levels = value; return state(); },
  };
  window.eval(readFileSync(new URL('app-info.js', raw), 'utf8'));
  window.eval(readFileSync(new URL('app-settings.js', raw), 'utf8'));
  window.document.getElementById('launcher').focus();
  await window.cloudcliHarmonyHost.openSettings();
  return { dom, window, calls, document: window.document, host: window.cloudcliHarmonyHost };
}

test('settings deduplicates opening, navigates back and restores launcher focus', async () => {
  const { dom, document, host } = await setup();
  try {
    await Promise.all([host.openSettings(), host.openSettings()]);
    assert.equal(document.querySelectorAll('#cloudcli-app-settings').length, 1);
    document.querySelector('[data-page="about"]').click();
    await host.backSettings();
    assert.ok(document.querySelector('[data-page="about"]'));
    await host.backSettings();
    assert.equal(document.querySelector('#cloudcli-app-settings'), null);
    assert.equal(document.activeElement.id, 'launcher');
  } finally { dom.window.close(); }
});

test('about has the maintainer avatar, manifest version and exact repository issue links', async () => {
  const { dom, document, window } = await setup();
  try {
    document.querySelector('[data-page="about"]').click();
    assert.equal(document.querySelector('[data-profile]').textContent, '@stlin256');
    assert.match(document.querySelector('[data-avatar]').src, /^data:image\/png;base64,/);
    assert.equal(document.querySelector('[data-project]').textContent, 'CloudCLI Harmony');
    assert.ok(document.querySelector('[data-version]').textContent.includes(window.cloudcliHarmonyApp.version));
    assert.equal(document.querySelector('[data-issues]').href, 'https://github.com/stlin256/claudecodeui/issues/new/choose');
  } finally { dom.window.close(); }
});

test('four notification switches and importance presets preserve separate levels', async () => {
  const { dom, document } = await setup();
  try {
    document.querySelector('[data-page="notifications"]').click(); await settle();
    assert.equal(document.querySelectorAll('[data-level]').length, 4);
    document.querySelector('[data-preset="important"]').click(); await settle();
    assert.equal(document.querySelector('[data-level="actionRequired"]').checked, true);
    assert.equal(document.querySelector('[data-level="completion"]').checked, false);
    assert.equal(document.querySelector('[data-level="info"]').checked, false);
    document.querySelector('[data-preset="all"]').click(); await settle();
    assert.ok([...document.querySelectorAll('[data-level]')].every(input => input.checked));
  } finally { dom.window.close(); }
});

test('connection guide rejects insecure origins and password mode removes auth redirect trust', async () => {
  const { dom, document, window, calls } = await setup();
  try {
    document.querySelector('[data-page="connection"]').click();
    document.querySelector('[data-field="server"]').value = 'http://cloudcli.example.invalid';
    document.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
    assert.equal(calls.some(call => call.command === 'saveConnection'), false);
    document.querySelector('[data-field="server"]').value = 'https://cloudcli.example.invalid/';
    const password = document.querySelector('[name="login-mode"][value="password"]'); password.checked = true;
    password.dispatchEvent(new window.Event('change'));
    assert.equal(document.querySelector('[data-auth-fields]').hidden, true);
    document.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
    const connection = JSON.parse(calls.find(call => call.command === 'saveConnection').value);
    assert.deepEqual(connection, { serverOrigin: 'https://cloudcli.example.invalid', authenticationOrigins: [], loginMode: 'password' });
  } finally { dom.window.close(); }
});

test('motion obeys reduced-motion preference and preserves history API behavior', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://cloudcli.example.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    const { window } = dom;
    let animations = 0;
    window.cloudcliHarmonyHost = {};
    window.matchMedia = () => ({ matches: true });
    window.Element.prototype.animate = () => { animations++; return { finished: Promise.resolve() }; };
    window.eval(readFileSync(new URL('app-motion.js', raw), 'utf8'));
    await window.cloudcliHarmonyHost.animate(window.document.querySelector('main'));
    assert.equal(animations, 0);
    assert.equal(window.history.pushState({}, '', '/session/test'), undefined);
    assert.equal(window.location.pathname, '/session/test');
    assert.throws(() => window.history.pushState({}, '', 'https://other.example.invalid/'));
  } finally { dom.window.close(); }
});
