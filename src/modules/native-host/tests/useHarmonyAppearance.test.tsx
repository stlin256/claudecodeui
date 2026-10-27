import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { useHarmonyAppearance } from '@/modules/native-host';

const host = window as unknown as { cloudcliHarmonyAppearance?: string };
afterEach(() => { delete host.cloudcliHarmonyAppearance; vi.unstubAllGlobals(); });

test('ordinary web browsers keep their original theme; app overrides remain local', () => {
  const subscribers = new Set<() => void>();
  let systemDark = false;
  vi.stubGlobal('matchMedia', () => ({ matches: systemDark,
    addEventListener: (_: string, callback: () => void) => subscribers.add(callback),
    removeEventListener: (_: string, callback: () => void) => subscribers.delete(callback),
  }));
  const hook = renderHook(() => useHarmonyAppearance());
  expect(hook.result.current).toBeNull();
  act(() => { host.cloudcliHarmonyAppearance = 'dark'; window.dispatchEvent(new Event('cloudcli-harmony:appearance')); });
  expect(hook.result.current).toBe('dark');
  act(() => { host.cloudcliHarmonyAppearance = 'light'; window.dispatchEvent(new Event('cloudcli-harmony:appearance')); });
  expect(hook.result.current).toBe('light');
  act(() => { host.cloudcliHarmonyAppearance = 'auto'; window.dispatchEvent(new Event('cloudcli-harmony:appearance')); });
  expect(hook.result.current).toBe('light');
  act(() => { systemDark = true; subscribers.forEach(callback => callback()); });
  expect(hook.result.current).toBe('dark');
  hook.unmount();
  expect(subscribers.size).toBe(0);
});
