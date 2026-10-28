/* CloudCLI's existing desktop notification contract, adapted to HarmonyOS Push Kit.
 * Runs before React mounts; the original page owns login and WebAuthn.
 * Native code independently validates caller frame + top-level origin.
 */
(() => {
  'use strict';
  if (window !== window.top || window.cloudcliDesktopNotifications) return;
  const transport = window.cloudcliHarmonyNotifications;
  if (!transport) return;
  const pending = new Map();
  let requestId = 0;
  window.__cloudcliHarmonyResponse = (id, success, value) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timeout);
    if (success) request.resolve(value);
    else request.reject(new Error(value));
  };
  function callNative(command, value = '') {
    return new Promise((resolve, reject) => {
      const id = `request_${++requestId}`;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Native operation timed out')); }, 120000);
      pending.set(id, { resolve, reject, timeout });
      try { transport.request(id, command, String(value)); }
      catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); }
    });
  }
  const native = {
    getState: () => callNative('getState'),
    configure: value => callNative('configure', value),
    pushToken: () => callNative('pushToken'),
    appearance: value => callNative('appearance', value),
  };
  let renderedDark = null;
  // Keep native settings local to this app; the original server-wide theme remains intact.
  window.cloudcliHarmonyHost = {
    request: callNative,
    applyAppearance(mode) {
      window.cloudcliHarmonyAppearance = mode;
      window.dispatchEvent(new Event('cloudcli-harmony:appearance'));
      syncAppearance();
    },
    async logout() {
      await window.cloudcliHarmonyHost.pauseSessionTracking?.();
      // Remove the server endpoint while this session still authenticates requests.
      // Native token deletion remains available when the server is unreachable.
      try { await window.cloudcliDesktopNotifications.update({ enabled: false }); } catch {}
      // Revoke the gateway session when present. Password-only installs return 404.
      try { await fetch('/_gateway/logout', { method: 'POST', credentials: 'same-origin', redirect: 'manual' }); } catch {}
      localStorage.removeItem('auth-token');
      window.dispatchEvent(new Event('auth-session-expired'));
      await callNative('clearSession');
    },
  };
  // Observe the original theme, with a fallback for servers predating the optional host hook.
  const syncAppearance = () => {
    if (document.documentElement) {
      const mode = window.cloudcliHarmonyAppearance;
      if (mode === 'light' || mode === 'dark' || mode === 'auto') {
        document.documentElement.classList.toggle('dark', mode === 'dark' ||
          (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches));
      }
      const dark = document.documentElement.classList.contains('dark');
      if (dark !== renderedDark) {
        renderedDark = dark;
        void native.appearance(dark).catch(() => {});
      }
    }
    injectSettings();
  };
  function injectSettings() {
    // Reuse the upstream sidebar footer's own classes/icon and leave its Settings button intact.
    for (const divider of document.querySelectorAll('.nav-divider')) {
      const footer = divider.parentElement;
      if (!footer) continue;
      for (const original of footer.querySelectorAll('button:has(svg.lucide-settings)')) {
        if (original.closest('[data-cloudcli-native-settings]')) continue;
        const wrapper = original.parentElement;
        if (!wrapper || wrapper.nextElementSibling?.hasAttribute('data-cloudcli-native-settings')) continue;
        const injected = wrapper.cloneNode(true);
        injected.setAttribute('data-cloudcli-native-settings', '');
        const button = injected.querySelector('button');
        if (!button) continue;
        const label = button.querySelector('span');
        if (label) label.textContent = '应用设置';
        button.title = '应用设置';
        button.setAttribute('aria-label', '应用设置');
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          void window.cloudcliHarmonyHost.openSettings?.();
        });
        wrapper.after(injected);
      }
    }
  }
  new MutationObserver(syncAppearance).observe(document, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class']
  });
  document.addEventListener('DOMContentLoaded', syncAppearance);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncAppearance);
  syncAppearance();
  void callNative('getHostState').then(value => {
    window.cloudcliHarmonyHost.applyAppearance(JSON.parse(value).themeMode);
  }).catch(() => {});
  const listeners = new Set();
  let registered = false;
  let lastError = null;
  let inFlight = null;
  let lastToken = null;
  let lastRegistration = 0;
  const authHeaders = () => {
    const token = localStorage.getItem('auth-token');
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };
  async function endpoint(deviceId, enabled, pushToken, notificationEvents) {
    const response = await fetch('/api/notifications/endpoints/current', {
      method: 'POST', credentials: 'same-origin', redirect: 'error',
      headers: authHeaders(),
      body: JSON.stringify({ channel: 'desktop', endpointId: deviceId,
        label: 'HarmonyOS', enabled,
        metadata: { platform: 'harmonyos', huaweiPushToken: pushToken || null, notificationEvents } })
    });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) {
      throw new Error('Notification registration failed; sign in and check server configuration.');
    }
    const result = await response.json();
    if (enabled && result.harmonyPushConfigured !== true) {
      throw new Error('Server Huawei Push Kit is not configured.');
    }
    return result;
  }
  async function getState() {
    const state = JSON.parse(await native.getState());
    return { desktopNotifications: { enabled: state.enabled && state.permitted,
      supported: true, connectedCount: registered ? 1 : 0, targetCount: 1, lastError,
      notificationEvents: state.notificationEvents || { actionRequired: true, error: true, completion: true, info: true } } };
  }
  async function emit() {
    const state = await getState();
    listeners.forEach(listener => listener(state));
    return state;
  }
  async function register() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const state = JSON.parse(await native.getState());
      if (!state.enabled || !state.permitted) return;
      const authToken = localStorage.getItem('auth-token');
      if (registered && authToken === lastToken && Date.now() - lastRegistration < 300000) return;
      try {
        await endpoint(state.deviceId, true, await native.pushToken(), state.notificationEvents);
        registered = true;
        lastToken = authToken;
        lastRegistration = Date.now();
        lastError = null;
      } catch (error) {
        registered = false;
        lastError = error.message || 'Notification registration failed';
      }
      await emit();
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  window.cloudcliDesktopNotifications = Object.freeze({
    getState,
    async updateEvents(levels) {
      const keys = ['actionRequired', 'error', 'completion', 'info'];
      if (!levels || keys.some(key => typeof levels[key] !== 'boolean')) throw new Error('Invalid notification levels');
      if (inFlight) await inFlight;
      // Serialize preference updates with registration/token refresh so a stale
      // background registration cannot overwrite the user's new device policy.
      inFlight = (async () => {
        const state = JSON.parse(await native.getState());
        if (state.enabled && state.permitted) {
          const result = await endpoint(state.deviceId, true, await native.pushToken(), levels);
          if (result.harmonyNotificationLevels !== true) throw new Error('请先升级服务器以支持分级通知');
        }
        await callNative('setNotificationEvents', JSON.stringify(levels));
        lastError = null;
        return emit();
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
    async update(settings) {
      try {
        if (settings.enabled) {
          await native.configure(true);
          // A startup registration can still be completing with the previous disabled
          // state. Finish it before issuing the user's explicit enable operation.
          if (inFlight) await inFlight;
          await register();
        } else {
          if (inFlight) await inFlight;
          const state = JSON.parse(await native.getState());
          // Disable on the server before claiming that remote delivery has stopped.
          await endpoint(state.deviceId, false, null, state.notificationEvents);
          await native.configure(false);
          registered = false;
          lastError = null;
        }
      } catch (error) {
        lastError = error.message || 'HarmonyOS notification permission or Push Kit unavailable';
      }
      return emit();
    },
    onStateUpdated(callback) { listeners.add(callback); return () => listeners.delete(callback); }
  });
  addEventListener('auth-token-refreshed', () => { void register(); });
  addEventListener('pageshow', () => { void register(); });
  // A gateway may authenticate API requests by its HttpOnly session cookie while
  // upstream React still requires its own stored token to bootstrap. Exchange
  // that existing authenticated session through the original refresh endpoint.
  // Password-only servers reject this request and keep their normal login form.
  if (!localStorage.getItem('auth-token')) {
    void fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', redirect: 'error' })
      .then(async response => {
        if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return;
        const result = await response.json();
        if (typeof result.token !== 'string' || result.token.length < 16 || result.token.length > 16384 ||
            localStorage.getItem('auth-token')) return;
        localStorage.setItem('auth-token', result.token);
        location.reload();
      }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void register();
  });
  // Refresh registration after login and token rotation, only while the page is visible.
  setInterval(() => {
    if (document.visibilityState === 'visible') void register();
  }, 30000);
  void register();
})();
