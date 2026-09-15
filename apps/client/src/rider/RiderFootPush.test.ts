import { describe, expect, it } from 'vitest';
import { RiderFootPush } from './RiderFootPush';

describe('foot-powered rollback', () => {
  it('pushes forward on the ground and lifts the boot on the backward return', () => {
    const motion = new RiderFootPush();
    for (let i = 0; i < 120; i++) motion.update(1, 1, true, 1 / 60);
    let previous = motion.update(1, 1, true, 1 / 60);
    let pushes = 0,
      returns = 0;
    for (let i = 0; i < 120; i++) {
      const current = motion.update(1, 1, true, 1 / 60);
      if (current.planted && previous.planted) {
        expect(current.z).toBeGreaterThan(previous.z);
        expect(current.lift).toBe(0);
        pushes++;
      } else if (!current.planted && !previous.planted) {
        expect(current.z).toBeLessThan(previous.z);
        expect(current.lift).toBeGreaterThan(0);
        returns++;
      }
      previous = current;
    }
    expect(pushes).toBeGreaterThan(50);
    expect(returns).toBeGreaterThan(20);
  });

  it('withdraws the pushing foot in the air and clears the cycle on reset', () => {
    const motion = new RiderFootPush();
    motion.update(1, 1, true, 1);
    expect(motion.update(1, 1, false, 1).blend).toBeLessThan(0.001);
    motion.reset();
    expect(motion.update(0, 0, true, 0).blend).toBe(0);
    expect(motion.update(1, 12, true, 1).blend).toBe(0);
  });
});
