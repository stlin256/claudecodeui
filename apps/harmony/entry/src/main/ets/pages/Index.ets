import { common, ConfigurationConstant } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { webview } from '@kit.ArkWeb';
import { picker } from '@kit.CoreFileKit';
import { NativeNotifications } from '../services/NativeNotifications';
import { WindowAppearance } from '../services/WindowAppearance';

class RuntimeConfig {
  serverOrigin: string = '';
  authenticationOrigins: string[] = [];
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
  private config: RuntimeConfig = new RuntimeConfig();
  private notifications: NativeNotifications | null = null;
  private settings: preferences.Preferences | null = null;
  // Build the Web component only after config, script and native bridge are ready.
  @State private ready: boolean = false;
  // Connection setup is shown only until an HTTPS origin has been configured.
  @State private serverInput: string = '';
  // OIDC origins are explicit; no broad wildcard is trusted for authentication.
  @State private authInput: string = '';
  // Native failures are visible without replacing any part of the website's UI.
  @State private error: string = '';
  // Inject the adapter before React reads its existing notification bridge contract.
  @State private scripts: ScriptItem[] = [];
  // Mirror the rendered web theme so loading surfaces and system bars share its color.
  @StorageLink('nativeDark') private nativeDark: boolean = false;
  private settingsOpen: boolean = false;
  // App-local appearance overrides never alter the user's server-wide theme preference.
  @State private themeMode: string = 'auto';
  // Notification Wants retain a session until the CloudCLI page has loaded.
  @StorageLink('requestedSession') @Watch('openSession') private requestedSession: string = '';

  aboutToAppear(): void { this.initialize().catch(() => { this.error = '无法读取应用配置'; }); }

