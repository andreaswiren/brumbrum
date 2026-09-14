import { describe, expect, it } from 'vitest';
import { EngineVoice } from './EngineVoice';
describe('engine gearbox', () => {
  it('shifts under acceleration without oscillating around a threshold', () => {
    const voice = new EngineVoice();
    let changes = 0,
      previous = 1;
    for (let i = 0; i < 1200; i++) {
      const state = voice.update(1 / 60, Math.min(50, i / 12), 1, true, false, 'bike');
      if (state.gear !== previous) changes++;
      previous = state.gear;
      expect(state.rpm).toBeLessThanOrEqual(10500);
    }
    expect(changes).toBeGreaterThan(2);
    expect(changes).toBeLessThan(7);
  });
  it('free revs in air and returns to idle after a crash at any frame rate', () => {
    const run = (fps: number) => {
      const voice = new EngineVoice();
      for (let i = 0; i < fps; i++) voice.update(1 / fps, 20, 1, false, false, 'bike');
      expect(voice.rpm).toBeGreaterThan(10000);
      for (let i = 0; i < fps; i++) voice.update(1 / fps, 20, 1, false, true, 'bike');
      expect(voice.rpm).toBeLessThan(1200);
      return voice.rpm;
    };
    expect(run(30)).toBeCloseTo(run(120), 4);
  });
});
