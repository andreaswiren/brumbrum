import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { MeshBuilder, NullEngine, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { RiderRig } from './RiderRig';
import { riderAnatomy as anatomy } from './RiderAnatomy';
import { DriverCharacter } from './DriverCharacter';

describe('articulated mesh rider', () => {
  let engine: NullEngine | undefined, scene: Scene | undefined;
  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
  });
  function create() {
    engine = new NullEngine();
    scene = new Scene(engine);
    const chassis = MeshBuilder.CreateBox('chassis', {}, scene);
    return new RiderRig(scene, chassis);
  }
  it('loads a real skinned character and keeps deformed geometry around its rider', async () => {
    const rider = create();
    const bytes = new Uint8Array(
      await readFile(new URL('../../public/assets/models/human-rider.glb', import.meta.url)),
    );
    const character = await DriverCharacter.load(scene!, rider.root, rider.parts, bytes, true);
    expect(character.meshes.filter((mesh) => mesh.skeleton).length).toBe(1);
    expect(character.meshes[0].skeleton!.bones.map((bone) => bone.name)).toContain('index_03_l');
    const min = new Vector3(Infinity, Infinity, Infinity),
      max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of character.meshes.filter((mesh) => mesh.isVisible)) {
      mesh.skeleton?.prepare(true);
      const positions = mesh.getPositionData(true)!;
      for (let i = 0; i < positions.length; i += 3) {
        const vertex = Vector3.TransformCoordinates(
          Vector3.FromArray(positions, i),
          mesh.computeWorldMatrix(true),
        );
        min.minimizeInPlace(vertex);
        max.maximizeInPlace(vertex);
      }
    }
    expect(min.y).toBeGreaterThan(-0.5);
    expect(max.y).toBeLessThan(2);
    expect(max.x - min.x).toBeLessThan(1.8);
    expect(max.z - min.z).toBeLessThan(2.5);
    // Detached physical limbs live in world space while the character's skin
    // remains under the vehicle. Verify that retargeting does not double-transform.
    const offset = new Vector3(30, 12, -20);
    for (const part of rider.parts.values()) {
      part.mesh.setParent(null);
      part.mesh.position.addInPlace(offset);
    }
    character.update();
    for (const mesh of character.meshes.filter((mesh) => mesh.isVisible)) {
      mesh.skeleton?.prepare(true);
      const positions = mesh.getPositionData(true)!;
      for (let i = 0; i < positions.length; i += 3) {
        const vertex = Vector3.TransformCoordinates(
          Vector3.FromArray(positions, i),
          mesh.computeWorldMatrix(true),
        );
        expect(vertex.x).toBeGreaterThan(offset.x - 2);
        expect(vertex.x).toBeLessThan(offset.x + 2);
        expect(vertex.y).toBeGreaterThan(offset.y - 0.5);
        expect(vertex.y).toBeLessThan(offset.y + 2);
      }
    }
    const observersBeforeDispose = [...scene!.onBeforeRenderObservable.observers];
    character.dispose();
    expect(character.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(scene!.skeletons.length).toBe(0);
    expect(
      observersBeforeDispose.some(
        (observer) => !scene!.onBeforeRenderObservable.observers.includes(observer),
      ),
    ).toBe(true);
  });
  it('cleans up a character whose vehicle is removed while its model is loading', async () => {
    const rider = create();
    const bytes = new Uint8Array(
      await readFile(new URL('../../public/assets/models/human-rider.glb', import.meta.url)),
    );
    const pending = DriverCharacter.load(scene!, rider.root, rider.parts, bytes, true);
    rider.dispose();
    const character = await pending;
    expect(character.meshes.every((mesh) => mesh.isDisposed())).toBe(true);
    expect(scene!.skeletons.length).toBe(0);
  });
  it('keeps anatomical leg coverage and compact feet through steering and preload', async () => {
    const rider = create();
    const bytes = new Uint8Array(
      await readFile(new URL('../../public/assets/models/human-rider.glb', import.meta.url)),
    );
    const character = await DriverCharacter.load(scene!, rider.root, rider.parts, bytes, true);
    const mesh = character.meshes.find((candidate) => candidate.skeleton)!;
    const joints = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
    const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
    const vertices = () => {
      mesh.skeleton!.prepare(true);
      const data = mesh.getPositionData(true)!;
      return Array.from({ length: data.length / 3 }, (_, index) =>
        Vector3.TransformCoordinates(
          Vector3.FromArray(data, index * 3),
          mesh.computeWorldMatrix(true),
        ),
      );
    };
    for (const steer of [-1, 0, 1])
      for (const preload of [0, 1]) {
        rider.pose(steer, 20, 1, 0, 0.16, 1, preload, 1 - preload);
        character.update();
        const body = vertices();
        for (const [suffix, side] of [
          ['l', 1],
          ['r', -1],
        ] as const) {
          const garment = body.filter((_, index) => {
            for (let slot = 0; slot < 4; slot++) {
              const bone = mesh.skeleton!.bones[joints[index * 4 + slot]]?.name ?? '';
              if (
                weights[index * 4 + slot] > 0.4 &&
                new RegExp(`^(thigh|calf|foot|ball)_${suffix}$`).test(bone)
              )
                return true;
            }
            return false;
          });
          const thigh = rider.parts.get(`thigh${side}`)!;
          const shin = rider.parts.get(`shin${side}`)!;
          const endpoint = (part: typeof thigh, along: number) =>
            Vector3.TransformCoordinates(
              new Vector3(0, along, 0),
              part.mesh.computeWorldMatrix(true),
            );
          const hip = endpoint(thigh, thigh.height / 2),
            knee = endpoint(shin, shin.height / 2),
            foot = endpoint(shin, -shin.height / 2);
          const footVertices = body.filter((_, index) => {
            for (let slot = 0; slot < 4; slot++) {
              const name = mesh.skeleton!.bones[joints[index * 4 + slot]]?.name ?? '';
              if (
                weights[index * 4 + slot] > 0.8 &&
                (name === `foot_${suffix}` || name === `ball_${suffix}`)
              )
                return true;
            }
            return false;
          });
          expect(footVertices.length).toBeGreaterThan(10);
          expect(
            Math.max(...footVertices.map((vertex) => Vector3.Distance(vertex, foot))),
          ).toBeLessThan(0.31);
          for (const [a, b] of [
            [hip, knee],
            [knee, foot],
          ])
            for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
              const centre = Vector3.Lerp(a, b, fraction);
              // No bare/stretch-only middle: garment vertices cover the full limb length.
              expect(
                Math.min(...garment.map((point) => Vector3.Distance(point, centre))),
              ).toBeLessThan(0.18);
            }
        }
      }
    character.dispose();
  });
  it('compresses and leans forward on preload while hands and feet remain attached', () => {
    const rider = create();
    rider.pose(0, 12, 0, 0, 0, 1);
    const before = rider.parts.get('head')!.mesh.position.clone();
    const endpoint = (name: string, along: number) =>
      Vector3.TransformCoordinates(
        new Vector3(0, along, 0),
        rider.parts.get(name)!.mesh.computeWorldMatrix(true),
      );
    const hand = endpoint('forearm1', -anatomy.forearm / 2),
      foot = endpoint('shin1', -anatomy.shin / 2);
    rider.pose(0, 12, 0, 0, 0, 1, 1, 0);
    const after = rider.parts.get('head')!.mesh.position;
    expect(after.y).toBeLessThan(before.y - 0.07);
    expect(after.z).toBeGreaterThan(before.z + 0.04);
    expect(Vector3.Distance(endpoint('forearm1', -anatomy.forearm / 2), hand)).toBeLessThan(0.002);
    expect(Vector3.Distance(endpoint('shin1', -anatomy.shin / 2), foot)).toBeLessThan(0.002);
  });
  it('moves hips back on wheelie input and clears posing state after reset', () => {
    const rider = create();
    const neutral = rider.parts.get('pelvis')!.mesh.position.clone();
    rider.pose(0, 12, 1, 0, 0, 1, 0, 1);
    expect(rider.parts.get('pelvis')!.mesh.position.z).toBeLessThan(neutral.z - 0.12);
    rider.reset();
    expect(Vector3.Distance(rider.parts.get('pelvis')!.mesh.position, neutral)).toBeLessThan(0.001);
  });
});
