export type EngineKind = 'bike' | 'atv' | 'monster' | 'snowmobile';

/** Hysteretic shifting prevents gear chatter near a speed threshold. */
export class EngineVoice {
  rpm = 1700;
  gear = 1;
  shift = 0;
  update(
    dt: number,
    speed: number,
    throttle: number,
    grounded: boolean,
    crashed: boolean,
    kind: EngineKind,
  ) {
    const ratios = [3.1, 2.15, 1.6, 1.25, 1.02, 0.85];
    const wheelRpm = (Math.abs(speed) * 60) / (2 * Math.PI * 0.36);
    const driveRpm = wheelRpm * ratios[this.gear - 1] * 7;
    const redline = kind === 'monster' ? 5700 : kind === 'atv' ? 8000 : 10500;
    this.shift = Math.max(0, this.shift - dt);
    if (grounded && this.shift === 0 && !crashed) {
      if (driveRpm > redline * 0.91 && this.gear < 6) {
        this.gear++;
        this.shift = 0.18;
      } else if (driveRpm < redline * 0.37 && this.gear > 1) {
        this.gear--;
        this.shift = 0.16;
      }
    }
    const target = crashed
      ? 1150
      : grounded
        ? Math.max(1600 + throttle * 1000, wheelRpm * ratios[this.gear - 1] * 7)
        : 1800 + throttle * (redline - 2000);
    this.rpm += (Math.min(redline, target) - this.rpm) * (1 - Math.exp(-dt * 9));
    return { rpm: this.rpm, shift: this.shift > 0, gear: this.gear };
  }
}
