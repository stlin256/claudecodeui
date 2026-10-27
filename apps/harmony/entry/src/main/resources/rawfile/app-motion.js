/* App-only motion. Does not animate streamed messages or alter server assets. */
(() => {
  const host = window.cloudcliHarmonyHost;
  if (!host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  host.animate = (element, closing = false, direction = 1) => {
    if (!element?.animate || reduced.matches) return Promise.resolve();
    const frames = closing
      ? [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: `translateY(${direction * 12}px)` }]
      : [{ opacity: 0, transform: `translateY(${direction * 12}px)` }, { opacity: 1, transform: 'translateY(0)' }];
    return element.animate(frames, { duration: closing ? 150 : 220, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(() => {});
  };
  const seen = new WeakSet();
  const installStyle = () => {
    if (!document.head || document.getElementById('cloudcli-app-motion')) return;
    const style = document.createElement('style'); style.id = 'cloudcli-app-motion';
    style.textContent = '@media(prefers-reduced-motion:no-preference){#root .fixed.inset-0.z-50.flex>div.relative{transition-duration:220ms!important;transition-timing-function:cubic-bezier(.2,.8,.2,1)!important}}@media(prefers-reduced-motion:reduce){#root .fixed.inset-0.z-50.flex,#root .fixed.inset-0.z-50.flex>div.relative{transition-duration:0ms!important}}';
    document.head.append(style);
  };
  installStyle(); document.addEventListener('DOMContentLoaded', installStyle);
  function inspect(node) {
    if (!(node instanceof Element)) return;
    const selector = '[role="dialog"],[role="alertdialog"],[data-state="open"][data-radix-popper-content-wrapper]';
    for (const element of [node, ...node.querySelectorAll(selector)]) {
      if (!element.matches(selector) || element.closest('#cloudcli-app-settings') || seen.has(element)) continue;
      seen.add(element);
      void host.animate(element);
    }
  }
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) inspect(node);
  }).observe(document, { childList: true, subtree: true });
  let route = location.pathname;
  const routeMotion = () => {
    if (location.pathname === route) return;
    route = location.pathname;
    requestAnimationFrame(() => {
      void host.animate(document.querySelector('main,[role="main"],#root .fixed.inset-0.flex.bg-background > div.min-w-0.flex-1.flex-col'));
    });
  };
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) { const result = Reflect.apply(original, this, args); routeMotion(); return result; };
  }
  addEventListener('popstate', routeMotion);
})();
