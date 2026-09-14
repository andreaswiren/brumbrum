import { world, type Surface } from '@brumbrum/configuration';
import { snowAmount, snowTrailDistance } from './snow';
import { rivers, riverTerrainHeight, riverWaterAt } from './rivers';
import { railwayTerrainHeight } from './railway';
import { timberTerrainHeight } from './timber';
export * from './snow';
export * from './rivers';
export * from './railway';
export * from './timber';
export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}
export interface SectorAddress {
  x: number;
  z: number;
}
export interface WorldDefinition {
  version: 1;
  seed: number;
  sectorSize: number;
  spawns: WorldPosition[];
  jumps: Jump[];
  lakes: typeof lakes;
  rivers: typeof rivers;
  boundary: typeof boundary;
}
export interface Jump {
  x: number;
  z: number;
  height: number;
  width: number;
  length: number;
  name: string;
}
export const jumps: Jump[] = [
  { x: 0, z: 90, height: 7, width: 17, length: 25, name: 'FIRST FLIGHT' },
  { x: 72, z: 210, height: 12, width: 24, length: 34, name: 'THE RIDGELINE' },
  { x: -100, z: 310, height: 17, width: 28, length: 40, name: 'BIG SKY' },
];
export const lakes = [
  { name: 'Mirror Lake', x: -245, z: 180, rx: 95, rz: 135, level: 3 },
  { name: 'Highland Reservoir', x: 650, z: 540, rx: 170, rz: 110, level: 14 },
  { name: 'Twin Pines Lake', x: -820, z: -630, rx: 130, rz: 160, level: 7 },
];
export const boundary = {
  extent: 3000,
  rampWidth: 220,
  height: 210,
  triggerMargin: 35,
  launchUp: 125,
  launchInward: 115,
  cooldown: 8,
} as const;
export function waterAt(x: number, z: number): number | undefined {
  return (
    lakes.find((l) => ((x - l.x) / l.rx) ** 2 + ((z - l.z) / l.rz) ** 2 < 1)?.level ??
    riverWaterAt(x, z)
  );
}
export function boundaryHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const t = Math.min(
    1,
    Math.max(0, (edge - (boundary.extent - boundary.rampWidth)) / boundary.rampWidth),
  );
  // Smooth inside approach; a short outer shelf gives the lip a clear takeoff.
  return boundary.height * t * t * Math.max(0, Math.min(1, (boundary.extent + 25 - edge) / 25));
}
export const definition: WorldDefinition = {
  version: 1,
  seed: world.seed,
  sectorSize: world.sectorSize,
  spawns: [{ x: 0, y: 0, z: 12 }],
  jumps,
  lakes,
  rivers,
  boundary,
};
export function sectorAt(x: number, z: number): SectorAddress {
  return { x: Math.floor(x / world.sectorSize), z: Math.floor(z / world.sectorSize) };
}
export function sectorKey(address: SectorAddress): string {
  return `${address.x},${address.z}`;
}
export function localPosition(x: number, z: number): { x: number; z: number } {
  const s = sectorAt(x, z);
  return { x: x - s.x * world.sectorSize, z: z - s.z * world.sectorSize };
}
export function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + world.seed) * 43758.5453;
  return n - Math.floor(n);
}
export function trailCenter(z: number): number {
  return Math.sin(z * 0.012) * 36 * Math.min(1, Math.max(0, (z - 110) / 100));
}
export function trailDistance(x: number, z: number): number {
  return Math.min(
    Math.abs(x - trailCenter(z)),
    Math.abs(x - 72 - Math.sin((z - 210) * 0.008) * 25),
    Math.abs(x + 100),
    z > -60 && z < 100 ? Math.abs(x + 245) : Infinity,
    x > 2600 && x < boundary.extent + 10 ? Math.abs(z) : Infinity,
    snowAmount(x, z) > 0.1 ? snowTrailDistance(x, z) : Infinity,
  );
}
export function terrainHeight(x: number, z: number): number {
  const clearing = 1 - Math.exp(-(x * x) / 8000);
  let h = Math.sin(z * 0.015) * 2.3 + Math.sin(z * 0.043) * 0.55;
  h += clearing * (12 + 12 * Math.sin(x * 0.012 + z * 0.008) + 6 * Math.cos(z * 0.018 - x * 0.011));
  h += Math.sin(x * 0.075) * Math.cos(z * 0.065) * 0.35;
  const outsideSpawn = Math.min(1, Math.max(0, (Math.hypot(x, z - 50) - 150) / 180));
  h +=
    outsideSpawn *
    (24 + 22 * Math.sin(x * 0.01) * Math.cos(z * 0.012) + 14 * Math.sin(z * 0.025 + x * 0.009));
  // Repeating, broad natural ridges create launch faces throughout the square.
  h += outsideSpawn * 19 * Math.max(0, Math.sin(z * 0.038 + Math.sin(x * 0.013))) ** 3;
  for (const jump of jumps) {
    const along = (z - jump.z) / jump.length;
    const across = Math.max(0, 1 - ((x - jump.x) / jump.width) ** 4);
    // A long progressive approach and a short backside create a real takeoff lip.
    if (along > -1 && along < 0.3)
      h += across * jump.height * (along < 0 ? (along + 1) ** 1.7 : Math.max(0, 1 - along / 0.3));
  }
  let lakeDistance = Infinity;
  for (const lake of lakes) {
    const r = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    lakeDistance = Math.min(lakeDistance, r);
    // The water edge intersects a continuous bank, rather than ending above a
    // basin floor. A broad outside blend joins the bank to the surrounding hills.
    if (r <= 1) h = lake.level - 8 * (1 - r * r);
    else if (r < 1.45) {
      const t = (r - 1) / 0.45,
        blend = t * t * (3 - 2 * t);
      const bank = lake.level + (r - 1) * 24;
      h = bank * (1 - blend) + Math.max(h, lake.level + 1) * blend;
    }
  }
  const riverHeight = riverTerrainHeight(x, z, h);
  // River outflows may lower a reservoir bank, but must never build a dam
  // across its existing water or lift its shore above the lake surface.
  const nearLake = lakeDistance < 1.45;
  h = nearLake ? Math.min(h, riverHeight) : riverHeight;
  h = timberTerrainHeight(x, z, h);
  const railBlend = Math.max(0, Math.min(1, (lakeDistance - 1.45) / 0.25));
  const railHeight = nearLake ? h : railwayTerrainHeight(x, z, h);
  return h + (railHeight - h) * railBlend * railBlend * (3 - 2 * railBlend) + boundaryHeight(x, z);
}
/** Exact interpolation of the near terrain triangles, including negative sectors. */
export function collisionHeight(x: number, z: number): number {
  const spacing = world.sectorSize / world.nearResolution;
  const gx = Math.floor(x / spacing),
    gz = Math.floor(z / spacing),
    u = x / spacing - gx,
    v = z / spacing - gz;
  const x0 = gx * spacing,
    z0 = gz * spacing;
  const a = terrainHeight(x0, z0),
    b = terrainHeight(x0 + spacing, z0),
    c = terrainHeight(x0, z0 + spacing),
    d = terrainHeight(x0 + spacing, z0 + spacing);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function surfaceAt(x: number, z: number): Surface {
  if (snowAmount(x, z) > 0.45) return 'snow';
  return trailDistance(x, z) < 8 ? 'dirt' : 'grass';
}
