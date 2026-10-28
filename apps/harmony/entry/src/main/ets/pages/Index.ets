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
  loginMode: string = 'password';
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
  // Resolve the initial route before Web mounts; a notification target wins.
  @State private initialPage: string = '';
  // Connection setup is shown only until an HTTPS origin has been configured.
  @State private serverInput: string = '';
  // OIDC origins are explicit; no broad wildcard is trusted for authentication.
  @State private authInput: string = '';
  @State private loginMode: string = 'password';
  @State private guideStep: number = 0;
  @State private connecting: boolean = false;
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
    const normalized = value.trim().replace(/\/+$/, '').toLowerCase();
    // No credentials, path, query, fragment or insecure transport in configured origins.
    if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(normalized)) return '';
    const port = normalized.match(/:([0-9]+)$/);
    if (port && (Number(port[1]) < 1 || Number(port[1]) > 65535)) return '';
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
    this.loginMode = this.config.loginMode || (this.config.authenticationOrigins.length ? 'passkey' : 'password');
    if (this.origin(this.serverInput)) await this.prepareWeb();
  }

  private async save(): Promise<void> {
    const origin = this.origin(this.serverInput);
    const authOrigins = this.loginMode === 'passkey' ? this.authInput.split(/[,，\n]/).map((value: string) => value.trim()).filter((value: string) => value.length > 0) : [];
    if (!origin || authOrigins.length > 10 || authOrigins.some((value: string) => !this.origin(value))) {
      this.error = '请输入 HTTPS 源地址（域名及可选端口，不包含路径）';
      return;
    }
    if (this.config.serverOrigin && this.config.serverOrigin !== origin) await this.notifications?.resetConnection();
    this.config.serverOrigin = origin;
    this.config.authenticationOrigins = authOrigins.map((value: string) => this.origin(value));
    this.config.loginMode = this.loginMode;
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
          this.requestedSession = '';
          this.settings?.deleteSync('lastSession:' + this.config.serverOrigin);
          await this.settings?.flush();
          this.controller.loadUrl(this.config.serverOrigin + '/');
        }
        if (command === 'rememberSession') {
          if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new Error('Invalid session');
          this.settings?.putSync('lastSession:' + this.config.serverOrigin, value);
          await this.settings?.flush();
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
          this.loginMode = next.loginMode === 'passkey' ? 'passkey' : 'password';
          await this.reconnect();
        }
        return JSON.stringify({ themeMode: this.themeMode,
          serverOrigin: this.config.serverOrigin, authenticationOrigins: this.config.authenticationOrigins,
          loginMode: this.loginMode });
      });
    await this.notifications.initialize();
    const notificationScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('notification-bridge.js'));
    const settingsScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('app-settings.js'));
    const infoScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('app-info.js'));
    const motionScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('app-motion.js'));
    const sessionScript = util.TextDecoder.create('utf-8').decodeToString(
      await this.context.resourceManager.getRawFileContent('app-session.js'));
    // ArkWeb scriptRules match origins, and reject URL path wildcards.
    this.scripts = [{ script: infoScript + '\n' + notificationScript + '\n' + motionScript + '\n' + sessionScript + '\n' + settingsScript, scriptRules: [this.config.serverOrigin] }];
    const saved = this.settings?.getSync('lastSession:' + this.config.serverOrigin, '') as string;
    const target = this.requestedSession || saved;
    this.initialPage = this.config.serverOrigin + (/^[A-Za-z0-9_-]{1,160}$/.test(target) ? '/session/' + encodeURIComponent(target) : '/');
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
    const target = this.config.serverOrigin + '/session/' + encodeURIComponent(id);
    if (this.controller.getUrl().replace(/\/$/, '') !== target) this.controller.loadUrl(target);
  }

  onBackPress(): boolean {
    if (!this.ready && this.guideStep > 0) {
      this.getUIContext().animateTo({ duration: 180, curve: Curve.EaseOut }, () => { this.guideStep--; });
      return true;
    }
    if (this.settingsOpen) {
      this.controller.runJavaScript('window.cloudcliHarmonyHost?.backSettings()').catch(() => {});
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

  private nextGuide(): void {
    if (this.guideStep === 0 && !this.origin(this.serverInput)) {
      this.error = '请填写有效的 HTTPS 网页地址，不包含路径、账号、查询参数'; return;
    }
    if (this.guideStep === 1 && this.loginMode === 'passkey' &&
      this.authInput.split(/[,，\n]/).filter((value: string) => value.trim()).some((value: string) => !this.origin(value))) {
      this.error = '请检查身份认证服务的 HTTPS 源地址'; return;
    }
    this.error = '';
    this.getUIContext().animateTo({ duration: 220, curve: Curve.EaseOut }, () => { this.guideStep++; });
  }

  @Builder
  private connectionGuide() {
    Scroll() {
      Column({ space: 18 }) {
        Text('CloudCLI Harmony').fontSize(26).fontWeight(FontWeight.Bold)
        Text('连接你的远程工作空间').fontSize(15).opacity(0.7)
        Text('步骤 ' + (this.guideStep + 1) + ' / 3').fontSize(12).opacity(0.6)
        if (this.guideStep === 0) {
          Text('网页服务地址').fontSize(20).fontWeight(FontWeight.Medium)
          Text('填写平时在浏览器访问 CloudCLI 的 HTTPS 地址。端口可以保留，不包含页面路径。').fontSize(14)
          TextInput({ text: this.serverInput, placeholder: 'https://cloudcli.example.com:9443' })
            .type(InputType.URL).onChange((value: string) => { this.serverInput = value; })
          Text('请填写 CloudCLI 网页地址；身份服务地址将在下一步单独配置。').fontSize(12).opacity(0.6)
        } else if (this.guideStep === 1) {
          Text('选择登录方式').fontSize(20).fontWeight(FontWeight.Medium)
          Button((this.loginMode === 'password' ? '✓  ' : '') + '官方账号 / 密码')
            .width('100%').onClick(() => { this.loginMode = 'password'; })
          Text('保留官方原版登录、首次注册流程，不在 APP 中保存密码。').fontSize(13).opacity(0.7)
          Button((this.loginMode === 'passkey' ? '✓  ' : '') + 'Passkey / 登录网关')
            .width('100%').onClick(() => { this.loginMode = 'passkey'; })
          if (this.loginMode === 'passkey') {
            Text('配置登录跳转经过的身份认证服务源地址，多个用逗号分隔；与网页同源时可留空。').fontSize(13).opacity(0.7)
            TextInput({ text: this.authInput, placeholder: 'https://auth.example.com' })
              .onChange((value: string) => { this.authInput = value; })
            Text('连接后在网关页面点登录，并通过系统指纹或 Passkey 完成验证。').fontSize(13).opacity(0.7)
          }
        } else {
          Text('确认连接').fontSize(20).fontWeight(FontWeight.Medium)
          Text(this.origin(this.serverInput)).fontSize(15)
          Text(this.loginMode === 'passkey' ? 'Passkey / 登录网关' : '官方账号 / 密码').fontSize(14)
          Text('请确认服务网络可达且 HTTPS 证书有效。APP 原样加载远端页面；系统栏始终保留安全区域。').fontSize(13).opacity(0.7)
          Button(this.connecting ? '正在连接…' : '连接 CloudCLI').enabled(!this.connecting).onClick(() => {
            this.connecting = true;
            this.save().catch(() => { this.error = '连接失败，请检查地址、网络和证书'; }).finally(() => { this.connecting = false; });
          })
        }
        Row({ space: 12 }) {
          if (this.guideStep > 0) {
            Button('上一步').onClick(() => {
              this.getUIContext().animateTo({ duration: 180, curve: Curve.EaseOut }, () => { this.guideStep--; });
            })
          }
          if (this.guideStep < 2) { Button('下一步').onClick(() => { this.nextGuide(); }) }
        }
      }.padding(24).width('100%').constraintSize({ maxWidth: 640 })
        .transition(TransitionEffect.OPACITY)
    }.width('100%').layoutWeight(1)
  }

  build() {
    Stack() {
      Column() {
      if (this.ready) {
        Web({ src: this.initialPage, controller: this.controller })
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
          .onErrorReceive((event) => {
            if (event.request.isMainFrame()) this.error = '网页无法加载，请检查网络、地址和 HTTPS 证书';
          })
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
        this.connectionGuide()
      }
      if (this.error.length > 0) {
        Text(this.error).fontColor('#b91c1c').padding(12)
        if (this.ready) {
          Button('修改连接配置').onClick(() => {
            this.ready = false; this.controller = new webview.WebviewController(); this.guideStep = 0;
          })
        }
      }
      }.width('100%').height('100%')
      .backgroundColor(this.nativeDark ? '#141414' : '#f6f4ef')
    }.width('100%').height('100%')
      .backgroundColor(this.nativeDark ? '#141414' : '#f6f4ef')
  }
}
