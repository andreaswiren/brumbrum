import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import {
  HavokPlugin,
  MeshBuilder,
  NullEngine,
  PhysicsAggregate,
  PhysicsRaycastResult,
  PhysicsShapeType,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { TimberStructures } from './TimberStructures';
import {
  timberStructures,
  timberSurfaceHeight,
  timberSurfaceRange,
  timberTerrainHeight,
  isTimberFootprint,
} from '../../../../packages/world-format/src/timber';
const require = createRequire(import.meta.url);

describe('rideable timber structures', () => {
  let scene: Scene, engine: NullEngine, structures: TimberStructures;
  beforeAll(async () => {
    const wasm = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
    const havok = await HavokPhysics({ wasmBinary: new Uint8Array(wasm).buffer });
    engine = new NullEngine();
    scene = new Scene(engine);
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
    structures = new TimberStructures(scene);
    scene.getPhysicsEngine()!._step(1 / 60);
  });
  afterAll(() => {
    structures?.dispose();
    scene?.dispose();
    engine?.dispose();
  });

  it('has continuous upward-facing Havok support across ramps, decks and approach joins', () => {
    for (const definition of timberStructures) {
      const [start, end] = timberSurfaceRange(definition);
      for (let along = start + 0.1; along < end; along += 0.73) {
        const height = timberSurfaceHeight(definition, along),
          ray = new PhysicsRaycastResult();
        (scene.getPhysicsEngine()! as PhysicsEngine).raycastToRef(
          new Vector3(definition.x, height + 3, definition.z + along),
          new Vector3(definition.x, height - 1, definition.z + along),
          ray,
        );
        expect(ray.hasHit).toBe(true);
        expect(ray.hitPointWorld.y).toBeCloseTo(height, 2);
        expect(ray.hitNormalWorld.y).toBeGreaterThan(0.8);
      }
    }
  });

  it('supports a falling wheel above the water without sinking through the deck', () => {
    const bridge = timberStructures[0];
    const height = timberSurfaceHeight(bridge, 0);
    const wheel = MeshBuilder.CreateSphere('test wheel', { diameter: 0.72 }, scene);
    wheel.position.set(bridge.x, height + 3, bridge.z);
    const body = new PhysicsAggregate(
      wheel,
      PhysicsShapeType.SPHERE,
      { mass: 65, restitution: 0, friction: 0.8 },
      scene,
    );
    for (let step = 0; step < 180; step++) scene.getPhysicsEngine()!._step(1 / 60);
    expect(wheel.position.y).toBeGreaterThan(height + 0.3);
    expect(wheel.position.y).toBeLessThan(height + 0.4);
    body.dispose();
    wheel.dispose();
  });

  it('grades cleared approaches without filling the channel below a bridge', () => {
    const bridge = timberStructures[0],
      ramp = timberStructures[2];
    expect(timberTerrainHeight(bridge.x, bridge.z, 2)).toBe(2);
    const [start] = timberSurfaceRange(bridge);
    expect(timberTerrainHeight(bridge.x, bridge.z + start, 40)).toBeCloseTo(
      timberSurfaceHeight(bridge, start) - 0.025,
    );
    expect(isTimberFootprint(ramp.x, ramp.z - 10, 2)).toBe(true);
    expect(timberTerrainHeight(0, 0, 19)).toBe(19);
  });
});
