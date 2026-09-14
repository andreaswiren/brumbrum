import { describe, expect, it } from 'vitest';
import {
  collisionHeight,
  terrainHeight,
  waterAt,
  jumps,
  rivers,
  riverCenterZ,
  riverHalfWidthAt,
  riverLevelAt,
  riverTerrainHeight,
  riverWaterAt,
} from './index';

describe('continuous river basins', () => {
  it('places water above the carved channel and joins both banks at the water line', () => {
    for (const river of rivers)
      for (let x = river.startX + 100; x < river.endX - 80; x += 53) {
        const center = riverCenterZ(river, x),
          level = riverLevelAt(river, x),
          width = riverHalfWidthAt(river, x);
        expect(riverWaterAt(x, center)).toBe(level);
        expect(waterAt(x, center)).toBe(level);
        expect(riverTerrainHeight(x, center, 45)).toBeCloseTo(level - 3.8);
        expect(terrainHeight(x, center)).toBeLessThan(level - 0.8);
        expect(collisionHeight(x, center)).toBeLessThan(level - 0.5);
        for (const side of [-1, 1]) {
          const bank = center + side * width;
          expect(riverTerrainHeight(x, bank, 45)).toBeCloseTo(level, 6);
          expect(riverTerrainHeight(x, bank + side * 0.1, 45)).toBeGreaterThan(level);
          expect(riverWaterAt(x, bank + side * 0.1)).toBeUndefined();
          expect(
            Math.abs(
              riverTerrainHeight(x, bank + 0.001, 45) - riverTerrainHeight(x, bank - 0.001, 45),
            ),
          ).toBeLessThan(0.01);
        }
      }
  });
  it('tapers headwaters and outlets continuously into dry surrounding ground', () => {
    for (const river of rivers)
      for (const end of [river.startX, river.endX]) {
        expect(riverHalfWidthAt(river, end)).toBe(0);
        expect(riverWaterAt(end, riverCenterZ(river, end))).toBeUndefined();
        for (let offset = -240; offset <= 240; offset += 10) {
          const x = end + offset,
            z = riverCenterZ(river, x);
          expect(
            Math.abs(riverTerrainHeight(x - 0.001, z, 40) - riverTerrainHeight(x + 0.001, z, 40)),
          ).toBeLessThan(0.03);
        }
      }
  });
  it('leaves spawn and the three established jumps untouched', () => {
    for (const point of [{ x: 0, z: 12 }, ...jumps]) {
      expect(riverTerrainHeight(point.x, point.z, 27)).toBe(27);
      expect(riverWaterAt(point.x, point.z)).toBeUndefined();
    }
  });
  it('joins the north reservoir at its existing fourteen metre water surface', () => {
    const river = rivers[1];
    for (const x of [650, 700, 750]) expect(riverLevelAt(river, x)).toBe(14);
    for (const x of [-300, 1100]) expect(riverLevelAt(river, x)).toBe(12);
  });
});
