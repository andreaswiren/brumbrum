import { GamepadInput } from './GamepadInput';
export interface InputActions {
  throttle: number;
  brake: number;
  steer: number;
  pitch: number;
  roll: number;
  preload: boolean;
  rearBrake: boolean;
  cameraX?: number;
  cameraY?: number;
}
export class InputManager {
  readonly actions: InputActions = {
    throttle: 0,
    brake: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    preload: false,
    rearBrake: false,
  };
  private keys = new Set<string>();
  private pressed = new Set<string>();
  readonly gamepad = new GamepadInput();
  gamepadError = '';
  constructor() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).matches('select, input')) return;
      if ((e.target as HTMLElement).matches('button') && ['Space', 'Enter'].includes(e.code))
        return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pressed.clear();
      this.gamepad.clear();
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
    a.throttle = down('KeyW');
    a.brake = down('KeyS');
    a.steer = down('KeyD') - down('KeyA');
    a.pitch = down('ArrowDown') - down('ArrowUp');
    a.roll = down('ArrowRight') - down('ArrowLeft');
    a.preload = !!down('Space');
    a.rearBrake = !!down('ShiftLeft', 'ShiftRight');
    a.cameraX = 0;
    a.cameraY = 0;
    try {
      this.gamepad.update(Array.from(navigator.getGamepads?.() ?? []), a, (code) =>
        this.pressed.add(code),
      );
      this.gamepadError = '';
    } catch {
      this.gamepad.clear();
      this.gamepadError = 'Gamepad access blocked by browser';
    }
    return a;
  }
}
