import { describe, expect, it } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import { createFourWheelVisual, vehicleVisualDimensions } from './VehicleModels';

describe('four wheel vehicle models', () => {
  for (const kind of ['atv', 'monster'] as const)
    it(`${kind} keeps wheel geometry centred on independently animated hubs`, () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const model = createFourWheelVisual(scene, kind),
          d = vehicleVisualDimensions[kind];
        expect(model.wheels).toHaveLength(4);
        expect(model.rider.scaling.asArray()).toEqual([1, 1, 1]);
        expect(model.chassis.position.asArray()).toEqual([0, 0, 0]);
        model.wheels.forEach((wheel, i) => {
          expect(wheel.position.asArray()).toEqual([
            i % 2 === 0 ? -d.trackHalf : d.trackHalf,
            -d.suspensionLength,
            i < 2 ? -d.wheelbase / 2 : d.wheelbase / 2,
          ]);
          const components = model.meshes.filter((mesh) => mesh.parent === wheel);
          expect(components.length).toBeGreaterThan(1);
          expect(components.length).toBeLessThan(6);
          for (const component of components) {
            component.refreshBoundingInfo();
            const bounds = component.getBoundingInfo().boundingBox;
            expect(Math.abs(bounds.center.y)).toBeLessThan(0.015);
            expect(Math.abs(bounds.center.z)).toBeLessThan(0.015);
            expect(bounds.extendSize.y).toBeLessThan(d.wheelRadius * 1.08);
            expect(bounds.extendSize.z).toBeLessThan(d.wheelRadius * 1.08);
          }
        });
        // Details are merged, avoiding one draw call per tread block or fastener.
        expect(model.meshes.length).toBeLessThan(110);
        expect(model.riderRig.parts.size).toBe(11);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    });
});
