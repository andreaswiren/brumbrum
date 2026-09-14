export interface InputActions {
  throttle: number;
  brake: number;
  steer: number;
  pitch: number;
  preload: boolean;
  rearBrake: boolean;
}
export class InputManager {
  readonly actions: InputActions = {
    throttle: 0,
    brake: 0,
    steer: 0,
    pitch: 0,
    preload: false,
    rearBrake: false,
  };
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private padButtons = new Set<number>();
  constructor() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).matches('select, input, button')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pressed.clear();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });
  }
  consume(code: string): boolean {
    const active = this.pressed.has(code);
    this.pressed.delete(code);
    return active;
  }
  update(): InputActions {
    const down = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    const a = this.actions;
    a.throttle = down('KeyW', 'ArrowUp');
    a.brake = down('KeyS', 'ArrowDown');
    a.steer = down('KeyD', 'ArrowRight') - down('KeyA', 'ArrowLeft');
    a.pitch = down('KeyK') - down('KeyI');
    a.preload = !!down('Space');
    a.rearBrake = !!down('ShiftLeft', 'ShiftRight');
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const deadzone = (n: number) => (Math.abs(n) > 0.12 ? n : 0);
      a.throttle = Math.max(a.throttle, pad.buttons[7]?.value ?? 0);
      a.brake = Math.max(a.brake, pad.buttons[6]?.value ?? 0);
      a.steer = a.steer || deadzone(pad.axes[0] ?? 0);
      a.pitch = a.pitch || deadzone(pad.axes[3] ?? 0);
      a.preload ||= pad.buttons[0]?.pressed;
      a.rearBrake ||= pad.buttons[4]?.pressed;
      for (const [button, code] of [
        [3, 'KeyC'],
        [11, 'KeyR'],
      ] as const) {
        if (pad.buttons[button]?.pressed && !this.padButtons.has(button)) this.pressed.add(code);
        if (pad.buttons[button]?.pressed) this.padButtons.add(button);
        else this.padButtons.delete(button);
      }
    }
    return a;
  }
}
