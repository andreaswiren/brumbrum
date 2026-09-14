import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { WheelAnimation } from './WheelAnimation';
import type { BikeVisual } from './BikeVisual';
describe('visible wheel steering', () => {
  for (const kind of ['bike', 'atv', 'monster'] as const) {
    it(`${kind} steers the front wheels independently of axle spin`, () => {
      const engine = new NullEngine(),
        scene = new Scene(engine);
      const wheels = (
        kind === 'bike'
          ? [
              [0, -1],
              [0, 1],
            ]
          : [
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ]
      ).map(([x, z]) => {
        const wheel = new TransformNode('suspension', scene);
        wheel.position.set(x, -0.3, z);
        MeshBuilder.CreateBox('tyre', {}, scene).parent = wheel;
        return wheel;
      });
      const animator = new WheelAnimation({ wheels } as BikeVisual, kind, 2);
      for (let i = 0; i < 60; i++) animator.update(1 / 60, 1, 10, 0.36);
      for (const wheel of wheels) {
        if (wheel.position.z < 0) expect(wheel.rotation.y).toBe(0);
        else expect(wheel.rotation.y).toBeGreaterThan(0.25);
        expect(wheel.rotation.x).toBe(0);
        const axle = wheel.getChildren()[0] as TransformNode;
        expect(Math.abs(axle.rotation.x)).toBeGreaterThan(0.1);
        expect(wheel.position.y).toBe(-0.3);
      }
      const front = wheels.filter((w) => w.position.z > 0);
      if (front.length === 2) expect(front[1].rotation.y).toBeGreaterThan(front[0].rotation.y);
      for (let i = 0; i < 60; i++) animator.update(1 / 60, -1, 0, 0.36);
      expect(front[0].rotation.y).toBeLessThan(-0.25);
      animator.reset();
      expect(front[0].getDirection(Vector3.Forward()).x).toBeCloseTo(0);
      scene.dispose();
      engine.dispose();
    });
  }
});
