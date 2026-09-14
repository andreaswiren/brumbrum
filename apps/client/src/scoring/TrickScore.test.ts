import { describe, expect, it } from 'vitest';
import { TrickScore, type RideSample } from './TrickScore';
const ground: RideSample = {
  grounded: true,
  crashed: false,
  speed: 25,
  upright: 1,
  pitchRate: 0,
  yawRate: 0,
  rollRate: 0,
  resetId: 0,
  returnId: 0,
  x: 0,
  y: 0,
  z: 0,
};
function frames(score: TrickScore, changes: Partial<RideSample>, count: number) {
  for (let i = 0; i < count; i++)
    score.update(1 / 60, {
      ...ground,
      ...(changes.grounded === false ? { x: 30, y: 3, z: 40 } : {}),
      ...changes,
    });
}
describe('freeride trick scoring', () => {
  it('rejects stone bumps and low hops even if contacts flicker for a while', () => {
    const score = new TrickScore();
    frames(score, {}, 1);
    frames(score, { grounded: false, x: 3, y: 0.3, z: 2 }, 60);
    frames(score, {}, 12);
    expect(score.total).toBe(0);
    frames(score, { grounded: false, x: 30, y: 0.4, z: 40 }, 60);
    frames(score, {}, 12);
    expect(score.total).toBe(0);
    frames(score, { grounded: false, x: 30, y: 3, z: 40 }, 20);
    frames(score, {}, 12);
    expect(score.total).toBe(0);
  });
  it('measures horizontal jump distance, persists a personal best, and rejects boundary launches', () => {
    const values = new Map<string, string>(),
      storage = {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => {
          values.set(k, v);
        },
      };
    const s = new TrickScore(storage);
    frames(s, {}, 1);
    frames(s, { grounded: false, x: 30, z: 40 }, 60);
    expect(s.currentJump).toBe(50);
    frames(s, { x: 30, z: 40 }, 12);
    expect(s.longestJump).toBe(50);
    expect(s.personalBest).toBe(50);
    s.newRun();
    expect(s.longestJump).toBe(0);
    expect(new TrickScore(storage).personalBest).toBe(50);
    frames(s, {}, 1);
    frames(s, { grounded: false, x: 500, returnId: 1 }, 120);
    frames(s, { x: 500, returnId: 1 }, 12);
    expect(s.longestJump).toBe(0);
  });
  it('banks airtime, a backflip, a 360 and a clean landing once', () => {
    const s = new TrickScore();
    frames(s, {}, 1);
    frames(s, { grounded: false, pitchRate: -Math.PI * 2, yawRate: Math.PI * 2 }, 65);
    expect(s.total).toBe(0);
    expect(s.tricks).toEqual(['BACKFLIP', '360']);
    frames(s, {}, 12);
    expect(s.total).toBeGreaterThan(2100);
    const banked = s.total;
    frames(s, {}, 60);
    expect(s.total).toBe(banked);
    expect(s.message).toContain('CLEAN LANDING');
  });
  it('does not score small hops, reversed partial rotations or a crash', () => {
    const s = new TrickScore();
    frames(s, {}, 1);
    frames(s, { grounded: false }, 10);
    frames(s, {}, 12);
    expect(s.total).toBe(0);
    frames(s, { grounded: false, pitchRate: 4 }, 30);
    frames(s, { grounded: false, pitchRate: -4 }, 30);
    expect(s.tricks).toEqual([]);
    frames(s, { crashed: true }, 1);
    expect(s.total).toBe(0);
    expect(s.pending).toBe(0);
  });
  it('cancels teleports and boundary launches and has no three-minute cutoff', () => {
    const s = new TrickScore();
    frames(s, {}, 1);
    frames(s, { grounded: false }, 60);
    frames(s, { grounded: false, returnId: 1 }, 120);
    expect(s.pending).toBe(0);
    frames(s, { returnId: 1 }, 12);
    expect(s.total).toBe(0);
    frames(s, { returnId: 1 }, 60 * 181);
    expect(s.elapsed).toBeGreaterThan(180);
    s.newRun();
    expect(s.elapsed).toBe(0);
    expect(s.total).toBe(0);
  });
  it('gives landing points only when upright and carrying enough speed', () => {
    const s = new TrickScore();
    frames(s, {}, 1);
    frames(s, { grounded: false, pitchRate: Math.PI * 2 }, 65);
    frames(s, { speed: 3 }, 12);
    expect(s.message).toContain('FRONTFLIP');
    expect(s.message).not.toContain('CLEAN LANDING');
    expect(s.total).toBeLessThan(1250);
  });
});
