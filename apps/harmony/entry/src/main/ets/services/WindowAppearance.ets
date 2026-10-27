import { window } from '@kit.ArkUI';

/** Shares the actual website appearance with the native window and system bars. */
export class WindowAppearance {
  static mainWindow: window.Window | null = null;

  static async fullscreen(enabled: boolean): Promise<void> {
    if (WindowAppearance.mainWindow === null) return;
    await WindowAppearance.mainWindow.setWindowSystemBarEnable(enabled ? [] : ['status', 'navigation']);
    await WindowAppearance.mainWindow.setWindowLayoutFullScreen(enabled);
  }

  static apply(dark: boolean): void {
    AppStorage.setOrCreate<boolean>('nativeDark', dark);
    if (WindowAppearance.mainWindow === null) return;
    WindowAppearance.mainWindow.setWindowBackgroundColor(dark ? '#141414' : '#f6f4ef');
    WindowAppearance.mainWindow.setWindowSystemBarProperties({
      statusBarColor: '#00000000',
      navigationBarColor: '#00000000',
      statusBarContentColor: dark ? '#FFFFFF' : '#000000',
      navigationBarContentColor: dark ? '#FFFFFF' : '#000000'
    }).catch(() => {});
  }
}
