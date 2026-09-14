export class EngineAudio {
  private context?: AudioContext;
  private oscillators: OscillatorNode[] = [];
  private gain?: GainNode;
  enabled = false;
  async toggle(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      this.gain.connect(filter).connect(this.context.destination);
      for (const type of ['sawtooth', 'triangle'] as OscillatorType[]) {
        const o = this.context.createOscillator();
        o.type = type;
        o.connect(this.gain);
        o.start();
        this.oscillators.push(o);
      }
    }
    await this.context.resume();
    this.enabled = !this.enabled;
  }
  update(speed: number, throttle: number): void {
    if (!this.context || !this.gain) return;
    const t = this.context.currentTime,
      rpm = 45 + (speed % 9) * 8 + throttle * 22;
    this.oscillators.forEach((o, i) =>
      o.frequency.setTargetAtTime(rpm * (i + 1) + i * 0.8, t, 0.12),
    );
    this.gain.gain.setTargetAtTime(this.enabled ? 0.018 + throttle * 0.025 : 0, t, 0.1);
  }
}
