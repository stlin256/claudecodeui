import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../../apps/harmony/entry/src/main/resources/rawfile/app-session.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function page(path = '/', request = async () => '{}') {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://cloudcli.example.invalid' + path, runScripts: 'outside-only' });
  const calls = [];
  dom.window.cloudcliHarmonyHost = { request: async (command, value) => { calls.push({ command, value }); return request(command, value); } };
  dom.window.eval(source);
  return { dom, window: dom.window, calls };
}

test('records initial chat and SPA navigation, without replacing it with blank/settings/login pages', async () => {
  const { dom, window, calls } = page('/session/first-chat');
  try {
    await settle();
    window.history.pushState({}, '', '/session/second-chat'); await settle();
    window.history.replaceState({}, '', '/session/second-chat');
    window.history.pushState({}, '', '/');
    window.history.pushState({}, '', '/settings');
    window.history.pushState({}, '', '/login');
    window.dispatchEvent(new window.Event('pagehide')); await settle();
    assert.deepEqual(calls, [
      { command: 'rememberSession', value: 'first-chat' }, { command: 'rememberSession', value: 'second-chat' },
    ]);
    window.history.replaceState({}, '', '/session/back-chat');
    window.dispatchEvent(new window.PopStateEvent('popstate')); await settle();
    assert.equal(calls.at(-1).value, 'back-chat');
  } finally { dom.window.close(); }
});

test('rejects malformed paths and preserves history API security checks', async () => {
  const { dom, window, calls } = page();
  try {
    for (const path of ['/session/a%2Fb', '/session/' + 'a'.repeat(161), '/session/a/more', '/session/']) window.history.pushState({}, '', path);
    assert.throws(() => window.history.pushState({}, '', 'https://other.example.invalid/session/evil'));
    await settle(); assert.equal(calls.length, 0);
  } finally { dom.window.close(); }
});

test('retries a failed native write and serializes rapid chat switches', async () => {
  let attempts = 0;
  const { dom, window, calls } = page('/session/retry-chat', async () => { if (++attempts === 1) throw new Error('Transient storage failure'); });
  try {
    await settle(); window.dispatchEvent(new window.Event('pageshow')); await settle();
    assert.equal(calls.length, 2);
    window.history.pushState({}, '', '/session/next-chat');
    window.history.pushState({}, '', '/session/last-chat'); await settle();
    assert.equal(calls.at(-1).value, 'last-chat');
  } finally { dom.window.close(); }
});

test('logout waits for an issued write and prevents pagehide from resurrecting the remembered chat', async () => {
  let complete;
  const { dom, window, calls } = page('/session/old-chat', () => new Promise(resolve => { complete = resolve; }));
  try {
    await settle();
    let paused = false;
    const pause = window.cloudcliHarmonyHost.pauseSessionTracking().then(() => { paused = true; });
    await settle(); assert.equal(paused, false);
    complete('{}'); await pause;
    window.history.pushState({}, '', '/session/after-logout');
    window.dispatchEvent(new window.Event('pagehide')); await settle();
    assert.equal(calls.length, 1);
  } finally { dom.window.close(); }
});
