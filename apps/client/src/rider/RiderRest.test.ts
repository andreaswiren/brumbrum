import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { MeshBuilder, NullEngine, Quaternion, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { collisionHeight } from '@brumbrum/world-format';
import { riderAnatomy as anatomy } from './RiderAnatomy';
import { ridingContacts } from './RiderMotion';
import { RiderRig } from './RiderRig';
import { DriverCharacter } from './DriverCharacter';

describe('seated and stationary human rider', () => {
  it('keeps the deformed human pelvis in contact with the saddle', async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const chassis = MeshBuilder.CreateBox('bike', {}, scene),
        rig = new RiderRig(scene, chassis);
      const bytes = new Uint8Array(
        await readFile(new URL('../../public/assets/models/human-rider.glb', import.meta.url)),
      );
      const character = await DriverCharacter.load(scene, rig.root, rig.parts, bytes, true);
      rig.pose(0, 10, 0, 0, 0, 1);
      character.update();
      const mesh = character.meshes.find((candidate) => candidate.skeleton)!;
      mesh.skeleton!.prepare(true);
      const positions = mesh.getPositionData(true)!;
      const contact: Vector3[] = [];
      for (let i = 0; i < positions.length; i += 3) {
        const point = Vector3.TransformCoordinates(
          Vector3.FromArray(positions, i),
          mesh.computeWorldMatrix(true),
        );
        if (Math.abs(point.x) < 0.105 && point.z > -0.45 && point.z < -0.22 && point.y > 0.3)
          contact.push(point);
      }
      const minimum = Math.min(...contact.map((point) => point.y));
      expect(minimum).toBeLessThan(0.5);
      expect(minimum).toBeGreaterThan(0.46);
      expect(contact.length).toBeGreaterThan(10);
      character.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it('plants the left foot on terrain while idling and withdraws it smoothly to the peg', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const chassis = MeshBuilder.CreateBox('resting bike', {}, scene);
      chassis.position.set(0, collisionHeight(0, 12) + 0.49, 12);
      chassis.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), 0.22);
      const rig = new RiderRig(scene, chassis);
      for (let frame = 0; frame < 180; frame++) rig.pose(0, 0, 0, 0, 0.12, 1 / 60);
      const shin = rig.parts.get('shin-1')!;
      const endpoint = () =>
        Vector3.TransformCoordinates(
          new Vector3(0, -anatomy.shin / 2, 0),
          shin.mesh.computeWorldMatrix(true),
        );
      const ankle = endpoint(),
        pitch = shin.mesh.metadata.footPlantPitch;
      const toeSoleHeight =
        ankle.y - anatomy.ankleToSole * Math.cos(pitch) - anatomy.ankleToToe * Math.sin(pitch);
      expect(toeSoleHeight).toBeCloseTo(collisionHeight(ankle.x, ankle.z), 2);
      expect(rig.resting).toBeGreaterThan(0.99);
      expect(rig.parts.get('pelvis')!.mesh.position.y).toBeGreaterThan(0.5);
      let previous = ankle;
      for (let frame = 0; frame < 40; frame++) {
        rig.pose(0, 3, 1, 0, 0.04, 1 / 60);
        const next = endpoint();
        expect(Vector3.Distance(previous, next)).toBeLessThan(0.1);
        previous = next;
      }
      expect(rig.resting).toBeLessThan(0.001);
      const grip = Vector3.TransformCoordinates(
        ridingContacts('bike', -1).foot,
        rig.root.computeWorldMatrix(true),
      );
      expect(Vector3.Distance(endpoint(), grip)).toBeLessThan(0.002);
      for (let frame = 0; frame < 90; frame++) rig.pose(0, 0, 0, 0, 0.1, 1 / 60);
      const headBefore = rig.parts.get('head')!.mesh.rotationQuaternion!.clone();
      for (let frame = 0; frame < 50; frame++) rig.pose(0, 0, 0, 0, 0.1, 1 / 60);
      expect(
        Quaternion.AreClose(headBefore, rig.parts.get('head')!.mesh.rotationQuaternion!, 0.00001),
      ).toBe(false);
      for (let frame = 0; frame < 30; frame++) rig.pose(0, 0, 0, 0, 0, 1 / 60, 0, 0, false);
      expect(rig.resting).toBeLessThan(0.002);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it('places the actual tilted boot toe against terrain without stretching the foot mesh', async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const chassis = MeshBuilder.CreateBox('resting bike', {}, scene);
      chassis.position.set(0, collisionHeight(0, 12) + 0.49, 12);
      chassis.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), 0.22);
      const rig = new RiderRig(scene, chassis);
      const bytes = new Uint8Array(
        await readFile(new URL('../../public/assets/models/human-rider.glb', import.meta.url)),
      );
      const character = await DriverCharacter.load(scene, rig.root, rig.parts, bytes, true);
      for (let frame = 0; frame < 180; frame++) rig.pose(0, 0, 0, 0, 0.12, 1 / 60);
      character.update();
      const mesh = character.meshes.find((candidate) => candidate.skeleton)!;
      mesh.skeleton!.prepare(true);
      const positions = mesh.getPositionData(true)!,
        weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!,
        indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
      const soles: Vector3[] = [];
      for (let index = 0; index < positions.length / 3; index++) {
        const isFoot = [0, 1, 2, 3].some(
          (slot) =>
            weights[index * 4 + slot] > 0.8 &&
            ['foot_r', 'ball_r'].includes(mesh.skeleton!.bones[indices[index * 4 + slot]].name),
        );
        if (isFoot)
          soles.push(
            Vector3.TransformCoordinates(
              Vector3.FromArray(positions, index * 3),
              mesh.computeWorldMatrix(true),
            ),
          );
      }
      const minimumClearance = Math.min(
        ...soles.map((point) => point.y - collisionHeight(point.x, point.z)),
      );
      expect(minimumClearance).toBeGreaterThan(-0.015);
      expect(minimumClearance).toBeLessThan(0.025);
      const shin = rig.parts.get('shin-1')!;
      const ankle = Vector3.TransformCoordinates(
        new Vector3(0, -anatomy.shin / 2, 0),
        shin.mesh.computeWorldMatrix(true),
      );
      expect(Math.max(...soles.map((point) => Vector3.Distance(point, ankle)))).toBeLessThan(0.31);
      character.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
