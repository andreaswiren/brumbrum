import { describe, expect, it } from 'vitest';
import { deadzone, GamepadInput, type PadSnapshot } from './GamepadInput';
const idle = () => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  preload: false,
  rearBrake: false,
});
function pad(index: number, down: number[] = [], axes = [0, 0, 0, 0]): PadSnapshot {
  return {
    id: `Controller ${index}`,
    index,
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      value: down.includes(i) ? 1 : 0,
      pressed: down.includes(i),
    })),
  };
}
describe('gamepad control path', () => {
  it('ignores resting flight-stick axes and selects an Xbox pad even in a later slot', () => {
    const flight = { ...pad(0, [], [0, 1, -1, 1]), mapping: '', id: 'Saitek X-56' };
    const input = new GamepadInput(),
      neutral = idle();
    input.update([flight], neutral, () => {});
    expect(neutral).toEqual(idle());
    expect(input.active).toBeUndefined();
    const xbox = idle();
    input.update([flight, null, pad(2, [7])], xbox, () => {});
    expect(input.active?.index).toBe(2);
    expect(xbox.throttle).toBe(1);
    expect(xbox.pitch).toBe(0);
  });
  it('finds sparse controller slots and maps all riding controls', () => {
    const input = new GamepadInput(),
      a = idle();
    input.update([null, null, pad(2, [7, 6, 4, 0], [0.58, -1, 0, 0])], a, () => {});
    expect(a.steer).toBeCloseTo(0.5);
    expect(a).toMatchObject({ throttle: 1, brake: 1, pitch: -1, preload: true, rearBrake: true });
  });
  it('uses the right stick only for camera orbit, never for wheelie or preload', () => {
    const a = idle();
    new GamepadInput().update([pad(0, [], [0, 0, 1, -1])], a, () => {});
    expect(a).toMatchObject({ cameraX: 1, cameraY: -1, pitch: 0, roll: 0, preload: false });
  });
  it('scales analog triggers and suppresses stick drift without a step', () => {
    const p = pad(0);
    (p.buttons as { value: number; pressed: boolean }[])[7].value = 0.52;
    const a = idle();
    new GamepadInput().update([p], a, () => {});
    expect(a.throttle).toBeCloseTo(0.5);
    expect(deadzone(0.15)).toBe(0);
    expect(deadzone(0.161)).toBeLessThan(0.002);
  });
  it('emits reset/camera/help once, and clears edges on disconnect', () => {
    const input = new GamepadInput(),
      events: string[] = [],
      send = (code: string) => events.push(code);
    input.update([pad(0, [3, 11, 9])], idle(), send);
    input.update([pad(0, [3, 11, 9])], idle(), send);
    expect(events).toEqual(['KeyC', 'KeyR', 'Escape']);
    input.update([null], idle(), send);
    expect(input.active).toBeUndefined();
    input.update([pad(0, [11])], idle(), send);
    expect(events.at(-1)).toBe('KeyR');
    expect(events).toHaveLength(4);
  });
  it('lets the active controller take over from an idle first slot', () => {
    const input = new GamepadInput(),
      a = idle();
    input.update([pad(0), pad(1, [7])], a, () => {});
    expect(input.active?.index).toBe(1);
    expect(a.throttle).toBe(1);
    const next = idle();
    input.update([pad(0), null], next, () => {});
    expect(next.throttle).toBe(0);
  });
});
