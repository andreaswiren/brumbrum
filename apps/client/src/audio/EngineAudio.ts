import { EngineVoice, type EngineKind } from './EngineVoice';
export interface RideImpact {
  kind: 'landing' | 'obstacle';
  strength: number;
  surface: string;
}
/** Recorded mechanical loop, combustion pulses and separate physical impact voices. */
export class EngineAudio {
  private context?: AudioContext;
  private oscillators: OscillatorNode[] = [];
  private master?: GainNode;
  private engineGain?: GainNode;
  private sampleGain?: GainNode;
  private sample?: AudioBufferSourceNode;
  private windGain?: GainNode;
  private exhaust?: BiquadFilterNode;
  private noise?: AudioBuffer;
  private voice = new EngineVoice();
  private requested = true;
  private crashed = false;
  private lastImpact = -10;
  get enabled(): boolean {
    return this.requested && this.context?.state === 'running';
  }
  get muted(): boolean {
    return !this.requested;
  }
  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend();
  }
  async unlock(): Promise<void> {
    if (!this.requested) return;
    this.initialize();
    await this.context!.resume();
  }
  async toggle(): Promise<void> {
    if (!this.context || this.context.state !== 'running') {
      this.requested = true;
      await this.unlock();
    } else this.requested = !this.requested;
  }
  private initialize(): void {
    if (this.context) return;
    const ctx = (this.context = new AudioContext());
    const master = (this.master = ctx.createGain());
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    master.connect(compressor).connect(ctx.destination);
    this.engineGain = ctx.createGain();
    this.exhaust = ctx.createBiquadFilter();
    this.exhaust.type = 'lowpass';
    this.exhaust.Q.value = 0.65;
    this.engineGain.connect(this.exhaust).connect(master);
    const real = new Float32Array(48),
      imag = new Float32Array(48);
    for (let i = 1; i < imag.length; i++) {
      imag[i] = (Math.exp(-i / 12) * (i % 2 ? 1 : 0.65)) / Math.sqrt(i);
      real[i] = Math.sin(i * 0.7) * imag[i] * 0.3;
    }
    const wave = ctx.createPeriodicWave(real, imag);
    for (let i = 0; i < 2; i++) {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.setPeriodicWave(wave);
      gain.gain.value = i ? 0.14 : 0.7;
      oscillator.connect(gain).connect(this.engineGain);
      oscillator.start();
      this.oscillators.push(oscillator);
    }
    this.sampleGain = ctx.createGain();
    this.sampleGain.gain.value = 0;
    this.sampleGain.connect(this.exhaust);
    void this.loadRecording(ctx);
    const buffer = (this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate));
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter();
    wind.buffer = buffer;
    wind.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(filter).connect(this.windGain).connect(master);
    wind.start();
  }
  private async loadRecording(ctx: AudioContext): Promise<void> {
    try {
      const response = await fetch('/assets/audio/engine-loop.wav');
      if (!response.ok) throw new Error(`Engine recording: ${response.status}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      let peak = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++)
        for (const value of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(value));
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) data[i] *= 0.8 / Math.max(0.01, peak);
        const fade = Math.min(128, Math.floor(data.length / 4));
        for (let i = 0; i < fade; i++) {
          data[i] *= i / fade;
          data[data.length - 1 - i] *= i / fade;
        }
      }
      this.sample = ctx.createBufferSource();
      this.sample.buffer = buffer;
      this.sample.loop = true;
      this.sample.connect(this.sampleGain!);
      this.sample.start();
    } catch (error) {
      console.warn('Engine recording unavailable; using combustion synthesis.', error);
    }
  }
  update(
    speed: number,
    throttle: number,
    grounded = true,
    crashed = false,
    dt = 1 / 60,
    kind: EngineKind = 'bike',
  ): void {
    if (!this.context || !this.master) return;
    const t = this.context.currentTime;
    const voice = this.voice.update(dt, speed, throttle, grounded, crashed, kind);
    const load = crashed ? 0 : throttle;
    const firing = voice.rpm / (kind === 'monster' ? 30 : kind === 'snowmobile' ? 60 : 120);
    this.oscillators.forEach((o, i) =>
      o.frequency.setTargetAtTime(firing * (i ? 2.01 : 1), t, 0.035),
    );
    this.master.gain.setTargetAtTime(this.enabled ? 0.7 : 0, t, 0.04);
    this.engineGain!.gain.setTargetAtTime(
      (0.19 + load * 0.24) * (voice.shift ? 0.45 : 1),
      t,
      0.025,
    );
    this.sampleGain!.gain.setTargetAtTime((0.2 + load * 0.28) * (voice.shift ? 0.55 : 1), t, 0.04);
    this.sample?.playbackRate.setTargetAtTime(
      Math.max(0.6, voice.rpm / (kind === 'monster' ? 2400 : 3400)),
      t,
      0.045,
    );
    this.exhaust!.frequency.setTargetAtTime(650 + load * 2200 + voice.rpm * 0.09, t, 0.06);
    // Quiet wind supports speed perception without masking the exhaust.
    this.windGain!.gain.setTargetAtTime(Math.min(0.028, (speed * speed) / 120000), t, 0.15);
    if (crashed && !this.crashed && this.enabled)
      this.crash(Math.max(0.4, Math.min(1, speed / 22)));
    this.crashed = crashed;
  }
  impact(event: RideImpact): void {
    if (!this.enabled || !this.context) return;
    const t = this.context.currentTime;
    if (t - this.lastImpact < 0.16 || event.strength < 2) return;
    this.lastImpact = t;
    const strength = Math.min(1, event.strength / 15);
    if (event.kind === 'landing') {
      this.tone(105, 38, 0.22, 0.25 + strength * 0.55);
      this.burst(
        event.surface === 'water' ? 1700 : 650,
        0.12 + strength * 0.15,
        0.14 + strength * 0.3,
      );
      if (strength > 0.45) this.tone(510, 130, 0.09, strength * 0.12);
    } else {
      this.tone(180, 45, 0.18, 0.3 + strength * 0.4);
      this.tone(1150, 350, 0.12, 0.12 + strength * 0.18);
      this.burst(2300, 0.15, 0.25 + strength * 0.4);
    }
  }
  private crash(strength: number): void {
    this.tone(130, 28, 0.5, strength * 0.9);
    this.burst(1800, 0.65, strength * 0.8);
    for (let i = 0; i < 4; i++)
      this.tone(620 + i * 173, 110 + i * 53, 0.18, (strength * 0.22) / (1 + i * 0.25), i * 0.11);
  }
  private tone(from: number, to: number, duration: number, volume: number, delay = 0): void {
    const ctx = this.context!,
      t = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(from, t);
    oscillator.frequency.exponentialRampToValueAtTime(to, t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(gain).connect(this.master!);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  private burst(frequency: number, duration: number, volume: number): void {
    const ctx = this.context!,
      t = ctx.currentTime;
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noise!;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(t, Math.random());
    source.stop(t + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
}
