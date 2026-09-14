import { expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Quaternion, Scene } from '@babylonjs/core';
import { VehicleInterpolation } from './VehicleInterpolation';
import type { Motorcycle } from './Motorcycle';
it('interpolates display poses and restores the exact simulation transform', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    chassis = MeshBuilder.CreateBox('body', {}, scene);
  chassis.rotationQuaternion = Quaternion.Identity();
  const vehicle = {
    position: chassis.position,
    visual: { chassis },
    resetId: 0,
    crashed: false,
    rutDepth: 0.065,
  } as Motorcycle;
  const interpolation = new VehicleInterpolation();
  interpolation.capture(vehicle);
  chassis.position.x = 4;
  interpolation.render(vehicle, 0.25);
  expect(chassis.position.x).toBe(1);
  expect(chassis.position.y).toBeCloseTo(-0.065);
  interpolation.restore();
  expect(chassis.position.x).toBe(4);
  expect(chassis.position.y).toBe(0);
  vehicle.resetId++;
  interpolation.render(vehicle, 0.5);
  expect(chassis.position.x).toBe(4);
  scene.dispose();
  engine.dispose();
});
