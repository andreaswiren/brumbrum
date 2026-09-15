import { riverWaterAt } from './rivers';
import { world } from '@brumbrum/configuration';

export const railway = { radiusX: 1100, radiusZ: 900, station: { x: 0, z: -918 } };
export function railwayPoint(angle: number) {
  return {
    x: Math.cos(angle) * railway.radiusX,
    z: Math.sin(angle) * railway.radiusZ,
    y: 32 + 8 * Math.cos(angle),
  };
}
export function railwayDistance(x: number, z: number): number {
  const p = railwayPoint(Math.atan2(z / railway.radiusZ, x / railway.radiusX));
  return Math.hypot(x - p.x, z - p.z);
}
export function railwayTerrainHeight(x: number, z: number, height: number): number {
  const point = railwayPoint(Math.atan2(z / railway.radiusZ, x / railway.radiusX));
  const distance = Math.hypot(x - point.x, z - point.z);
  // Leave the channel open under railway trestles.
  if (riverWaterAt(x, z) !== undefined) return height;
  const station = Math.max(Math.abs(x) - 32, Math.abs(z + 923) - 20, 0);
  // Include every terrain-grid vertex that can contribute to a triangle under
  // the ballast. A narrow centre-line cut leaves diagonal triangles poking up.
  const corridor = 2.5 + (world.sectorSize / world.nearResolution) * Math.SQRT2;
  const edge = Math.min(distance - corridor, station);
  if (edge > 60) return height;
  const t = Math.max(0, Math.min(1, edge / 60));
  const blend = t * t * (3 - 2 * t);
  return (station < distance - corridor ? 32 : point.y) * (1 - blend) + height * blend;
}
export function railwayClearing(x: number, z: number): boolean {
  return railwayDistance(x, z) < 9 || (Math.abs(x) < 40 && Math.abs(z + 923) < 30);
}
