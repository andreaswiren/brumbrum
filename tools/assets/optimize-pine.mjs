import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mkdir } from 'node:fs/promises';
await MeshoptSimplifier.ready;
const io = new NodeIO();
await mkdir('apps/client/public/assets/models', { recursive: true });
for (const [name, ratio] of [
  ['pine', 0.06],
  ['pine-far', 0.012],
]) {
  const doc = await io.read('.asset-cache/pine/pine.gltf');
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.03, lockBorder: false }),
    dedup(),
    prune(),
  );
  console.log(
    name,
    doc
      .getRoot()
      .listMeshes()
      .map((m) => m.listPrimitives().map((p) => p.getIndices()?.getCount() / 3)),
  );
  await io.write(`apps/client/public/assets/models/${name}.glb`, doc);
}
