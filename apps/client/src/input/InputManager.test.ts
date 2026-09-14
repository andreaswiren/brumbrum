import { afterEach, expect, it, vi } from 'vitest';
import { InputManager } from './InputManager';
afterEach(() => vi.unstubAllGlobals());
it('keeps keyboard wheelies separate from charge-and-release preload', () => {
  const events = new Map<string, (event: unknown) => void>();
  vi.stubGlobal('window', {
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      events.set(name, handler),
  });
  vi.stubGlobal('document', { addEventListener: () => {} });
  vi.stubGlobal('navigator', { getGamepads: () => [] });
  const input = new InputManager();
  const key = (name: string, code: string) =>
    events.get(name)!({ code, target: { matches: () => false }, preventDefault: () => {} });
  key('keydown', 'KeyW');
  key('keydown', 'ArrowDown');
  expect(input.update()).toMatchObject({ throttle: 1, pitch: 1, preload: false });
  key('keyup', 'ArrowDown');
  expect(input.update().preload).toBe(false);
  key('keydown', 'Space');
  expect(input.update().preload).toBe(true);
  key('keyup', 'Space');
  expect(input.update().preload).toBe(false);
});
