import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const root = 'apps/client/public/assets';
async function download(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  console.log(path);
}
const manifest = [];
for (const id of ['forrest_ground_01', 'forrest_sand_01', 'knotted_pine_bark']) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const channel of ['diff', 'nor_gl', 'rough']) {
    const key = Object.keys(files).find(
      (k) =>
        k.toLowerCase() === channel ||
        (channel === 'diff' && k.toLowerCase() === 'diffuse') ||
        k.endsWith(`_${channel}`),
    );
    const item = files[key]?.['1k']?.jpg ?? files[key]?.['1k']?.png;
    if (!item) throw new Error(`Missing ${id}/${channel}: ${Object.keys(files)}`);
    const target = `${root}/textures/${id}_${channel}.${item.url.endsWith('.png') ? 'png' : 'jpg'}`;
    await download(item.url, target);
    manifest.push({
      id,
      channel,
      url: item.url,
      source: `https://polyhaven.com/a/${id}`,
      license: 'CC0',
      file: target,
    });
  }
}
const id = 'pine_sapling_small';
const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
const model = files.gltf['1k'].gltf;
await download(model.url, '.asset-cache/pine/pine.gltf');
for (const [path, item] of Object.entries(model.include))
  await download(item.url, `.asset-cache/pine/${path}`);
manifest.push({
  id,
  source: `https://polyhaven.com/a/${id}`,
  license: 'CC0',
  url: model.url,
  modifications: 'Simplified mesh, embedded textures, GLB runtime LODs',
});
const skyId = 'kloofendal_48d_partly_cloudy_puresky';
const skyUrl = `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${skyId}_1k.hdr`;
await download(skyUrl, `${root}/sky/partly-cloudy.hdr`);
manifest.push({
  id: skyId,
  url: skyUrl,
  source: `https://polyhaven.com/a/${skyId}`,
  license: 'CC0',
  file: `${root}/sky/partly-cloudy.hdr`,
});
await mkdir('assets', { recursive: true });
await download(
  'https://opengameart.org/sites/default/files/loop_0.wav',
  `${root}/audio/engine-loop.wav`,
);
await writeFile('assets/sources.json', JSON.stringify(manifest, null, 2));
