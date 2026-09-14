import { riverCenterZ, riverWaterAt, rivers } from './rivers';

export interface TimberBridge {
  kind: 'bridge';
  name: string;
  x: number;
  z: number;
  width: number;
  span: number;
  approach: number;
  deckHeight: number;
  baseHeight: number;
}
export interface TimberRamp {
  kind: 'ramp';
  name: string;
  x: number;
  z: number;
  width: number;
  length: number;
  height: number;
  baseHeight: number;
}
export type TimberStructure = TimberBridge | TimberRamp;

export const timberStructures: readonly TimberStructure[] = [
  {
    kind: 'bridge',
    name: 'SOUTH CREEK CROSSING',
    x: -350,
    z: riverCenterZ(rivers[0], -350),
    width: 9,
    span: 40,
    approach: 20,
    deckHeight: 11,
    baseHeight: 8.8,
  },
  {
    kind: 'bridge',
    name: 'NORTH RIVER CROSSING',
    x: 350,
    z: riverCenterZ(rivers[1], 350),
    width: 9,
    span: 48,
    approach: 20,
    deckHeight: 15,
    baseHeight: 12.8,
  },
  {
    kind: 'ramp',
    name: 'CREEKSIDE KICKER',
    x: -180,
    z: riverCenterZ(rivers[0], -180) - 32,
    width: 8,
    length: 18,
    height: 4,
    baseHeight: 8.85,
  },
  {
    kind: 'ramp',
    name: 'RIVER GAP',
    x: 150,
    z: riverCenterZ(rivers[1], 150) - 36,
    width: 8,
    length: 18,
    height: 5,
    baseHeight: 12.85,
  },
];

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function timberSurfaceRange(structure: TimberStructure): [number, number] {
  return structure.kind === 'bridge'
    ? [-structure.span / 2 - structure.approach, structure.span / 2 + structure.approach]
    : [0, structure.length];
}

/** World height of the continuous riding surface; along is local +Z metres. */
export function timberSurfaceHeight(structure: TimberStructure, along: number): number {
  if (structure.kind === 'bridge') {
    const t = (Math.abs(along) - structure.span / 2) / structure.approach;
    return structure.deckHeight + (structure.baseHeight - structure.deckHeight) * smooth(t);
  }
  const t = Math.max(0, Math.min(1, along / structure.length));
  return structure.baseHeight + structure.height * t * t;
}

export function timberBounds(structure: TimberStructure, padding = 0) {
  const [start, end] = timberSurfaceRange(structure);
  return {
    minX: structure.x - structure.width / 2 - padding,
    maxX: structure.x + structure.width / 2 + padding,
    minZ: structure.z + start - padding - (structure.kind === 'ramp' ? 12 : 0),
    maxZ: structure.z + end + padding,
  };
}

export function isTimberFootprint(x: number, z: number, padding = 0): boolean {
  return timberStructures.some((structure) => {
    const bounds = timberBounds(structure, padding);
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  });
}

/** Compose after river carving, before boundary height. Grades dry approaches
 * and trims banks beneath decks while retaining the riverbed under each bridge. */
export function timberTerrainHeight(x: number, z: number, originalHeight: number): number {
  if (riverWaterAt(x, z) !== undefined) return originalHeight;
  let height = originalHeight;
  for (const structure of timberStructures) {
    const bounds = timberBounds(structure, 2);
    const distance = Math.max(
      bounds.minX - x,
      x - bounds.maxX,
      bounds.minZ - z,
      z - bounds.maxZ,
      0,
    );
    if (distance >= 12) continue;
    const along = z - structure.z;
    const target =
      structure.kind === 'bridge'
        ? Math.abs(along) <= structure.span / 2
          ? Math.min(height, structure.deckHeight - 0.28)
          : timberSurfaceHeight(structure, along) - 0.025
        : structure.baseHeight - 0.025;
    const blend = 1 - smooth(distance / 12);
    height += (target - height) * blend;
  }
  return height;
}
