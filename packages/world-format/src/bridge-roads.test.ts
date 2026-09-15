import { describe, expect, it } from 'vitest';
import {
  bridgeRoads,
  bridgeRoadPoint,
  bridgeRoadClearing,
  collisionHeight,
  terrainHeight,
  trailDistance,
  waterAt,
} from './index';

describe('continuous bridge approach roads', () => {
  it('joins every deck end to an existing trail over dry, clearly marked ground', () => {
    expect(bridgeRoads).toHaveLength(4);
    for (const road of bridgeRoads) {
      expect(road.length).toBeGreaterThan(250);
      for (let i = 0; i <= 100; i++) {
        const point = bridgeRoadPoint(road, i / 100);
        expect(waterAt(point.x, point.z), road.name).toBeUndefined();
        expect(trailDistance(point.x, point.z)).toBeLessThan(0.08);
        expect(bridgeRoadClearing(point.x, point.z)).toBe(true);
      }
      const establishedTrailX =
        road.bridge.x < 0 ? -100 : 72 + Math.sin((road.end.z - 210) * 0.008) * 25;
      expect(road.end.x).toBeCloseTo(establishedTrailX, 8);
    }
  });
  it('has no terrain step or hill at the plank seams across the entire deck width', () => {
    for (const road of bridgeRoads)
      for (const side of [-4, -2, 0, 2, 4]) {
        const x = road.start.x + side;
        for (const distance of [-0.1, 0, 0.1, 1, 4, 8]) {
          const z = road.start.z + distance * road.side;
          expect(
            collisionHeight(x, z),
            `${road.name}, side${side}, distance${distance}`,
          ).toBeCloseTo(road.bridge.baseHeight - 0.025, 1);
        }
        expect(
          Math.abs(terrainHeight(x, road.start.z - 0.001) - terrainHeight(x, road.start.z + 0.001)),
        ).toBeLessThan(0.001);
      }
  });
  it('blends continuously into surrounding hills and trail junctions', () => {
    for (const road of bridgeRoads)
      for (let i = 0; i <= 100; i++) {
        const point = bridgeRoadPoint(road, i / 100);
        expect(
          Math.abs(
            terrainHeight(point.x - 0.001, point.z) - terrainHeight(point.x + 0.001, point.z),
          ),
        ).toBeLessThan(0.03);
        expect(
          Math.abs(
            terrainHeight(point.x, point.z - 0.001) - terrainHeight(point.x, point.z + 0.001),
          ),
        ).toBeLessThan(0.03);
      }
  });
});
