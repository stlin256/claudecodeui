import { UIAbility, Want, Configuration, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { WindowAppearance } from '../services/WindowAppearance';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want): void {
    webview.WebviewController.initializeWebEngine();
    // Debug builds alone expose the standard HDC-forwarded inspection socket.
    if (this.context.applicationInfo.debug) webview.WebviewController.setWebDebuggingAccess(true);
    this.route(want);
  }

  onNewWant(want: Want): void { this.route(want); }

  onWindowStageCreate(stage: window.WindowStage): void {
    const mainWindow = stage.getMainWindowSync();
    WindowAppearance.mainWindow = mainWindow;
    // ArkWeb reports safe-area env() values to the original viewport-fit=cover page.
    // Paint the window underneath both bars instead of reserving white native bands.
    WindowAppearance.fullscreen(false).then(() => {
      WindowAppearance.apply(this.context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
      stage.loadContent('pages/Index');
    }).catch(() => { stage.loadContent('pages/Index'); });
  }

  onConfigurationUpdate(config: Configuration): void {
    WindowAppearance.apply(config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
  }

  onDestroy(): void { WindowAppearance.mainWindow = null; }

  private route(want: Want): void {
    let sessionId: Object | undefined = want.parameters?.sessionId;
    const data = want.parameters?.data;
    if (typeof sessionId !== 'string' && typeof data === 'string' && data.length <= 4096) {
      try { sessionId = (JSON.parse(data) as Record<string, Object>).sessionId; } catch (_) {}
    } else if (typeof sessionId !== 'string' && data !== undefined && typeof data === 'object' && data !== null) {
      sessionId = (data as Record<string, Object>).sessionId;
    }
    if (typeof sessionId === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) {
      AppStorage.setOrCreate<string>('requestedSession', sessionId);
    }
  }
}
