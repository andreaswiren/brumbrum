import { world, type Surface } from '@brumbrum/configuration';
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
export const definition: WorldDefinition = {
  version: 1,
  seed: world.seed,
  sectorSize: world.sectorSize,
  spawns: [{ x: 0, y: 0, z: 12 }],
  jumps,
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
  );
}
export function terrainHeight(x: number, z: number): number {
  const clearing = 1 - Math.exp(-(x * x) / 8000);
  let h = Math.sin(z * 0.015) * 2.3 + Math.sin(z * 0.043) * 0.55;
  h += clearing * (12 + 12 * Math.sin(x * 0.012 + z * 0.008) + 6 * Math.cos(z * 0.018 - x * 0.011));
  h += Math.sin(x * 0.075) * Math.cos(z * 0.065) * 0.35;
  for (const jump of jumps) {
    const along = (z - jump.z) / jump.length;
    const across = Math.max(0, 1 - ((x - jump.x) / jump.width) ** 4);
    // A long progressive approach and a short backside create a real takeoff lip.
    if (along > -1 && along < 0.3)
      h += across * jump.height * (along < 0 ? (along + 1) ** 1.7 : Math.max(0, 1 - along / 0.3));
  }
  return h;
}
export function surfaceAt(x: number, z: number): Surface {
  return trailDistance(x, z) < 8 ? 'dirt' : 'grass';
}
