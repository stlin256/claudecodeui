import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { notificationManager } from '@kit.NotificationKit';
import { pushService } from '@kit.PushKit';
import { webview } from '@kit.ArkWeb';
import { WindowAppearance } from './WindowAppearance';

/** Only the configured CloudCLI top-level origin may use this narrow bridge. */
export class NativeNotifications {
  private settings: preferences.Preferences | null = null;
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private origin: string;
  private hostAction: (command: string, value: string) => Promise<string>;

  constructor(context: common.UIAbilityContext,
    controller: webview.WebviewController, origin: string, hostAction: (command: string, value: string) => Promise<string>) {
    this.context = context;
    this.controller = controller;
    this.origin = origin;
    this.hostAction = hostAction;
  }

  async initialize(): Promise<void> {
    this.settings = await preferences.getPreferences(this.context, { name: 'cloudcli-native' });
    if (!this.settings.hasSync('deviceId')) {
      this.settings.putSync('deviceId', util.generateRandomUUID());
      await this.settings.flush();
    }
  }

  private requireOrigin(): void {
    // Checking both the calling frame and top-level page prevents an untrusted iframe
    // or a later OIDC navigation from requesting a token or prompting permissions.
    const caller = this.controller.getLastJavascriptProxyCallingFrameUrl();
    const top = this.controller.getUrl();
    if (!this.atOrigin(caller) || !this.atOrigin(top)) throw new Error('Untrusted bridge origin');
  }

  private atOrigin(value: string): boolean {
    return value === this.origin || value.startsWith(this.origin + '/');
  }

  // ArkWeb JavaScriptProxy does not marshal ArkTS Promise results. Use a
  // synchronous request entry point and return results through a page callback.
  request(id: string, command: string, value: string): void {
    this.requireOrigin();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || value.length > 4096) return;
    this.dispatch(command, value).then((result: string) => {
      this.reply(id, true, result);
    }).catch((error: Object) => {
      const code = (error as Error).message;
      this.reply(id, false, code ? code.slice(0, 160) : 'Native operation failed');
    });
  }

  private async dispatch(command: string, value: string): Promise<string> {
    if (command === 'getState') return await this.state();
    if (command === 'configure') return await this.configure(value === 'true');
    if (command === 'pushToken') return await this.pushToken();
    if (command === 'appearance') { WindowAppearance.apply(value === 'true'); return '{}'; }
    if (command === 'clearSession') {
      this.settings?.putSync('enabled', false);
      await this.settings?.flush();
      try { await pushService.deleteToken(); } catch (_) {}
      await webview.WebCookieManager.clearAllCookies();
      webview.WebStorage.deleteAllData();
      return await this.hostAction(command, value);
    }
    if (['getHostState', 'getSettings', 'setTheme', 'saveConnection', 'settingsOpened', 'settingsClosed'].includes(command)) {
      return await this.hostAction(command, value);
    }
    throw new Error('Unknown native operation');
  }

  private reply(id: string, success: boolean, value: string): void {
    if (!this.atOrigin(this.controller.getUrl())) return;
    const code = 'if(location.origin===' + JSON.stringify(this.origin) + ') window.__cloudcliHarmonyResponse?.(' +
      JSON.stringify(id) + ',' + (success ? 'true' : 'false') + ',' + JSON.stringify(value) + ')';
    this.controller.runJavaScript(code).catch(() => {});
  }

  private async state(): Promise<string> {
    return JSON.stringify({
      enabled: this.settings?.getSync('enabled', false) === true,
      permitted: await notificationManager.isNotificationEnabled(),
      deviceId: this.settings?.getSync('deviceId', '')
    });
  }

  private async configure(enabled: boolean): Promise<string> {
    if (enabled) {
      await notificationManager.requestEnableNotification(this.context);
      if (!await notificationManager.isNotificationEnabled()) throw new Error('Notifications denied');
      // Failing Push Kit entitlement must not be reported as successful registration.
      const token = await pushService.getToken();
      this.settings?.putSync('enabled', true);
      await this.settings?.flush();
      return JSON.stringify({ deviceId: this.settings?.getSync('deviceId', ''), token });
    }
    this.settings?.putSync('enabled', false);
    await this.settings?.flush();
    return this.state();
  }

  private async pushToken(): Promise<string> {
    if (this.settings?.getSync('enabled', false) !== true ||
      !await notificationManager.isNotificationEnabled()) throw new Error('Notifications disabled');
    return await pushService.getToken();
  }
}
