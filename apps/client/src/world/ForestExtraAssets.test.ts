import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Matrix, NullEngine, Scene, VertexBuffer } from '@babylonjs/core';
import { ForestExtraAssets, forestVariants } from './ForestExtraAssets';

describe('grounded vegetation variants', () => {
  let engine: NullEngine, scene: Scene, assets: ForestExtraAssets;
  beforeAll(async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    assets = await ForestExtraAssets.load(
      scene,
      async (file) =>
        new Uint8Array(
          await readFile(new URL(`../../public/assets/models/${file}`, import.meta.url)),
        ),
      true,
    );
  });
  afterAll(() => {
    assets?.dispose();
    scene?.dispose();
    engine?.dispose();
  });

  it('anchors every source at ground level with the shared ten metre scale', () => {
    for (const variant of forestVariants)
      for (const near of [true, false]) {
        const meshes = assets.trees(
          variant,
          Array.from(Matrix.Identity().m),
          near,
          'grounding test',
        );
        let low = Infinity,
          high = -Infinity;
        for (const mesh of meshes) {
          const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
          for (let index = 1; index < positions.length; index += 3) {
            low = Math.min(low, positions[index]);
            high = Math.max(high, positions[index]);
          }
        }
        expect(low).toBeCloseTo(0, 4);
        expect(high).toBeCloseTo(10, 4);
        meshes.forEach((mesh) => mesh.dispose());
      }
  });

  it('uses cheaper distant pines and independent per-sector instance geometry', () => {
    const matrices = Array.from(Matrix.Translation(100, 37, -60).m);
    const first = assets.trees('pine-full', matrices, true, 'first');
    const second = assets.trees('pine-full', matrices, true, 'second');
    const distant = assets.trees('pine-full', matrices, false, 'far');
    expect(first.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0)).toBeGreaterThan(
      distant.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0) * 3,
    );
    expect(first[0].geometry).not.toBe(second[0].geometry);
    expect(first[0].thinInstanceGetWorldMatrices()[0].getTranslation().y).toBe(37);
    [...first, ...second, ...distant].forEach((mesh) => mesh.dispose());
  });
});
