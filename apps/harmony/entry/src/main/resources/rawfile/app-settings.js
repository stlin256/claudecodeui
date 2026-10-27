/* App-owned screens use CloudCLI tokens; preferences belong to this device. */
(() => {
  const host = window.cloudcliHarmonyHost;
  if (!host) return;
  const app = window.cloudcliHarmonyApp;
  const defaults = { actionRequired: true, error: true, completion: true, info: true };
  let panel = null, opening = null, closing = null, config, returnFocus;
  let current = 'home';
  const animate = (node, close = false, direction = 1) => host.animate?.(node, close, direction) || Promise.resolve();
  const buttonClass = 'rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent';
  const row = (page, title, detail) => `<button type="button" data-page="${page}" class="cc-row"><span><strong>${title}</strong><small>${detail}</small></span><span aria-hidden="true">›</span></button>`;
  const field = (key, label, hint, type = 'text') => `<label class="cc-field"><span>${label}</span><input data-field="${key}" type="${type}" autocomplete="off" spellcheck="false"><small>${hint}</small></label>`;
  const status = message => { const node = panel?.querySelector('[data-status]'); if (node) node.textContent = message; };
  const error = value => status(value.message || '操作失败，请重试');

  function origin(value) {
    let parsed;
    try { parsed = new URL(value.trim()); } catch { throw new Error('请输入完整的 HTTPS 地址'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !/^[a-z0-9.-]+$/i.test(parsed.hostname)) {
      throw new Error('请填写 HTTPS 源地址：域名和可选端口，不包含路径、账号或参数');
    }
    return parsed.origin;
  }

  function connectionValue() {
    const loginMode = panel.querySelector('[name="login-mode"]:checked').value;
    const serverOrigin = origin(panel.querySelector('[data-field="server"]').value);
    const authenticationOrigins = loginMode === 'passkey'
      ? [...new Set(panel.querySelector('[data-field="auth"]').value.split(/[,，\n]/).map(value => value.trim()).filter(Boolean).map(origin))] : [];
    if (authenticationOrigins.length > 10) throw new Error('登录服务地址最多填写 10 个');
    return { serverOrigin, authenticationOrigins, loginMode };
  }

  host.closeSettings = () => {
    if (!panel) return Promise.resolve();
    if (closing) return closing;
    const old = panel; old.inert = true;
    closing = animate(old, true).then(() => {
      old.remove(); panel = null;
      void host.request('settingsClosed').catch(() => {});
      if (returnFocus?.isConnected) returnFocus.focus();
    }).finally(() => { closing = null; });
    return closing;
  };
  host.backSettings = () => current === 'home' ? host.closeSettings() : navigate('home', -1);

  async function navigate(page, direction = 1) {
    if (!panel || panel.inert) return;
    current = page;
    const content = panel.querySelector('[data-content]');
    const titles = { home: '应用设置', notifications: '分级通知', connection: '连接与登录', about: '关于' };
    panel.querySelector('[data-title]').textContent = titles[page];
    panel.querySelector('[data-back]').setAttribute('aria-label', page === 'home' ? '关闭应用设置' : '返回应用设置');
    content.replaceChildren(); status('');
    if (page === 'home') {
      content.innerHTML = `<section class="cc-card"><h3>外观</h3><div class="cc-segments" role="group" aria-label="外观模式"><button data-theme="light">亮色</button><button data-theme="dark">暗色</button><button data-theme="auto">自动</button></div><p class="cc-note">自动模式跟随系统。设置仅对当前设备生效。</p></section>
        <section class="cc-card">${row('notifications', '分级通知', '待确认 · 失败 · 完成 · 其他')}${row('connection', '连接与登录', '网页地址、密码登录或 Passkey')}${row('about', '关于', '版本、维护者、源代码与问题反馈')}</section><button data-action="logout" class="cc-danger">退出登录</button>`;
      const mark = () => content.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(config.themeMode === button.dataset.theme)));
      mark();
      content.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', async () => {
        try { await host.request('setTheme', button.dataset.theme); config.themeMode = button.dataset.theme; mark(); status(''); } catch (value) { error(value); }
      }));
      content.querySelector('[data-action="logout"]').addEventListener('click', () => { void host.logout().catch(error); });
    } else if (page === 'notifications') {
      content.innerHTML = `<section class="cc-card"><label class="cc-switch"><span><strong>允许本机通知</strong><small>关闭后停止向这台设备发送推送</small></span><input type="checkbox" role="switch" data-master></label></section>
        <section class="cc-card"><h3>按事件级别接收</h3><div class="cc-presets"><button data-preset="important" class="${buttonClass}">仅重要</button><button data-preset="all" class="${buttonClass}">全部</button><button data-preset="none" class="${buttonClass}">全部静音</button></div>
        ${[['actionRequired', '待确认', '权限申请、需要你操作的任务'], ['error', '任务失败', '运行错误与失败提醒'], ['completion', '任务完成', '任务停止、完成及后台工作完成'], ['info', '其他消息', '普通状态与信息提醒']].map(([key, title, detail]) => `<label class="cc-switch"><span><strong>${title}</strong><small>${detail}</small></span><input type="checkbox" role="switch" data-level="${key}"></label>`).join('')}</section>
        <p class="cc-note">本机选项与 CloudCLI 账户通知设置同时生效。铃声和横幅取决于系统通知设置；当前推送可能静默显示，请留意通知中心。</p><p data-delivery class="cc-note" aria-live="polite"></p>`;
      const render = state => {
        if (!panel || current !== 'notifications') return;
        const value = state.desktopNotifications;
        content.querySelector('[data-master]').checked = value.enabled;
        const levels = { ...defaults, ...value.notificationEvents };
        content.querySelectorAll('[data-level]').forEach(input => { input.checked = levels[input.dataset.level]; });
        content.querySelector('[data-delivery]').textContent = value.lastError || (value.enabled ? (value.connectedCount ? '设备已连接推送服务' : '正在连接推送服务') : '本机通知已关闭；分级偏好仍会保存');
      };
      const perform = async action => {
        const inputs = [...content.querySelectorAll('input,button')]; inputs.forEach(input => { input.disabled = true; });
        try { const state = await action(); render(state); if (state.desktopNotifications.lastError) throw new Error(state.desktopNotifications.lastError); status('已保存'); }
        catch (value) { error(value); try { render(await window.cloudcliDesktopNotifications.getState()); } catch {} }
        finally { inputs.forEach(input => { input.disabled = false; }); }
      };
      content.querySelector('[data-master]').addEventListener('change', event => { void perform(() => window.cloudcliDesktopNotifications.update({ enabled: event.target.checked })); });
      content.querySelectorAll('[data-level]').forEach(input => input.addEventListener('change', () => {
        const levels = Object.fromEntries([...content.querySelectorAll('[data-level]')].map(field => [field.dataset.level, field.checked]));
        void perform(() => window.cloudcliDesktopNotifications.updateEvents(levels));
      }));
      content.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
        const preset = button.dataset.preset;
        void perform(() => window.cloudcliDesktopNotifications.updateEvents({ actionRequired: preset !== 'none', error: preset !== 'none', completion: preset === 'all', info: preset === 'all' }));
      }));
      try { render(await window.cloudcliDesktopNotifications.getState()); } catch (value) { error(value); }
    } else if (page === 'connection') {
      content.innerHTML = `<form data-connection><section class="cc-card"><h3>1 · 网页服务</h3>${field('server', 'CloudCLI 网页地址', '填写访问 CloudCLI 的 HTTPS 地址，例如 https://cloudcli.example.com:9443；不要填写登录服务地址。', 'url')}</section>
        <section class="cc-card"><h3>2 · 登录方式</h3><label class="cc-choice"><input type="radio" name="login-mode" value="password"><span><strong>官方账号 / 密码</strong><small>保留原版登录与首次注册流程，无需填写额外登录地址。</small></span></label>
        <label class="cc-choice"><input type="radio" name="login-mode" value="passkey"><span><strong>Passkey / 登录网关</strong><small>使用网关、身份服务和系统指纹 / 密钥认证；登录页由远端服务提供。</small></span></label>
        <div data-auth-fields>${field('auth', '身份认证服务地址', '填写跳转经过的 HTTPS 身份服务源地址，多个用逗号分隔。与网页同源时可留空。')}</div></section>
        <section class="cc-card"><h3>3 · 连接前确认</h3><p class="cc-note" data-login-help></p><p class="cc-note">需要网络可达、有效 HTTPS 证书。更换服务器会先撤销旧设备通知；应用不会保存网页登录密码或 Passkey 私钥。</p><button type="submit" class="cc-primary">保存并重新连接</button></section></form>`;
      content.querySelector('[data-field="server"]').value = config.serverOrigin;
      content.querySelector('[data-field="auth"]').value = config.authenticationOrigins.join(', ');
      const mode = config.loginMode || (config.authenticationOrigins.length ? 'passkey' : 'password');
      content.querySelector(`[name="login-mode"][value="${mode === 'passkey' ? 'passkey' : 'password'}"]`).checked = true;
      const explain = () => {
        const passkey = content.querySelector('[name="login-mode"]:checked').value === 'passkey';
        content.querySelector('[data-auth-fields]').hidden = !passkey;
        content.querySelector('[data-login-help]').textContent = passkey ? '连接后在网关页面点登录，再完成系统 Passkey 验证。如跳转到外部浏览器，请补全身份服务地址；不要添加无关地址。' : '连接后按原版网页提示输入账号密码；尚未初始化的服务器会显示原版注册页面。';
      };
      explain(); content.querySelectorAll('[name="login-mode"]').forEach(input => input.addEventListener('change', explain));
      content.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault(); const submit = content.querySelector('[type="submit"]');
        try {
          const next = connectionValue(); submit.disabled = true; status('正在保存连接…');
          if (next.serverOrigin !== config.serverOrigin) {
            const state = await window.cloudcliDesktopNotifications.update({ enabled: false });
            if (state.desktopNotifications.lastError) throw new Error(state.desktopNotifications.lastError);
          }
          await host.request('saveConnection', JSON.stringify(next)); await host.closeSettings();
        } catch (value) { error(value); } finally { submit.disabled = false; }
      });
    } else if (page === 'about') {
      content.innerHTML = `<section class="cc-card cc-about"><img data-avatar width="80" height="80" alt="stlin256 的 GitHub 头像"><h3 data-project></h3><p data-version class="cc-note"></p><a data-profile rel="noopener noreferrer" target="_blank"></a></section>
        <section class="cc-card"><a data-repository class="cc-row" rel="noopener noreferrer" target="_blank"><span><strong>源代码仓库</strong><small>GitHub · HarmonyOS 移动分支</small></span><span aria-hidden="true">↗</span></a><a data-issues class="cc-row" rel="noopener noreferrer" target="_blank"><span><strong>报告问题</strong><small>到维护者仓库提交 Issue</small></span><span aria-hidden="true">↗</span></a></section><p class="cc-note">基于 CloudCLI 原版远程界面 · AGPL-3.0-or-later<br>上游：siteboon/claudecodeui</p>`;
      content.querySelector('[data-avatar]').src = app.avatar;
      content.querySelector('[data-project]').textContent = app.name;
      content.querySelector('[data-version]').textContent = `版本 ${app.version} (${app.versionCode}) · HarmonyOS`;
      const link = (selector, url, text) => { const node = content.querySelector(selector); node.href = url; if (text) node.textContent = text; };
      link('[data-profile]', app.profile, `@${app.maintainer}`); link('[data-repository]', app.repository); link('[data-issues]', app.issues);
    }
    content.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => { void navigate(button.dataset.page); }));
    content.scrollTop = 0; void animate(content, false, direction);
  }

  host.openSettings = () => {
    if (opening) return opening;
    if (panel && !closing) return Promise.resolve();
    opening = (async () => {
      if (closing) await closing;
      config = JSON.parse(await host.request('getSettings')); returnFocus = document.activeElement;
      panel = document.createElement('section'); panel.id = 'cloudcli-app-settings'; panel.className = 'fixed inset-0 flex flex-col bg-background text-foreground';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '应用设置');
      panel.innerHTML = `<style>
        #cloudcli-app-settings{z-index:10000;background:hsl(var(--background));color:hsl(var(--foreground));font-size:14px}
        #cloudcli-app-settings *{box-sizing:border-box}#cloudcli-app-settings [hidden]{display:none!important}
        #cloudcli-app-settings header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid hsl(var(--border));flex-shrink:0}
        #cloudcli-app-settings header button{min-width:44px;min-height:44px;border-radius:10px;font-size:24px}
        #cloudcli-app-settings h2{font-size:18px;font-weight:600}#cloudcli-app-settings h3{font-size:14px;font-weight:600;margin:0 0 12px}
        #cloudcli-app-settings [data-content]{overflow:auto;flex:1;padding:20px 16px;width:100%;max-width:720px;margin:0 auto}
        #cloudcli-app-settings .cc-card{border:1px solid hsl(var(--border));border-radius:12px;padding:16px;margin-bottom:20px;background:hsl(var(--background))}
        #cloudcli-app-settings .cc-row,#cloudcli-app-settings .cc-switch{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:64px;text-align:left;padding:10px 0;color:inherit;text-decoration:none}
        #cloudcli-app-settings .cc-row+.cc-row,#cloudcli-app-settings .cc-switch+.cc-switch{border-top:1px solid hsl(var(--border))}
        #cloudcli-app-settings strong{font-weight:500;display:block}#cloudcli-app-settings small,#cloudcli-app-settings .cc-note{display:block;font-size:12px;color:hsl(var(--muted-foreground));line-height:1.7;margin-top:4px;overflow-wrap:anywhere}
        #cloudcli-app-settings .cc-segments,#cloudcli-app-settings .cc-presets{display:flex;gap:8px;flex-wrap:wrap}#cloudcli-app-settings .cc-segments button{flex:1;border:1px solid hsl(var(--border));border-radius:8px;min-height:44px}
        #cloudcli-app-settings [aria-pressed=true]{background:hsl(var(--accent));border-color:hsl(var(--primary))!important}
        #cloudcli-app-settings input[type=checkbox]{appearance:none;width:40px;height:24px;border-radius:999px;background:hsl(var(--muted));border:1px solid hsl(var(--border));position:relative;flex-shrink:0;cursor:pointer}
        #cloudcli-app-settings input[type=checkbox]::after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:hsl(var(--background));box-shadow:0 1px 3px #0003;transition:transform .18s}
        #cloudcli-app-settings input[type=checkbox]:checked{background:hsl(var(--primary));border-color:hsl(var(--primary))}#cloudcli-app-settings input[type=checkbox]:checked::after{transform:translateX(16px)}
        #cloudcli-app-settings .cc-field{display:block;margin:12px 0}#cloudcli-app-settings .cc-field>span{display:block;margin-bottom:8px}
        #cloudcli-app-settings .cc-field input{height:44px;width:100%;border-radius:8px;border:1px solid hsl(var(--input));background:hsl(var(--background));padding:0 12px}
        #cloudcli-app-settings .cc-choice{display:flex;gap:12px;align-items:flex-start;padding:12px 0}#cloudcli-app-settings .cc-choice input{margin-top:5px;accent-color:hsl(var(--primary))}
        #cloudcli-app-settings .cc-primary{border-radius:8px;min-height:44px;padding:8px 16px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));margin-top:12px}
        #cloudcli-app-settings .cc-danger{color:hsl(var(--destructive));border:1px solid hsl(var(--destructive));border-radius:8px;min-height:44px;width:100%}
        #cloudcli-app-settings .cc-about{text-align:center}#cloudcli-app-settings .cc-about img{border-radius:50%;margin:0 auto 16px}#cloudcli-app-settings .cc-about a{color:hsl(var(--primary))}
        #cloudcli-app-settings [data-status]{padding:0 20px 12px;font-size:12px;color:hsl(var(--muted-foreground));flex-shrink:0}
        #cloudcli-app-settings button,#cloudcli-app-settings input,#cloudcli-app-settings a{transition:background-color .18s,color .18s,border-color .18s,opacity .18s}
        #cloudcli-app-settings button:active{opacity:.7}#cloudcli-app-settings button:disabled{opacity:.5}#cloudcli-app-settings :focus-visible{outline:2px solid hsl(var(--ring));outline-offset:3px}
        @media(prefers-reduced-motion:reduce){#cloudcli-app-settings *{transition:none!important}}
      </style><header><button type="button" data-back aria-label="返回">‹</button><div><h2 data-title>应用设置</h2><p class="cc-note">当前设备</p></div></header><div data-content></div><p data-status role="status" aria-live="polite"></p>`;
      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); void host.backSettings(); }
        if (event.key === 'Tab') {
          const fields = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(node => !node.closest('[hidden]'));
          const first = fields[0], last = fields.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      });
      panel.querySelector('[data-back]').addEventListener('click', () => { void host.backSettings(); });
      document.body.append(panel); await host.request('settingsOpened'); await navigate('home');
      void animate(panel); panel.querySelector('[data-back]').focus();
    })().catch(value => { if (panel) error(value); }).finally(() => { opening = null; });
    return opening;
  };
})();
