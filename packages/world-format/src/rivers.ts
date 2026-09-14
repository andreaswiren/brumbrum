export interface RiverDefinition {
  name: string;
  startX: number;
  endX: number;
  centerZ: number;
  bend: number;
  wavelength: number;
  halfWidth: number;
  level: number;
}

export const rivers: RiverDefinition[] = [
  {
    name: 'South Creek',
    startX: -1100,
    endX: 1100,
    centerZ: -300,
    bend: 45,
    wavelength: 150,
    halfWidth: 12,
    level: 8,
  },
  {
    name: 'North River',
    startX: -900,
    endX: 1250,
    centerZ: 650,
    bend: 60,
    wavelength: 220,
    halfWidth: 16,
    level: 12,
  },
];

export function riverCenterZ(river: RiverDefinition, x: number): number {
  return river.centerZ + river.bend * Math.sin(x / river.wavelength);
}

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** A short, level outflow joins Highland Reservoir without stacked water sheets. */
export function riverLevelAt(river: RiverDefinition, x: number): number {
  return (
    river.level +
    (river.name === 'North River' ? 2 * smooth((x - 430) / 120) * smooth((970 - x) / 120) : 0)
  );
}

function terminalDistance(river: RiverDefinition, x: number): number {
  return Math.max(0, (80 - Math.min(x - river.startX, river.endX - x)) / 80);
}

/** Rounded, tapered ends share the exact footprint used by the water and banks. */
export function riverHalfWidthAt(river: RiverDefinition, x: number): number {
  const end = terminalDistance(river, x);
  return river.halfWidth * Math.sqrt(Math.max(0, 1 - end * end));
}

export function riverWaterAt(x: number, z: number): number | undefined {
  for (const river of rivers) {
    if (Math.abs(z - riverCenterZ(river, x)) < riverHalfWidthAt(river, x))
      return riverLevelAt(river, x);
  }
  return undefined;
}

export function riverTerrainHeight(x: number, z: number, currentHeight: number): number {
  let height = currentHeight;
  for (const river of rivers) {
    const q = Math.hypot(
      (z - riverCenterZ(river, x)) / river.halfWidth,
      terminalDistance(river, x),
    );
    const outer = 1 + 32 / river.halfWidth;
    if (q >= outer) continue;
    const level = riverLevelAt(river, x);
    const bed = level + 3.8 * (q * q - 1);
    if (q <= 1) height = bed;
    else {
      const blend = smooth((q - 1) / (outer - 1));
      height = bed * (1 - blend) + height * blend;
    }
  }
  return height;
}
