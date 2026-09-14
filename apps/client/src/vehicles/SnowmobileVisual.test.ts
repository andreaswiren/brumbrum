import { NullEngine, Scene } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { animateSnowmobile, createSnowmobileVisual } from './SnowmobileVisual';

describe('snowmobile visual', () => {
  it('steers skis and moves the belt without inheriting wheel spin', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const visual = createSnowmobileVisual(scene);
      const skis = scene.transformNodes.filter((node) => node.name === 'steerable front ski');
      const lug = visual.meshes.find((mesh) => mesh.name === 'deep powder track lug')!;
      const before = lug.position.clone();
      visual.wheels[0].rotation.x = 7;
      visual.wheels[1].rotation.x = 7;
      visual.wheels[1].position.y = -0.4;
      animateSnowmobile(visual, 0.1, 15, 0.75);
      expect(skis).toHaveLength(2);
      for (const ski of skis) {
        expect(ski.parent).toBe(visual.chassis);
        expect(ski.rotation.x).toBe(0);
        expect(ski.rotation.y).toBeGreaterThan(0);
        expect(ski.position.y).toBeCloseTo(-0.65);
      }
      expect(lug.position.subtract(before).length()).toBeGreaterThan(0.1);
      expect(visual.riderRig.meshes.length).toBeGreaterThan(10);
      expect(
        visual.meshes.every((mesh) =>
          mesh.getBoundingInfo().boundingBox.minimum.asArray().every(Number.isFinite),
        ),
      ).toBe(true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
