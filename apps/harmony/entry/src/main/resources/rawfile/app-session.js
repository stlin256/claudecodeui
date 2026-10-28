/* Remember only valid chat routes, in native preferences scoped to this server.
 * Navigation is captured when it happens, so a later process kill needs no
 * unload callback. Opening settings or a login page never replaces the chat. */
(() => {
  const host = window.cloudcliHarmonyHost;
  if (!host) return;
  let lastSession = '';
  let stopped = false;
  let pending = Promise.resolve();
  function remember() {
    const match = /^\/session\/([A-Za-z0-9_-]{1,160})\/?$/.exec(location.pathname);
    if (stopped || !match || match[1] === lastSession) return;
    const id = match[1];
    lastSession = id;
    pending = pending.catch(() => {}).then(async () => {
      if (stopped) return;
      try { await host.request('rememberSession', id); }
      catch { if (lastSession === id) lastSession = ''; }
    });
  }
  // Finish any already-issued write before logout clears the native record.
  host.pauseSessionTracking = async () => { stopped = true; await pending.catch(() => {}); };
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = Reflect.apply(original, this, args);
      remember();
      return result;
    };
  }
  addEventListener('popstate', remember);
  addEventListener('pageshow', remember);
  addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', remember);
  remember();
})();
