import { describe, expect, it } from 'vitest';
import { NullEngine, PBRMaterial, Scene, VertexBuffer } from '@babylonjs/core';
import { createBikeVisual } from './BikeVisual';

describe('rounded motocross visual', () => {
  it('preserves collision and wheel dimensions while batching the detailed silhouette', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const model = createBikeVisual(scene);
      expect(model.chassis.isVisible).toBe(false);
      expect(model.chassis.getBoundingInfo().boundingBox.extendSize.asArray()).toEqual([
        0.19, 0.18, 0.575,
      ]);
      expect(model.wheels.map((w) => w.position.asArray())).toEqual([
        [0, -0.22, -0.825],
        [0, -0.22, 0.825],
      ]);
      const body = model.meshes.filter((m) => m.parent === model.chassis && m.isVisible);
      expect(body.length).toBeLessThan(14);
      expect(body.every((m) => m.material instanceof PBRMaterial)).toBe(true);
      const saddle = body.find((m) => m.name === 'contoured narrow gripper saddle')!;
      const saddlePositions = saddle.getVerticesData(VertexBuffer.PositionKind)!;
      const saddleNormals = saddle.getVerticesData(VertexBuffer.NormalKind)!;
      // Babylon uses left-handed winding; the curved saddle must face outward.
      for (let i = 0; i < saddlePositions.length; i += 3) {
        if (saddlePositions[i] > 0.09) expect(saddleNormals[i]).toBeGreaterThan(0);
      }
      expect(model.meshes.length).toBeLessThan(150);
      for (const wheel of model.wheels) {
        const parts = model.meshes.filter((m) => m.parent === wheel);
        expect(parts.length).toBeLessThan(5);
        for (const mesh of parts) {
          const bounds = mesh.getBoundingInfo().boundingBox;
          expect(Math.abs(bounds.center.y)).toBeLessThan(0.01);
          expect(Math.abs(bounds.center.z)).toBeLessThan(0.01);
          expect(bounds.extendSize.y).toBeLessThan(0.365);
          expect(bounds.extendSize.z).toBeLessThan(0.365);
        }
      }
      for (const mesh of model.meshes) {
        expect(
          Array.from(mesh.getVerticesData(VertexBuffer.PositionKind) ?? []).every(Number.isFinite),
        ).toBe(true);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
