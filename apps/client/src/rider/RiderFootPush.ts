const smooth = (t: number) => t * t * (3 - 2 * t);

/** A planted forward sweep moves the motorcycle backward; the return stroke clears the ground. */
export class RiderFootPush {
  blend = 0;
  private phase = 0;

  reset(): void {
    this.blend = this.phase = 0;
  }

  update(input: number, speed: number, grounded: boolean, dt: number) {
    const amount = grounded && Math.abs(speed) < 3 ? Math.max(0, Math.min(1, input)) : 0;
    const step = Math.max(0, dt);
    this.blend += (amount - this.blend) * (1 - Math.exp(-10 * step));
    if (this.blend < 0.001) this.phase = 0;
    else this.phase = (this.phase + step * (0.8 + Math.min(1.2, Math.abs(speed)) * 0.45)) % 1;
    const planted = this.phase < 0.64;
    const progress = planted ? this.phase / 0.64 : (this.phase - 0.64) / 0.36;
    return {
      blend: this.blend,
      z: (planted ? -0.14 + progress * 0.28 : 0.14 - smooth(progress) * 0.28) * this.blend,
      lift: (planted ? 0 : Math.sin(progress * Math.PI) * 0.11) * this.blend,
      pitch: 0.8 - (planted ? Math.sin(progress * Math.PI) * 0.13 : 0.24) * this.blend,
      planted,
    };
  }
}
