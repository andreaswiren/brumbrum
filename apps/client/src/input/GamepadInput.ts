import { gamepadConfig as config } from '@brumbrum/configuration';
import type { InputActions } from './InputManager';
export interface PadSnapshot {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: readonly { value: number; pressed: boolean }[];
}
export function deadzone(value: number, threshold = config.deadzone): number {
  if (!Number.isFinite(value) || Math.abs(value) <= threshold) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - threshold) / (1 - threshold));
}
export class GamepadInput {
  active: PadSnapshot | undefined;
  private previous = new Set<number>();
  private identity = '';
  update(
    pads: readonly (PadSnapshot | null)[],
    actions: InputActions,
    press: (code: string) => void,
  ): void {
    const available = pads.filter((pad): pad is PadSnapshot => !!pad?.connected);
    const standard = available.filter((p) => p.mapping === 'standard');
    // Flight sticks expose resting axes as full-scale values. Never interpret an
    // unmapped joystick as an Xbox pad: it can otherwise command an endless flip.
    const connected = standard;
    // Browser slots are sparse and may remain empty after disconnect. Prefer the
    // controller the player is using, then retain it while its sticks are neutral.
    const hasInput = (p: PadSnapshot) =>
      p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.25);
    this.active =
      connected.find((p) => hasInput(p) && p.index === this.active?.index) ??
      connected.find(hasInput) ??
      connected.find((p) => p.index === this.active?.index) ??
      connected[0];
    const pad = this.active,
      identity = pad ? `${pad.index}:${pad.id}` : '';
    if (identity !== this.identity) {
      this.previous.clear();
      this.identity = identity;
    }
    if (!pad) return;
    const value = (index: number) => {
      const n = pad.buttons[index]?.value ?? 0;
      return Number.isFinite(n)
        ? Math.max(0, Math.min(1, (n - config.triggerDeadzone) / (1 - config.triggerDeadzone)))
        : 0;
    };
    const held = (index: number) => !!pad.buttons[index]?.pressed;
    actions.throttle = Math.max(actions.throttle, value(config.buttons.throttle));
    actions.brake = Math.max(actions.brake, value(config.buttons.brake));
    actions.steer = actions.steer || deadzone(pad.axes[config.axes.steer] ?? 0);
    actions.pitch = actions.pitch || deadzone(pad.axes[config.axes.weight] ?? 0);
    actions.roll = actions.roll || Number(held(15)) - Number(held(14));
    actions.cameraX = deadzone(pad.axes[config.axes.cameraX] ?? 0);
    actions.cameraY = deadzone(pad.axes[config.axes.cameraY] ?? 0);
    actions.preload ||= held(config.buttons.preload);
    actions.rearBrake ||= held(config.buttons.rearBrake);
    for (const [button, code] of [
      [config.buttons.camera, 'KeyC'],
      [config.buttons.reset, 'KeyR'],
      [config.buttons.help, 'Escape'],
    ] as const) {
      if (held(button) && !this.previous.has(button)) press(code);
      if (held(button)) this.previous.add(button);
      else this.previous.delete(button);
    }
  }
  clear(): void {
    this.active = undefined;
    this.identity = '';
    this.previous.clear();
  }
}
