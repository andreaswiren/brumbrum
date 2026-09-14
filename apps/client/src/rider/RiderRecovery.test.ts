import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';
import { RiderRecovery } from './RiderRecovery';
import { RiderRig } from './RiderRig';

describe('rider crash recovery', () => {
  it('stands, runs along the ground to the vehicle, then completes a progressive lift', () => {
    const recovery = new RiderRecovery(new Vector3(80, 100, 240), 0);
    const target = new Vector3(90, 0, 247),
      phases = new Set<string>();
    let lastLift = 0;
    for (let i = 0; i < 500; i++) {
      const before = recovery.position.clone(),
        state = recovery.update(1 / 60, target);
      phases.add(state.phase);
      expect(
        Math.hypot(recovery.position.x - before.x, recovery.position.z - before.z),
      ).toBeLessThanOrEqual(4.2 / 60 + 0.00001);
      expect(recovery.position.y).toBeCloseTo(
        collisionHeight(recovery.position.x, recovery.position.z),
        5,
      );
      expect(state.lift).toBeGreaterThanOrEqual(lastLift);
      lastLift = state.lift;
    }
    expect([...phases]).toEqual(['standing', 'running', 'lifting', 'done']);
    expect(lastLift).toBe(1);
    expect(Math.hypot(recovery.position.x - target.x, recovery.position.z - target.z)).toBeLessThan(
      0.13,
    );
  });

  it('releases the ragdoll without a position jump and remounts only when reset', async () => {
    const require = createRequire(import.meta.url);
    const wasmBinary = await readFile(
      require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'),
    );
    const havok = await HavokPhysics({ wasmBinary: new Uint8Array(wasmBinary).buffer });
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
      const chassis = MeshBuilder.CreateBox('crashed bike', {}, scene);
      chassis.position.set(25, collisionHeight(25, 12) + 0.4, 12);
      const rig = new RiderRig(scene, chassis);
      expect(rig.beginRecovery()).toBe(false);
      rig.eject(new Vector3(12, 0, 0), Vector3.Zero());
      expect(rig.beginRecovery()).toBe(false);
      for (const part of rig.parts.values()) part.aggregate!.body.setLinearVelocity(Vector3.Zero());
      const before = [...rig.parts.values()].map((part) => part.mesh.getAbsolutePosition().clone());
      expect(rig.beginRecovery()).toBe(true);
      expect(rig.root.parent).toBeNull();
      expect(rig.constraints).toHaveLength(0);
      [...rig.parts.values()].forEach((part, index) => {
        part.mesh.computeWorldMatrix(true);
        expect(part.aggregate).toBeUndefined();
        expect(Vector3.Distance(part.mesh.getAbsolutePosition(), before[index])).toBeLessThan(
          0.001,
        );
      });
      const target = chassis.position.add(new Vector3(2, 0, 6));
      for (let i = 0; i < 400; i++) rig.updateRecovery(1 / 60, target, chassis.position);
      expect(rig.recovering).toBe(true);
      expect(rig.root.parent).toBeNull();
      expect(Math.hypot(rig.position.x - target.x, rig.position.z - target.z)).toBeLessThan(0.2);
      rig.reset();
      expect(rig.root.parent).toBe(chassis);
      expect(rig.root.position.length()).toBe(0);
      expect(rig.recovering).toBe(false);
      expect(rig.active).toBe(false);
      rig.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
