/* App-owned settings, rendered with the original page's CloudCLI design tokens.
 * Values live in HarmonyOS preferences; this panel never writes server-wide UI settings.
 */
(() => {
  const host = window.cloudcliHarmonyHost;
  if (!host) return;
  let panel = null;
  host.closeSettings = () => {
    panel?.remove();
    panel = null;
    void host.request('settingsClosed').catch(() => {});
  };
  host.openSettings = async () => {
    if (panel) return;
    const config = JSON.parse(await host.request('getSettings'));
    const root = document.createElement('section');
    root.id = 'cloudcli-app-settings';
    root.className = 'fixed inset-0 flex flex-col bg-background text-foreground';
    root.style.zIndex = '10000';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '应用设置');
    root.innerHTML = `
      <div class="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" data-action="close" class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="返回">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div><h2 class="text-lg font-semibold">应用设置</h2><p class="text-xs text-muted-foreground">当前设备</p></div>
      </div>
      <div class="flex-1 overflow-y-auto p-4 md:p-6">
        <div class="mx-auto w-full max-w-2xl space-y-6">
          <section class="space-y-3"><h3 class="text-sm font-medium">外观</h3>
            <div class="flex gap-2" role="group" aria-label="外观模式">
              <button type="button" data-theme="light" class="flex-1 rounded-lg border border-border px-3 py-3 text-sm transition-colors">亮色</button>
              <button type="button" data-theme="dark" class="flex-1 rounded-lg border border-border px-3 py-3 text-sm transition-colors">暗色</button>
              <button type="button" data-theme="auto" class="flex-1 rounded-lg border border-border px-3 py-3 text-sm transition-colors">自动</button>
            </div>
          </section>
          <section class="space-y-3"><h3 class="text-sm font-medium">连接</h3>
            <label class="block space-y-2"><span class="text-sm text-muted-foreground">网页地址</span>
              <input data-field="server" type="url" autocomplete="off" spellcheck="false" placeholder="https://cloudcli.example.com" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <label class="block space-y-2"><span class="text-sm text-muted-foreground">登录服务地址</span>
              <input data-field="auth" type="text" autocomplete="off" spellcheck="false" placeholder="https://auth.example.com" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <p class="text-xs text-muted-foreground">多个登录服务地址用逗号分隔。</p>
            <button type="button" data-action="connect" class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">保存并重新连接</button>
          </section>
          <section class="space-y-3 border-t border-border pt-5"><h3 class="text-sm font-medium">系统通知</h3>
            <button type="button" data-action="notifications" class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">开启通知</button>
          </section>
          <section class="border-t border-border pt-5">
            <button type="button" data-action="logout" class="inline-flex h-10 items-center justify-center rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">退出登录</button>
          </section>
          <p data-status role="status" class="text-sm text-muted-foreground"></p>
          <p class="text-xs text-muted-foreground">CloudCLI · HarmonyOS</p>
        </div>
      </div>`;
    root.querySelector('[data-field="server"]').value = config.serverOrigin;
    root.querySelector('[data-field="auth"]').value = config.authenticationOrigins.join(', ');
    const status = root.querySelector('[data-status]');
    const showError = error => { status.textContent = error.message || '操作失败，请重试'; };
    function markTheme(mode) {
      for (const button of root.querySelectorAll('[data-theme]')) {
        const selected = button.dataset.theme === mode;
        button.setAttribute('aria-pressed', String(selected));
        button.style.backgroundColor = selected ? 'hsl(var(--accent))' : '';
        button.style.borderColor = selected ? 'hsl(var(--primary))' : '';
      }
    }
    markTheme(config.themeMode);
    for (const button of root.querySelectorAll('[data-theme]')) {
      button.addEventListener('click', async () => {
        try {
          await host.request('setTheme', button.dataset.theme);
          markTheme(button.dataset.theme);
          status.textContent = '';
        } catch (error) { showError(error); }
      });
    }
    root.querySelector('[data-action="close"]').addEventListener('click', host.closeSettings);
    root.querySelector('[data-action="connect"]').addEventListener('click', async () => {
      try {
        const nextOrigin = root.querySelector('[data-field="server"]').value.trim().replace(/\/+$/, '');
        if (nextOrigin !== config.serverOrigin) {
          const state = await window.cloudcliDesktopNotifications.update({ enabled: false });
          if (state.desktopNotifications.lastError) throw new Error(state.desktopNotifications.lastError);
        }
        await host.request('saveConnection', JSON.stringify({
          serverOrigin: nextOrigin,
          authenticationOrigins: root.querySelector('[data-field="auth"]').value.split(',').map(value => value.trim()).filter(Boolean),
        }));
        host.closeSettings();
      } catch (error) { showError(error); }
    });
    root.querySelector('[data-action="logout"]').addEventListener('click', () => { void host.logout().catch(showError); });
    const notificationButton = root.querySelector('[data-action="notifications"]');
    const renderNotificationState = state => {
      notificationButton.dataset.enabled = String(Boolean(state.desktopNotifications.enabled));
      notificationButton.textContent = state.desktopNotifications.enabled ? '关闭通知' : '开启通知';
      status.textContent = state.desktopNotifications.lastError || '';
    };
    notificationButton.addEventListener('click', async () => {
      notificationButton.disabled = true;
      try {
        renderNotificationState(await window.cloudcliDesktopNotifications.update({ enabled: notificationButton.dataset.enabled !== 'true' }));
      } catch (error) { showError(error); }
      finally { notificationButton.disabled = false; }
    });
    document.body.append(root);
    panel = root;
    void host.request('settingsOpened').catch(showError);
    void window.cloudcliDesktopNotifications.getState().then(renderNotificationState).catch(showError);
    root.querySelector('[data-action="close"]').focus();
  };
})();
