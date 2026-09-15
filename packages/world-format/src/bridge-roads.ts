import { timberStructures, type TimberBridge } from './timber';

export interface BridgeRoad {
  name: string;
  bridge: TimberBridge;
  side: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  length: number;
}
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export const bridgeRoads: BridgeRoad[] = timberStructures
  .filter((s): s is TimberBridge => s.kind === 'bridge')
  .flatMap((bridge) =>
    [-1, 1].map((side) => {
      const endZ = bridge.z + side * (bridge.x < 0 ? 180 : 190);
      return {
        name: `${bridge.name} ${side < 0 ? 'south' : 'north'} approach`,
        bridge,
        side,
        start: { x: bridge.x, z: bridge.z + side * (bridge.span / 2 + bridge.approach) },
        end: { x: bridge.x < 0 ? -100 : 72 + Math.sin((endZ - 210) * 0.008) * 25, z: endZ },
        length: 0,
      };
    }),
  );

/** Curved road starts and merges parallel to the bridge and established trails. */
export function bridgeRoadPoint(road: BridgeRoad, t: number): { x: number; z: number } {
  const u = 1 - t,
    p1 = { x: road.start.x, z: road.start.z + road.side * 90 },
    p2 = { x: road.end.x, z: road.end.z - road.side * 60 };
  return {
    x:
      u * u * u * road.start.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * road.end.x,
    z:
      u * u * u * road.start.z +
      3 * u * u * t * p1.z +
      3 * u * t * t * p2.z +
      t * t * t * road.end.z,
  };
}
interface Segment {
  road: BridgeRoad;
  ax: number;
  az: number;
  dx: number;
  dz: number;
  length: number;
  along: number;
}
const cells = new Map<string, Segment[]>();
for (const road of bridgeRoads)
  for (let i = 0; i < 64; i++) {
    const a = bridgeRoadPoint(road, i / 64),
      b = bridgeRoadPoint(road, (i + 1) / 64),
      length = Math.hypot(b.x - a.x, b.z - a.z);
    const segment = {
      road,
      ax: a.x,
      az: a.z,
      dx: b.x - a.x,
      dz: b.z - a.z,
      length,
      along: road.length,
    };
    road.length += length;
    for (
      let x = Math.floor((Math.min(a.x, b.x) - 38) / 64);
      x <= Math.floor((Math.max(a.x, b.x) + 38) / 64);
      x++
    )
      for (
        let z = Math.floor((Math.min(a.z, b.z) - 38) / 64);
        z <= Math.floor((Math.max(a.z, b.z) + 38) / 64);
        z++
      ) {
        const key = `${x},${z}`,
          cell = cells.get(key) ?? [];
        cell.push(segment);
        cells.set(key, cell);
      }
  }
export function bridgeRoadSample(
  x: number,
  z: number,
): { road: BridgeRoad; distance: number; along: number } | undefined {
  let closest: ReturnType<typeof bridgeRoadSample>;
  for (const segment of cells.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`) ?? []) {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - segment.ax) * segment.dx + (z - segment.az) * segment.dz) /
          (segment.length * segment.length),
      ),
    );
    const distance = Math.hypot(x - segment.ax - segment.dx * t, z - segment.az - segment.dz * t);
    if (!closest || distance < closest.distance)
      closest = { road: segment.road, distance, along: segment.along + segment.length * t };
  }
  return closest;
}
export function bridgeRoadDistance(x: number, z: number): number {
  return bridgeRoadSample(x, z)?.distance ?? Infinity;
}
export function bridgeRoadClearing(x: number, z: number, padding = 0): boolean {
  return bridgeRoadDistance(x, z) < 9 + padding;
}

type HeightSampler = (x: number, z: number) => number;
const endHeights = new WeakMap<HeightSampler, Map<BridgeRoad, number>>();
/** Broad graded shoulders and a gradual merge prevent hills blocking the deck exits. */
export function bridgeRoadTerrainHeight(
  x: number,
  z: number,
  height: number,
  sampleBase: HeightSampler,
): number {
  const sample = bridgeRoadSample(x, z);
  if (!sample || sample.distance >= 38) return height;
  const { road, distance, along } = sample;
  // The first metres remain level so every collision-grid vertex at the timber
  // seam lies on the same surface as the final plank.
  const t = Math.max(0, (along - 12) / (road.length - 12));
  let endpoints = endHeights.get(sampleBase);
  if (!endpoints) {
    endpoints = new Map();
    endHeights.set(sampleBase, endpoints);
  }
  let end = endpoints.get(road);
  if (end === undefined) {
    end = sampleBase(road.end.x, road.end.z);
    endpoints.set(road, end);
  }
  const target =
    road.bridge.baseHeight - 0.025 + (end - road.bridge.baseHeight + 0.025) * smooth(t);
  const influence = (1 - smooth((distance - 10) / 28)) * smooth((road.length - along) / 55);
  return height + (target - height) * influence;
}