  private origin(value: string): string {
    const normalized = value.trim().replace(/\/+$/, '');
    // No credentials, path, query, fragment or insecure transport in configured origins.
    if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(normalized)) return '';
    return normalized;
  }

  private async initialize(): Promise<void> {
    this.settings = await preferences.getPreferences(this.context, { name: 'cloudcli-connection' });
    const storedMode = this.settings.getSync('themeMode', 'auto') as string;
    this.themeMode = ['light', 'dark', 'auto'].includes(storedMode) ? storedMode : 'auto';
    this.applyNativeTheme();
    await WindowAppearance.fullscreen(false);
    const stored = this.settings.getSync('config', '') as string;
    const bytes = await this.context.resourceManager.getRawFileContent('runtime-config.json');
    const bundled = util.TextDecoder.create('utf-8').decodeToString(bytes);
    this.config = JSON.parse(stored || bundled) as RuntimeConfig;
    this.serverInput = this.config.serverOrigin;
    this.authInput = this.config.authenticationOrigins.join(', ');
    if (this.origin(this.serverInput)) await this.prepareWeb();
  }

  private async save(): Promise<void> {
    const origin = this.origin(this.serverInput);
    const authOrigins = this.authInput.split(',').map((value: string) => value.trim()).filter((value: string) => value.length > 0);
    if (!origin || authOrigins.some((value: string) => !this.origin(value))) {
      this.error = '请输入 HTTPS 源地址（域名及可选端口，不包含路径）';
      return;
    }
    this.config.serverOrigin = origin;
    this.config.authenticationOrigins = authOrigins.map((value: string) => this.origin(value));
    this.settings?.putSync('config', JSON.stringify(this.config));
    await this.settings?.flush();
    await this.prepareWeb();
  }

  private async prepareWeb(): Promise<void> {
    this.notifications = new NativeNotifications(this.context, this.controller, this.config.serverOrigin,
      async (command: string, value: string): Promise<string> => {
        if (command === 'settingsOpened') this.settingsOpen = true;
        if (command === 'settingsClosed') this.settingsOpen = false;
        if (command === 'clearSession') {
          this.settingsOpen = false;
          this.controller.loadUrl(this.config.serverOrigin + '/');
        }
        if (command === 'setTheme') {
          if (!['light', 'dark', 'auto'].includes(value)) throw new Error('Invalid theme');
          await this.setTheme(value);
        }
        if (command === 'saveConnection') {
          const next = JSON.parse(value) as RuntimeConfig;
          if (!this.origin(next.serverOrigin) || !Array.isArray(next.authenticationOrigins) ||
            next.authenticationOrigins.length > 10 || next.authenticationOrigins.some((item: string) => !this.origin(item))) {
            throw new Error('请输入有效的 HTTPS 源地址');
          }
          this.serverInput = next.serverOrigin;
          this.authInput = next.authenticationOrigins.join(', ');
          await this.reconnect();
        }
        return JSON.stringify({ themeMode: this.themeMode,
          serverOrigin: this.config.serverOrigin, authenticationOrigins: this.config.authenticationOrigins });
      });
    await this.notifications.initialize();
    const notificationScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('notification-bridge.js'));
    const settingsScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('app-settings.js'));
    // ArkWeb scriptRules match origins, and reject URL path wildcards.
    this.scripts = [{ script: notificationScript + '\n' + settingsScript, scriptRules: [this.config.serverOrigin] }];
    this.error = '';
    this.ready = true;
  }

  private allowed(value: string): boolean {
    return [this.config.serverOrigin, ...this.config.authenticationOrigins].some((origin: string) =>
      value === origin || value.startsWith(origin + '/'));
  }

  private navigate(value: string): boolean {
    if (this.allowed(value)) return false;
    if (value.startsWith('https://')) {
      this.context.startAbility({ action: 'ohos.want.action.viewData', uri: value }).catch(() => {
        this.error = '无法打开外部链接';
      });
    }
    return true;
  }

  private openSession(): void {
    if (!this.ready || !this.requestedSession || !this.controller.getUrl().startsWith(this.config.serverOrigin + '/')) return;
    const id = this.requestedSession;
    this.requestedSession = '';
    // Same route used by the upstream web app; preserve React routing and gateway cookies.
    this.controller.loadUrl(this.config.serverOrigin + '/session/' + encodeURIComponent(id));
  }

  onBackPress(): boolean {
    if (this.settingsOpen) {
      this.controller.runJavaScript('window.cloudcliHarmonyHost?.closeSettings()').catch(() => {});
      return true;
    }
    if (this.ready && this.controller.accessBackward()) {
      this.controller.backward();
      return true;
    }
    return false;
  }

  private async setTheme(value: string): Promise<void> {
    this.themeMode = value;
    this.applyNativeTheme();
    this.settings?.putSync('themeMode', value);
    await this.settings?.flush();
    await this.controller.runJavaScript('window.cloudcliHarmonyHost?.applyAppearance(' + JSON.stringify(value) + ')');
  }

  private applyNativeTheme(): void {
    this.context.getApplicationContext().setColorMode(this.themeMode === 'dark'
      ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK : this.themeMode === 'light'
      ? ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT : ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
  }

  private async reconnect(): Promise<void> {
    if (!this.origin(this.serverInput)) { this.error = '请输入有效的 HTTPS 源地址'; return; }
    this.settingsOpen = false;
    this.ready = false;
    this.controller = new webview.WebviewController();
    await this.save();
  }

  build() {
    Stack() {
      Column() {
      if (this.ready) {
        Web({ src: this.config.serverOrigin + '/', controller: this.controller })
          .width('100%').layoutWeight(1)
          .javaScriptAccess(true).domStorageAccess(true).databaseAccess(true)
          .darkMode(this.themeMode === 'dark' ? WebDarkMode.On : this.themeMode === 'light' ? WebDarkMode.Off : WebDarkMode.Auto)
          .forceDarkAccess(false)
          .backgroundColor(this.nativeDark ? '#141414' : '#f6f4ef')
          .fileAccess(false).mixedMode(MixedMode.None)
          .javaScriptOnDocumentStart(this.scripts)
          .onControllerAttached(() => {
            if (this.notifications !== null) {
              this.controller.registerJavaScriptProxy(this.notifications, 'cloudcliHarmonyNotifications', ['request']);
            }
          })
          .onLoadIntercept((event) => this.navigate(event.data.getRequestUrl()))
          .onPageEnd(() => { this.openSession(); })
          .onShowFileSelector((event) => {
            const options = new picker.DocumentSelectOptions();
            options.maxSelectNumber = event.fileSelector.getMode() === FileSelectorMode.FileOpenMultipleMode ? 20 : 1;
            new picker.DocumentViewPicker(this.context).select(options).then((uris: string[]) => {
              event.result.handleFileList(uris);
            }).catch(() => { event.result.handleFileList([]); });
            return true;
          })
          .onWindowNew((event) => {
            // Keep trusted OAuth popups in this cookie jar; outside links use the system browser.
            if (this.allowed(event.targetUrl)) this.controller.loadUrl(event.targetUrl);
            else this.navigate(event.targetUrl);
          })
      } else {
        Column({ space: 18 }) {
          Text('连接 CloudCLI').fontSize(28).fontWeight(FontWeight.Bold)
          Text('连接后直接显示服务器上的原版界面。').fontSize(16)
          TextInput({ text: this.serverInput, placeholder: 'https://cloudcli.example.com' })
            .onChange((value: string) => { this.serverInput = value; })
          TextInput({ text: this.authInput, placeholder: 'Passkey / OIDC 源地址，多个用逗号分隔' })
            .onChange((value: string) => { this.authInput = value; })
          Button('连接').onClick(() => { this.save().catch(() => { this.error = '无法保存连接配置'; }); })
        }.padding(24).width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
      }
      if (this.error.length > 0) {
        Text(this.error).fontColor('#b91c1c').padding(12)
      }
      }.width('100%').height('100%')
      .backgroundColor(this.nativeDark ? '#141414' : '#f6f4ef')
    }.width('100%').height('100%')
      .backgroundColor(this.nativeDark ? '#141414' : '#f6f4ef')
  }
}
