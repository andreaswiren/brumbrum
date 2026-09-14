import { expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core';
import { ChaseCamera } from './ChaseCamera';
import type { Motorcycle } from '../vehicles/Motorcycle';
it('keeps the chase view behind the flight direction throughout a frontflip', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    chassis = MeshBuilder.CreateBox('bike', {}, scene);
  chassis.position.set(0, 50, 0);
  chassis.rotationQuaternion = Quaternion.Identity();
  const state = {
    position: chassis.position,
    visual: { chassis },
    grounded: true,
    crashed: false,
    kind: 'bike',
    speed: 20,
    get yaw() {
      const f = chassis.getDirection(Vector3.Forward());
      return Math.atan2(f.x, f.z);
    },
  };
  const camera = new ChaseCamera(scene, state as Motorcycle);
  camera.update(1);
  state.grounded = false;
  for (let i = 0; i < 120; i++) {
    chassis.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, (i / 120) * Math.PI * 2, 0);
    chassis.computeWorldMatrix(true);
    camera.update(1 / 60);
    expect(camera.camera.position.z).toBeLessThan(-3);
  }
  scene.dispose();
  engine.dispose();
});
