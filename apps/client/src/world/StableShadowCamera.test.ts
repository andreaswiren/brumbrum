import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { StableShadowCamera } from './StableShadowCamera';

describe('stable foliage shadow projection', () => {
  it('does not rescale when the visible camera zooms with speed', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const source = new FreeCamera('rider', new Vector3(3, 6, -10), scene);
    source.minZ = 0.1;
    source.maxZ = 1900;
    source.setTarget(new Vector3(2, 1, 10));
    const stable = new StableShadowCamera(source),
      projection = stable.getProjectionMatrix().clone();
    for (const fov of [0.95, 1.08, 1.3, 0.97]) {
      source.fov = fov;
      stable.sync(source);
      expect(stable.getProjectionMatrix().equalsWithEpsilon(projection, 1e-7)).toBe(true);
      expect(stable.getViewMatrix().equalsWithEpsilon(source.getViewMatrix(), 1e-5)).toBe(true);
    }
    expect(scene.activeCamera).toBe(source);
    scene.dispose();
    engine.dispose();
  });
  it('follows orbit and teleports without changing clip planes or view orientation', () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const source = new FreeCamera('rider', Vector3.Zero(), scene),
      stable = new StableShadowCamera(source);
    source.position.set(-850, 30, 630);
    source.setTarget(new Vector3(-830, 20, 625));
    stable.sync(source);
    expect(stable.getViewMatrix().equalsWithEpsilon(source.getViewMatrix(), 1e-3)).toBe(true);
    expect(stable.minZ).toBe(source.minZ);
    expect(stable.maxZ).toBe(source.maxZ);
    scene.dispose();
    engine.dispose();
  });
});
