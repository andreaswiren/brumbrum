import { describe, expect, it } from 'vitest';
import { NullEngine, PBRMaterial, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { createRockVisual } from './RockVisual';

describe('embedded granite rocks', () => {
  it('buries the rotated lower footprint on a steep cross slope', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const height = (x: number, z: number) => x * 0.8 - z * 0.35 + Math.sin(z * 0.4);
      for (let seed = 0; seed < 12; seed++) {
        const rock = createRockVisual(
          scene,
          { x: 35, z: -12, seed, scale: new Vector3(8, 5, 7), yaw: seed * 0.7 },
          height,
        );
        expect(rock.scaling.asArray()).toEqual([1, 1, 1]);
        expect(rock.metadata.embeddedFootprint.length).toBeGreaterThan(10);
        for (const sample of rock.metadata.embeddedFootprint) {
          expect(rock.position.y + sample.y).toBeLessThanOrEqual(
            height(rock.position.x + sample.x, rock.position.z + sample.z) -
              rock.metadata.burial +
              0.00001,
          );
        }
        expect((rock.material as PBRMaterial).roughness).toBeGreaterThan(0.9);
        const color = (rock.material as PBRMaterial).albedoColor;
        expect(
          Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b),
        ).toBeLessThan(0.06);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it('reproduces faceted geometry by seed and varies distinct rocks', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const make = (seed: number) =>
        createRockVisual(scene, { x: 0, z: 0, seed, scale: new Vector3(3, 2, 4) }, () => 0);
      const one = make(7),
        same = make(7),
        other = make(8);
      expect(one.getVerticesData(VertexBuffer.PositionKind)).toEqual(
        same.getVerticesData(VertexBuffer.PositionKind),
      );
      expect(one.getVerticesData(VertexBuffer.PositionKind)).not.toEqual(
        other.getVerticesData(VertexBuffer.PositionKind),
      );
      expect(one.getTotalIndices()).toBeLessThan(1000);
      expect(one.getBoundingInfo().boundingBox.maximum.y + one.position.y).toBeGreaterThan(0.5);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
