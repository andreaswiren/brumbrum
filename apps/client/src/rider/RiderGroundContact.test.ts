import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import {
  HavokPlugin,
  MeshBuilder,
  NullEngine,
  PhysicsAggregate,
  PhysicsShapeType,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { TimberStructures } from '../world/TimberStructures';
import {
  timberStructures,
  timberSurfaceHeight,
} from '../../../../packages/world-format/src/timber';
import { riderGroundHeight } from './RiderGroundContact';
import { RiderRig } from './RiderRig';
import { riderAnatomy as anatomy } from './RiderAnatomy';
import { collisionHeight } from '@brumbrum/world-format';

describe('rider foot contact with elevated scenery', () => {
  let engine: NullEngine, scene: Scene;
  beforeAll(async () => {
    const require = createRequire(import.meta.url);
    const wasm = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
    const havok = await HavokPhysics({ wasmBinary: new Uint8Array(wasm).buffer });
    engine = new NullEngine();
    scene = new Scene(engine);
    scene.enablePhysics(Vector3.Zero(), new HavokPlugin(true, havok));
    new TimberStructures(scene);
    scene.getPhysicsEngine()!._step(1 / 60);
  });
  afterAll(() => {
    scene?.dispose();
    engine?.dispose();
  });

  it('keeps idle and rollback boots on the bridge deck above the riverbed', () => {
    const bridge = timberStructures[0],
      deck = timberSurfaceHeight(bridge, 0);
    const chassis = MeshBuilder.CreateBox('rider chassis', {}, scene);
    chassis.position.set(bridge.x, deck + 0.5, bridge.z);
    const rig = new RiderRig(scene, chassis);
    expect(collisionHeight(bridge.x, bridge.z)).toBeLessThan(deck - 1);
    expect(riderGroundHeight(scene, chassis.position)).toBeCloseTo(deck, 3);
    for (const pushing of [0, 1]) {
      for (let i = 0; i < 180; i++)
        rig.pose(0, pushing ? -1 : 0, 0, 0, 0, 1 / 60, 0, 0, true, pushing);
      for (let i = 0; i < 120; i++) {
        rig.pose(0, pushing ? -1 : 0, 0, 0, 0, 1 / 60, 0, 0, true, pushing);
        const shin = rig.parts.get('shin-1')!;
        const ankle = Vector3.TransformCoordinates(
          new Vector3(0, -shin.height / 2, 0),
          shin.mesh.computeWorldMatrix(true),
        );
        const pitch = shin.mesh.metadata.footPlantPitch;
        const toe =
          ankle.y - anatomy.ankleToSole * Math.cos(pitch) - anatomy.ankleToToe * Math.sin(pitch);
        expect(toe).toBeGreaterThanOrEqual(deck - 0.002);
        expect(toe).toBeLessThan(deck + 0.115);
      }
    }
    // A rider passing below the deck must not plant on an overhead bridge.
    const below = new Vector3(bridge.x, deck - 1, bridge.z);
    expect(riderGroundHeight(scene, below)).toBeLessThan(deck - 0.5);
    rig.dispose();
    chassis.dispose();
  });

  it('uses a raised station platform and ignores the bike above it', () => {
    const platform = MeshBuilder.CreateBox(
      'station platform',
      { width: 48, height: 0.7, depth: 9 },
      scene,
    );
    platform.position.set(0, 32.35, -909);
    const ground = new PhysicsAggregate(platform, PhysicsShapeType.BOX, { mass: 0 }, scene);
    const bike = MeshBuilder.CreateBox('dynamic bike', { size: 0.15 }, scene);
    bike.position.set(0, 32.95, -909);
    const body = new PhysicsAggregate(bike, PhysicsShapeType.BOX, { mass: 100 }, scene);
    scene.getPhysicsEngine()!._step(1 / 60);
    expect(riderGroundHeight(scene, new Vector3(0, 33.2, -909))).toBeCloseTo(32.7, 3);
    body.dispose();
    ground.dispose();
    bike.dispose();
    platform.dispose();
  });
});
