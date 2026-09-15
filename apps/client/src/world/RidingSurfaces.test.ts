import { expect, it } from 'vitest';
import { timberStructures, timberSurfaceHeight } from '@brumbrum/world-format';
import { isSolidRidingSurface } from './RidingSurfaces';

it('distinguishes timber decks from banks beside and beneath them', () => {
  for (const structure of timberStructures) {
    const along = structure.kind === 'bridge' ? 0 : structure.length / 2;
    const y = timberSurfaceHeight(structure, along),
      z = structure.z + along;
    expect(isSolidRidingSurface(structure.x, y, z)).toBe(true);
    expect(isSolidRidingSurface(structure.x, y - 3, z)).toBe(false);
    expect(isSolidRidingSurface(structure.x + structure.width / 2 + 1, y, z)).toBe(false);
  }
});
