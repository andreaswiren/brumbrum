import { describe, expect, it } from 'vitest';
import { snowAmount, snowRegion, snowSpawn, snowTrailDistance } from './snow';

describe('snow region', () => {
  it('blends continuously into the forest and keeps the circuit in deep snow', () => {
    expect(snowAmount(0, 0)).toBe(0);
    expect(snowAmount(snowRegion.x, snowRegion.z)).toBe(1);
    expect(snowAmount(snowRegion.x + snowRegion.radius, snowRegion.z)).toBe(0);
    expect(snowAmount(snowRegion.x + snowRegion.radius - 80, snowRegion.z)).toBeCloseTo(0.5);
    expect(snowTrailDistance(snowSpawn.x, snowSpawn.z)).toBeLessThan(0.001);
    for (let i = 0; i < 36; i++) {
      const angle = (i / 36) * Math.PI * 2;
      const radius = 380 + 35 * Math.sin(angle * 3) + 24 * Math.sin(angle * 5);
      const x = snowRegion.x + Math.sin(angle) * radius,
        z = snowRegion.z + Math.cos(angle) * radius;
      expect(snowTrailDistance(x, z)).toBeLessThan(0.001);
      expect(snowAmount(x, z)).toBe(1);
    }
  });
});
