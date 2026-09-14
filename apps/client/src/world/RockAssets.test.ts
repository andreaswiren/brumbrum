import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { Mesh, NullEngine, Scene, Vector3, VertexData } from '@babylonjs/core';
import { placeAssetRock } from './RockAssets';

describe('local stone asset library', () => {
  it('ships six compact self-contained authored rock variants', async () => {
    const io = new NodeIO();
    for (let i = 1; i <= 6; i++) {
      const document = await io.read(`apps/client/public/assets/models/kaykit-rock-${i}.glb`);
      const primitives = document
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives());
      const triangles = primitives.reduce(
        (count, primitive) => count + primitive.getIndices()!.getCount() / 3,
        0,
      );
      expect(triangles).toBeGreaterThan(30);
      expect(triangles).toBeLessThan(600);
      expect(document.getRoot().listTextures().length).toBeGreaterThan(0);
      for (const texture of document.getRoot().listTextures())
        expect(texture.getImage()!.byteLength).toBeGreaterThan(0);
      for (const material of document.getRoot().listMaterials())
        expect(material.getRoughnessFactor()).toBeGreaterThan(0.9);
    }
  });
  it('buries the authored model footprint on sloping terrain', async () => {
    const document = await new NodeIO().read('apps/client/public/assets/models/kaykit-rock-4.glb');
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    const engine = new NullEngine(),
      scene = new Scene(engine);
    try {
      const mesh = new Mesh('imported rock test hull', scene),
        data = new VertexData();
      data.positions = Array.from(primitive.getAttribute('POSITION')!.getArray()!);
      data.indices = Array.from(primitive.getIndices()!.getArray()!);
      data.applyToMesh(mesh);
      const placement = { x: 30, z: -15, seed: 4, scale: new Vector3(1, 1, 1) };
      const terrain = (x: number, z: number) => x * 0.7 - z * 0.4;
      placeAssetRock(mesh, placement, 1.4, terrain);
      expect(mesh.metadata.embeddedFootprint.length).toBeGreaterThan(0);
      for (const point of mesh.metadata.embeddedFootprint)
        expect(mesh.position.y + point.y).toBeLessThanOrEqual(
          terrain(mesh.position.x + point.x, mesh.position.z + point.z) -
            mesh.metadata.burial +
            0.0001,
        );
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
