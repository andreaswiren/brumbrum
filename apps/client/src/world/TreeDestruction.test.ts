import { describe, expect, it } from 'vitest';
import { Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core';
import { TreeDestruction, treeBreakSpeed, type BreakableTree } from './TreeDestruction';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import {
  HavokPlugin,
  PhysicsAggregate,
  PhysicsRaycastResult,
  PhysicsShapeType,
} from '@babylonjs/core';
import { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const batch = MeshBuilder.CreateCylinder(
    'authored tree stand-in',
    { height: 10, diameter: 0.5 },
    scene,
  );
  batch.bakeTransformIntoVertices(Matrix.Translation(0, 5, 0));
  batch.thinInstanceSetBuffer('matrix', new Float32Array(Matrix.Identity().asArray()), 16);
  let removed = 0;
  const definition: BreakableTree = {
    id: 'tree-1',
    position: Vector3.Zero(),
    height: 10,
    diameter: 0.65,
    removeCollider: () => {
      removed++;
    },
  };
  const destruction = new TreeDestruction(
    scene,
    () => {},
    () => 0,
  );
  destruction.register('sector', [definition], [batch]);
  return {
    engine,
    scene,
    batch,
    definition,
    destruction,
    removed: () => removed,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

describe('vehicle tree impacts', () => {
  it('removes the real Havok trunk collider as soon as the impact qualifies', async () => {
    const require = createRequire(import.meta.url);
    const bytes = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
    const havok = await HavokPhysics({ wasmBinary: new Uint8Array(bytes).buffer });
    const f = fixture();
    try {
      f.scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
      const trunk = MeshBuilder.CreateCylinder(
        'real tree collider',
        { height: 6.5, diameter: 0.65 },
        f.scene,
      );
      trunk.position.y = 3.25;
      const aggregate = new PhysicsAggregate(
        trunk,
        PhysicsShapeType.CYLINDER,
        { mass: 0 },
        f.scene,
      );
      f.destruction.unregister('sector');
      f.destruction.register(
        'sector',
        [
          {
            ...f.definition,
            removeCollider: () => {
              aggregate.dispose();
              trunk.dispose();
            },
          },
        ],
        [f.batch],
      );
      const physics = f.scene.getPhysicsEngine() as PhysicsEngine,
        ray = new PhysicsRaycastResult();
      physics.raycastToRef(new Vector3(0, 1, -3), new Vector3(0, 1, 3), ray);
      expect(ray.hasHit).toBe(true);
      f.destruction.interact(new Vector3(0, 1, -2), new Vector3(0, 0, 12), 'monster', 1 / 120);
      ray.reset();
      physics.raycastToRef(new Vector3(0, 1, -3), new Vector3(0, 1, 3), ray);
      expect(ray.hasHit).toBe(false);
      expect(trunk.isDisposed()).toBe(true);
      expect(f.batch.isDisposed()).toBe(false);
    } finally {
      f.dispose();
    }
  });
  it('lets the monster truck break a substantial tree that stops a slower motorcycle', () => {
    const f = fixture();
    try {
      const position = new Vector3(0, 0.8, -2),
        velocity = new Vector3(0, 12, 12);
      expect(f.destruction.interact(position, velocity, 'bike', 1 / 120)).toBe(0);
      expect(f.destruction.interact(position, velocity, 'monster', 1 / 120)).toBe(1);
      expect(f.removed()).toBe(1);
      expect(f.destruction.interact(position, velocity, 'monster', 1 / 120)).toBe(0);
      expect(f.removed()).toBe(1);
      expect(treeBreakSpeed('monster', 1.1)).toBeLessThan(10);
      expect(treeBreakSpeed('bike', 1.1)).toBeGreaterThan(30);
    } finally {
      f.dispose();
    }
  });
  it('detects a fast swept impact and animates the visible tree into a resting fall', () => {
    const f = fixture();
    try {
      expect(
        f.destruction.interact(new Vector3(0, 1, -8), new Vector3(0, 0, 600), 'bike', 1 / 60),
      ).toBe(1);
      const first = f.batch.thinInstanceGetWorldMatrices()[0].clone();
      expect(Vector3.TransformNormal(Vector3.Up(), first).y).toBeGreaterThan(0.95);
      for (let i = 0; i < 300; i++)
        f.destruction.interact(new Vector3(30, 1, 30), Vector3.Zero(), 'bike', 1 / 120);
      const fallen = f.batch.thinInstanceGetWorldMatrices()[0];
      expect(Vector3.TransformNormal(Vector3.Up(), fallen).y).toBeLessThan(0.15);
      expect(f.batch.isEnabled()).toBe(true);
      expect(f.batch.thinInstanceCount).toBe(1);
      expect(f.scene.meshes.some((mesh) => mesh.name === 'splintered standing tree stump')).toBe(
        true,
      );
      f.destruction.unregister('sector');
      f.batch.thinInstanceSetBuffer('matrix', new Float32Array(Matrix.Identity().asArray()), 16);
      f.destruction.register('sector', [f.definition], [f.batch]);
      expect(
        Vector3.TransformNormal(Vector3.Up(), f.batch.thinInstanceGetWorldMatrices()[0]).y,
      ).toBeLessThan(0.15);
      expect(f.destruction.brokenCount).toBe(1);
    } finally {
      f.dispose();
    }
  });
  it('preserves trees during gentle touches and jumps above the trunk', () => {
    const f = fixture();
    try {
      expect(
        f.destruction.interact(new Vector3(0, 1, -1), new Vector3(0, 0, 2), 'monster', 1 / 60),
      ).toBe(0);
      expect(
        f.destruction.interact(new Vector3(0, 20, -1), new Vector3(0, 0, 35), 'monster', 1 / 60),
      ).toBe(0);
      expect(f.removed()).toBe(0);
    } finally {
      f.dispose();
    }
  });
});
