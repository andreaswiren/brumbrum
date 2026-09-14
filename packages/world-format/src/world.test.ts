import { describe, expect, it } from 'vitest';
import {
  sectorAt,
  localPosition,
  terrainHeight,
  jumps,
  lakes,
  collisionHeight,
  surfaceAt,
  definition,
  riverWaterAt,
} from './index';
import { bike, surfaces, world } from '@brumbrum/configuration';
describe('world coordinates and content', () => {
  it('joins water edges to banks and uses matching near/far terrain grids', () => {
    expect(world.farResolution).toBe(world.nearResolution);
    for (const lake of lakes)
      for (let i = 0; i < 32; i++) {
        const angle = (i * Math.PI) / 16;
        const x = lake.x + Math.cos(angle) * lake.rx,
          z = lake.z + Math.sin(angle) * lake.rz;
        // A river outlet deliberately opens the reservoir's former bank.
        if (riverWaterAt(x, z) === undefined)
          expect(terrainHeight(x, z)).toBeCloseTo(lake.level, 4);
        else expect(terrainHeight(x, z)).toBeLessThan(lake.level);
        const outerX = lake.x + Math.cos(angle) * lake.rx * 1.04,
          outerZ = lake.z + Math.sin(angle) * lake.rz * 1.04;
        if (riverWaterAt(outerX, outerZ) === undefined)
          expect(terrainHeight(outerX, outerZ)).toBeGreaterThan(lake.level);
        expect(Number.isFinite(collisionHeight(x, z))).toBe(true);
      }
  });
  it('indexes negative boundaries without truncation errors', () => {
    expect(sectorAt(-0.1, -256)).toEqual({ x: -1, z: -1 });
    expect(sectorAt(256, -256.01)).toEqual({ x: 1, z: -2 });
    expect(localPosition(-1, 257)).toEqual({ x: 255, z: 1 });
  });
  it('reconstructs world coordinates from sector and local offsets', () => {
    for (const x of [-3072, -256.1, -1, 0, 255.9, 768]) {
      const s = sectorAt(x, x),
        local = localPosition(x, x);
      expect(s.x * world.sectorSize + local.x).toBeCloseTo(x);
      expect(local.x).toBeGreaterThanOrEqual(0);
      expect(local.x).toBeLessThan(256);
    }
  });
  it('uses one continuous height function at sector boundaries', () => {
    for (let boundary = -768; boundary <= 768; boundary += 256)
      expect(
        Math.abs(terrainHeight(boundary - 0.001, 38) - terrainHeight(boundary + 0.001, 38)),
      ).toBeLessThan(0.01);
  });
  it('provides rising jump approaches with descending backsides', () => {
    for (const j of jumps) {
      expect(terrainHeight(j.x, j.z)).toBeGreaterThan(terrainHeight(j.x, j.z - j.length));
      expect(terrainHeight(j.x, j.z)).toBeGreaterThan(terrainHeight(j.x, j.z + j.length * 0.3));
    }
  });
  it('round-trips the versioned world format', () => {
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });
  it('has valid tunable grip and spring support', () => {
    for (const s of Object.values(surfaces)) {
      expect(s.grip).toBeGreaterThan(0);
      expect(s.grip).toBeLessThanOrEqual(1);
      expect(s.resistance).toBeGreaterThan(0);
    }
    expect(surfaceAt(0, 12)).toBe('dirt');
    expect(surfaceAt(150, 12)).toBe('grass');
    expect(2 * bike.spring * bike.suspensionLength).toBeGreaterThan(bike.mass * 9.81);
  });
});
