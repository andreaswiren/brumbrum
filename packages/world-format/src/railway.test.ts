import { describe, expect, it } from 'vitest';
import { railwayPoint, railwayDistance, railwayClearing } from './railway';
import { collisionHeight, lakes, riverWaterAt, terrainHeight, waterAt } from './index';

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
  it('keeps the full rendered rail corridor above the actual collision triangles', () => {
    for (let i = 0; i < 1024; i++) {
      const a = railwayPoint((i * Math.PI * 2) / 1024),
        b = railwayPoint(((i + 1) * Math.PI * 2) / 1024);
      const length = Math.hypot(b.x - a.x, b.z - a.z),
        rightX = (b.z - a.z) / length,
        rightZ = -(b.x - a.x) / length;
      for (const t of [0, 0.5, 1])
        for (const side of [-2, -0.85, 0, 0.85, 2]) {
          const x = a.x + (b.x - a.x) * t + rightX * side,
            z = a.z + (b.z - a.z) * t + rightZ * side;
          const bed = a.y + (b.y - a.y) * t;
          expect(
            collisionHeight(x, z),
            `buried track segment ${i}, offset ${side}, position ${x},${z}`,
          ).toBeLessThanOrEqual(bed + 0.02);
        }
    }
  });
  it('leaves lake edges at water level and keeps water open below trestles', () => {
    for (const lake of lakes)
      for (let i = 0; i < 128; i++) {
        const angle = (i * Math.PI * 2) / 128,
          x = lake.x + Math.cos(angle) * lake.rx,
          z = lake.z + Math.sin(angle) * lake.rz;
        if (riverWaterAt(x, z) === undefined)
          expect(terrainHeight(x, z)).toBeCloseTo(lake.level, 5);
        else expect(terrainHeight(x, z)).toBeLessThan(lake.level);
      }
    let waterCrossings = 0;
    for (let i = 0; i < 1024; i++) {
      const p = railwayPoint((i * Math.PI * 2) / 1024),
        water = waterAt(p.x, p.z);
      if (water === undefined) continue;
      waterCrossings++;
      expect(terrainHeight(p.x, p.z)).toBeLessThan(water);
    }
    expect(waterCrossings).toBeGreaterThan(10);
  });
});
