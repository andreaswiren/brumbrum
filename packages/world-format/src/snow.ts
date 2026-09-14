/** Snow lies on the same streamed terrain and collision mesh as the forest. */
export const snowRegion = { x: 1350, z: 1300, radius: 650, name: 'FROST RIDGE' } as const;
export const snowSpawn = { x: 1350, z: 920, yaw: Math.PI / 2 } as const;

export function snowAmount(x: number, z: number): number {
  const distance = Math.hypot(x - snowRegion.x, z - snowRegion.z);
  const t = Math.max(0, Math.min(1, (snowRegion.radius - distance) / 160));
  return t * t * (3 - 2 * t);
}

/** Distance in metres to a broad, undulating closed ridgeline circuit. */
export function snowTrailDistance(x: number, z: number): number {
  const dx = x - snowRegion.x,
    dz = z - snowRegion.z;
  const angle = Math.atan2(dx, dz);
  const radius = 380 + 35 * Math.sin(angle * 3) + 24 * Math.sin(angle * 5);
  return Math.abs(Math.hypot(dx, dz) - radius);
}
