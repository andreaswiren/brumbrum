import { describe, expect, it } from 'vitest';
import { railwayPoint, railwayDistance, railwayClearing } from './railway';
import { terrainHeight } from './index';

describe('railway route', () => {
  it('closes its loop without a height step and keeps gentle longitudinal grades', () => {
    const start = railwayPoint(0),
      end = railwayPoint(Math.PI * 2);
    expect(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z)).toBeLessThan(1e-8);
    for (let i = 0; i < 360; i++) {
      const a = railwayPoint((i * Math.PI) / 180),
        b = railwayPoint(((i + 1) * Math.PI) / 180);
      expect(Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.02);
      expect(railwayDistance(a.x, a.z)).toBeLessThan(1e-8);
      expect(railwayClearing(a.x, a.z)).toBe(true);
    }
  });
  it('grades the station apron without changing the starting area', () => {
    expect(terrainHeight(0, -923)).toBeCloseTo(32);
    expect(terrainHeight(28, -930)).toBeCloseTo(32);
    expect(railwayClearing(0, 12)).toBe(false);
  });
});
