import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const io = new NodeIO();
const output = 'apps/client/public/assets/models';
for (const [id, sourceNode] of [
  ['pine-full', 'pine_sapling_small_a'],
  ['pine-young', 'pine_sapling_small_c'],
]) {
  for (const lod of ['', '-far']) {
    const doc = await io.read(`${output}/pine${lod}.glb`);
    for (const node of doc.getRoot().listNodes()) if (node.getName() !== sourceNode) node.dispose();
    await doc.transform(prune());
    for (const texture of doc.getRoot().listTextures()) {
      texture
        .setImage(
          await sharp(texture.getImage())
            .resize(512, 512, { fit: 'inside' })
            .jpeg({ quality: 76 })
            .toBuffer(),
        )
        .setMimeType('image/jpeg');
    }
    await io.write(`${output}/${id}${lod}.glb`, doc);
    console.log(
      id + lod,
      doc
        .getRoot()
        .listMeshes()
        .flatMap((mesh) =>
          mesh.listPrimitives().map((primitive) => primitive.getIndices().getCount() / 3),
        ),
    );
  }
}

const source =
  'C:/Users/Andreas/OneDrive/Dev/assets/The Complete KayKit Collection v6.1/KayKit Forest Nature Pack 1.0/Assets/gltf/Color1/Tree_Bare_2_B_Color1.gltf';
const doc = await io.read(source);
const bark = doc
  .createTexture('photographic pine bark')
  .setImage(
    await sharp(await readFile('apps/client/public/assets/textures/knotted_pine_bark_diff.jpg'))
      .resize(512, 512)
      .jpeg({ quality: 78 })
      .toBuffer(),
  )
  .setMimeType('image/jpeg');
const normal = doc
  .createTexture('pine bark normal')
  .setImage(
    await sharp(await readFile('apps/client/public/assets/textures/knotted_pine_bark_nor_gl.jpg'))
      .resize(512, 512)
      .jpeg({ quality: 80 })
      .toBuffer(),
  )
  .setMimeType('image/jpeg');
const material = doc
  .createMaterial('weathered bark')
  .setBaseColorTexture(bark)
  .setNormalTexture(normal)
  .setRoughnessFactor(0.95)
  .setMetallicFactor(0)
  .setDoubleSided(true);
for (const mesh of doc.getRoot().listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    const uv = new Float32Array(positions.getCount() * 2),
      vertex = [];
    for (let index = 0; index < positions.getCount(); index++) {
      positions.getElement(index, vertex);
      uv[index * 2] = Math.atan2(vertex[0], vertex[2]) / Math.PI;
      uv[index * 2 + 1] = vertex[1] * 0.65;
    }
    primitive.setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(positions.getBuffer()),
    );
    primitive.setMaterial(material);
  }
await doc.transform(prune());
await io.write(`${output}/forest-snag.glb`, doc);
console.log(
  'forest-snag',
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) =>
      mesh.listPrimitives().map((primitive) => primitive.getIndices().getCount() / 3),
    ),
);
