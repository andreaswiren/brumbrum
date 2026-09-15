import {
  railway,
  railwayPoint,
  railwayDistance,
  timberStructures,
  timberSurfaceRange,
  timberSurfaceHeight,
} from '@brumbrum/world-format';

/** Height-aware classification: riding below a bridge is still loose ground. */
export function isSolidRidingSurface(x: number, tyreY: number, z: number): boolean {
  if (railwayDistance(x, z) <= 2.4) {
    const point = railwayPoint(Math.atan2(z / railway.radiusZ, x / railway.radiusX));
    if (Math.abs(tyreY - (point.y + 0.22)) < 0.65) return true;
  }
  if (Math.abs(x) <= 24 && Math.abs(z + 909) <= 4.5 && Math.abs(tyreY - 32.7) < 0.65) return true;
  for (const structure of timberStructures) {
    const along = z - structure.z,
      [start, end] = timberSurfaceRange(structure);
    if (
      Math.abs(x - structure.x) <= structure.width / 2 &&
      along >= start &&
      along <= end &&
      Math.abs(tyreY - timberSurfaceHeight(structure, along)) < 0.65
    )
      return true;
  }
  return false;
}
