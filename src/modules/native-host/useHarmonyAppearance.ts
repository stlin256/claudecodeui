import { useSyncExternalStore } from 'react';

const APPEARANCE_EVENT = 'cloudcli-harmony:appearance';

function snapshot(): 'light' | 'dark' | null {
  const mode = (window as unknown as { cloudcliHarmonyAppearance?: string }).cloudcliHarmonyAppearance;
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'auto') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return null;
}

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  window.addEventListener(APPEARANCE_EVENT, callback);
  media?.addEventListener('change', callback);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, callback);
    media?.removeEventListener('change', callback);
  };
}

/** Used by the shared ThemeProvider to honor app-local HarmonyOS appearance settings. */
export function useHarmonyAppearance(): 'light' | 'dark' | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
