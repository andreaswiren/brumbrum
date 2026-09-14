import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';
import { RiderRecovery, recoveryFootstep } from './RiderRecovery';
import { RiderRig } from './RiderRig';
import { riderAnatomy as anatomy } from './RiderAnatomy';

describe('rider crash recovery', () => {
  it('stands, runs along the ground to the vehicle, then completes a progressive lift', () => {
    const recovery = new RiderRecovery(new Vector3(80, 100, 240), 0);
    const target = new Vector3(90, 0, 247),
      phases = new Set<string>();
    let lastLift = 0;
    for (let i = 0; i < 700; i++) {
      const before = recovery.position.clone(),
        state = recovery.update(1 / 60, target);
      phases.add(state.phase);
      expect(
        Math.hypot(recovery.position.x - before.x, recovery.position.z - before.z),
      ).toBeLessThanOrEqual(2.0 / 60 + 0.00001);
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

  it('eases into walking and keeps the supporting foot stationary in world space', () => {
    const recovery = new RiderRecovery(new Vector3(0, 0, 12), 0);
    const target = new Vector3(0, 0, 60);
    while (recovery.phase === 'standing') recovery.update(1 / 60, target);
    expect(recovery.speed).toBeLessThan(0.3);
    let checked = 0;
    for (let frame = 0; frame < 240; frame++) {
      const before = recoveryFootstep(recovery.stride, 1),
        worldBefore = recovery.position.z + before.z;
      recovery.update(1 / 60, target);
      const after = recoveryFootstep(recovery.stride, 1);
      if (before.planted && after.planted && recovery.speed > 1.5) {
        expect(recovery.position.z + after.z).toBeCloseTo(worldBefore, 5);
        expect(after.lift).toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('rolls through heel strike and toe-off with continuous swing velocity', () => {
    const sample = (phase: number) => recoveryFootstep(phase * Math.PI * 2, 1);
    expect(sample(0).pitch).toBeLessThan(-0.1);
    expect(sample(0.55).pitch).toBeGreaterThan(0.3);
    expect(sample(0.78).lift).toBeGreaterThan(0.15);
    const epsilon = 0.00001;
    for (const boundary of [0.56, 1]) {
      const before = sample(boundary - epsilon),
        at = sample(boundary),
        after = sample(boundary + epsilon);
      expect(Math.abs((at.z - before.z) / epsilon - (after.z - at.z) / epsilon)).toBeLessThan(
        0.005,
      );
      expect(Math.abs(before.pitch - after.pitch)).toBeLessThan(0.001);
      expect(Math.abs(before.lift - after.lift)).toBeLessThan(0.001);
    }
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
      const kneeAngles: number[] = [];
      let relaxedArmFrames = 0;
      for (let i = 0; i < 500; i++) {
        const state = rig.updateRecovery(1 / 60, target, chassis.position);
        if (i < 24) continue; // Brief authored fallback fade into the coherent kneeling pose.
        for (const side of [-1, 1]) {
          const endpoint = (name: string, along: number) =>
            Vector3.TransformCoordinates(
              new Vector3(0, along, 0),
              rig.parts.get(name)!.mesh.computeWorldMatrix(true),
            );
          expect(
            Vector3.Distance(
              endpoint(`thigh${side}`, -anatomy.thigh / 2),
              endpoint(`shin${side}`, anatomy.shin / 2),
            ),
          ).toBeLessThan(0.002);
          expect(
            Vector3.Distance(
              endpoint(`upperArm${side}`, -anatomy.upperArm / 2),
              endpoint(`forearm${side}`, anatomy.forearm / 2),
            ),
          ).toBeLessThan(0.002);
          if (state.phase === 'running' && i > 180) {
            const hip = endpoint(`thigh${side}`, anatomy.thigh / 2),
              knee = endpoint(`shin${side}`, anatomy.shin / 2),
              ankle = endpoint(`shin${side}`, -anatomy.shin / 2);
            kneeAngles.push(
              Math.acos(
                Math.max(
                  -1,
                  Math.min(
                    1,
                    Vector3.Dot(hip.subtract(knee).normalize(), ankle.subtract(knee).normalize()),
                  ),
                ),
              ),
            );
            if (endpoint(`forearm${side}`, -anatomy.forearm / 2).y < rig.position.y + 0.12)
              relaxedArmFrames++;
          }
        }
      }
      expect(rig.recovering).toBe(true);
      expect(Math.max(...kneeAngles) - Math.min(...kneeAngles)).toBeGreaterThan(0.5);
      expect(relaxedArmFrames).toBeGreaterThan(80);
      expect(rig.root.parent).toBeNull();
      expect(Math.hypot(rig.position.x - target.x, rig.position.z - target.z)).toBeLessThan(0.2);
      rig.reset();
      expect(rig.root.parent).toBe(chassis);
      expect(rig.root.position.length()).toBe(0);
      expect(rig.recovering).toBe(false);
      expect(rig.active).toBe(false);
      expect(rig.meshes.every((mesh) => mesh.visibility === 1)).toBe(true);
      rig.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
