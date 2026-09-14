import { describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { rivers, riverCenterZ, riverHalfWidthAt, riverLevelAt } from '@brumbrum/world-format';
import { Rivers } from './Rivers';

describe('river water rendering', () => {
  it('animates interior water while keeping its banks attached and streaming nearby sections', () => {
    const engine = new NullEngine();
    const canvas = vi
      .spyOn(engine, 'createCanvas')
      .mockImplementation(
        () =>
          ({
            width: 64,
            height: 64,
            getContext: () => ({ fillRect() {} }),
          }) as unknown as ReturnType<NullEngine['createCanvas']>,
      );
    const scene = new Scene(engine);
    try {
      const water = new Rivers(scene);
      const section = scene.getMeshByName('South Creek section 11')!;
      const before = Array.from(section.getVerticesData(VertexBuffer.PositionKind)!);
      water.update(0.25, new Vector3(0, 8, -300));
      expect(section.isEnabled()).toBe(true);
      expect(scene.getMeshByName('North River section 11')!.isEnabled()).toBe(false);
      const after = section.getVerticesData(VertexBuffer.PositionKind)!;
      let moving = 0;
      for (let i = 0; i < after.length; i += 3) {
        const x = after[i],
          z = after[i + 2],
          column = (i / 3) % 9;
        expect(Math.abs(z - riverCenterZ(rivers[0], x))).toBeLessThanOrEqual(
          riverHalfWidthAt(rivers[0], x) + 0.0001,
        );
        if (column === 0 || column === 8)
          expect(after[i + 1]).toBeCloseTo(riverLevelAt(rivers[0], x), 6);
        else if (Math.abs(after[i + 1] - before[i + 1]) > 0.001) moving++;
      }
      expect(moving).toBeGreaterThan(100);
      water.setAppearance(1.4, 0);
      water.update(0.5, new Vector3(0, 8, -300));
      const calm = section.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < calm.length; i += 3)
        expect(calm[i + 1]).toBeCloseTo(riverLevelAt(rivers[0], calm[i]), 6);
    } finally {
      scene.dispose();
      engine.dispose();
      canvas.mockRestore();
    }
  });
});
