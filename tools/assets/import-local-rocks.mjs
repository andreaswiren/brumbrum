import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld } from '@gltf-transform/functions';
import { mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const collection =
  process.argv[2] ?? 'C:/Users/Andreas/OneDrive/Dev/assets/The Complete KayKit Collection v6.1';
const source = path.join(collection, 'KayKit Forest Nature Pack 1.0/Assets/gltf/Color1');
const output = 'apps/client/public/assets/models';
const choices = [
  'Rock_1_B_Color1',
  'Rock_1_D_Color1',
  'Rock_1_G_Color1',
  'Rock_1_K_Color1',
  'Rock_2_C_Color1',
  'Rock_3_B_Color1',
];
const io = new NodeIO();
await mkdir(output, { recursive: true });
const entries = [];
for (let i = 0; i < choices.length; i++) {
  const doc = await io.read(path.join(source, `${choices[i]}.gltf`));
  for (const material of doc.getRoot().listMaterials()) {
    material.setMetallicFactor(0).setRoughnessFactor(0.94);
  }
  await doc.transform(weld(), dedup(), prune());
  const file = `kaykit-rock-${i + 1}.glb`;
  await io.write(path.join(output, file), doc);
  const triangles = doc
    .getRoot()
    .listMeshes()
    .reduce(
      (total, mesh) =>
        total +
        mesh
          .listPrimitives()
          .reduce((count, primitive) => count + (primitive.getIndices()?.getCount() ?? 0) / 3, 0),
      0,
    );
  entries.push({
    file,
    source: choices[i],
    triangles,
    bytes: (await stat(path.join(output, file))).size,
  });
}
await mkdir('assets/licenses', { recursive: true });
await copyFile(path.join(collection, 'License.txt'), 'assets/licenses/KayKit-CC0.txt');
await writeFile(
  'assets/kaykit-rocks.json',
  JSON.stringify(
    {
      author: 'Kay Lousberg',
      pack: 'KayKit Forest Nature Pack 1.0',
      license: 'CC0',
      licenseFile: 'licenses/KayKit-CC0.txt',
      sourceFolder: source,
      conversions:
        'Original local glTF meshes repackaged as self-contained GLB; PBR roughness adjusted for stone.',
      entries,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(entries, null, 2));
