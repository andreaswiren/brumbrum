import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin, NullEngine, Quaternion, Scene, Vector3 } from '@babylonjs/core';
import { Motorcycle } from './Motorcycle';
import { TerrainWorld } from '../world/TerrainWorld';
import type { InputActions } from '../input/InputManager';
import { terrainHeight } from '@brumbrum/world-format';
const require = createRequire(import.meta.url);
const idle: InputActions = {
  throttle: 0,
  brake: 0,
  steer: 0,
  pitch: 0,
  preload: false,
  rearBrake: false,
};
describe('real Havok motorcycle simulation', () => {
  let engine: NullEngine, scene: Scene, vehicle: Motorcycle, world: TerrainWorld;
  beforeAll(async () => {
    const wasmBinary = await readFile(
      require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'),
    );
    const havok = await HavokPhysics({ wasmBinary: new Uint8Array(wasmBinary).buffer });
    engine = new NullEngine();
    scene = new Scene(engine);
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
    world = new TerrainWorld(scene);
    vehicle = new Motorcycle(scene);
  });
  afterAll(() => {
    scene?.dispose();
    engine?.dispose();
  });
  function step(input: InputActions, count: number): void {
    for (let i = 0; i < count; i++) {
      world.update(vehicle.position);
      vehicle.step(input);
      scene.getPhysicsEngine()!._step(1 / 60);
      scene.onAfterPhysicsObservable.notifyObservers(scene);
    }
  }
  it('settles on both springs without falling through terrain', () => {
    step(idle, 240);
    expect(vehicle.position.y).toBeGreaterThan(
      terrainHeight(vehicle.position.x, vehicle.position.z),
    );
    expect(vehicle.contacts).toEqual([true, true]);
    expect(vehicle.crashed).toBe(false);
  });
  it('accelerates, takes off from the natural jump and lands', () => {
    let air = false,
      landed = false,
      topSpeed = 0;
    for (let i = 0; i < 900; i++) {
      step({ ...idle, throttle: 1 }, 1);
      topSpeed = Math.max(topSpeed, vehicle.speed);
      if (vehicle.airtime > 0.3) air = true;
      if (air && vehicle.grounded) {
        landed = true;
        break;
      }
    }
    console.log('Jump telemetry', {
      topSpeed,
      air,
      landed,
      crashed: vehicle.crashed,
      position: vehicle.position.asArray(),
      bestAir: vehicle.bestAir,
    });
    expect(topSpeed).toBeGreaterThan(10);
    expect(air).toBe(true);
    expect(landed).toBe(true);
  });
  it('resets upright and brakes to a stop', () => {
    vehicle.reset(true);
    step(idle, 120);
    expect(vehicle.crashed).toBe(false);
    expect(vehicle.position.z).toBeLessThan(15);
    step({ ...idle, throttle: 1 }, 120);
    const moving = vehicle.speed;
    step({ ...idle, brake: 1 }, 180);
    expect(moving).toBeGreaterThan(5);
    expect(vehicle.speed).toBeLessThan(1);
  });
  it('steers and a physical upside-down landing crashes', () => {
    vehicle.reset(true);
    step(idle, 90);
    step({ ...idle, throttle: 1, steer: 0.7 }, 180);
    expect(Math.abs(vehicle.position.x)).toBeGreaterThan(2);
    vehicle.visual.chassis.position.y += 3;
    vehicle.visual.chassis.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, 0, Math.PI);
    vehicle.aggregate.body.disablePreStep = false;
    vehicle.aggregate.body.setLinearVelocity(new Vector3(0, -5, 0));
    vehicle.aggregate.body.setAngularVelocity(Vector3.Zero());
    step(idle, 1);
    vehicle.aggregate.body.disablePreStep = true;
    step(idle, 240);
    expect(vehicle.crashed).toBe(true);
    vehicle.reset(true);
    step(idle, 120);
    expect(vehicle.crashed).toBe(false);
  });
  it('keeps fixed-step handling consistent at 30 and 120 rendering FPS', () => {
    const simulation = scene.getPhysicsEngine()!;
    simulation.setSubTimeStep(1000 / 60);
    const run = (fps: number) => {
      vehicle.reset(true);
      step(idle, 120);
      const observer = scene.onBeforePhysicsObservable.add(() =>
        vehicle.step({ ...idle, throttle: 1 }),
      );
      for (let frame = 0; frame < fps * 3; frame++) scene._advancePhysicsEngineStep(1000 / fps);
      scene.onBeforePhysicsObservable.remove(observer);
      return { z: vehicle.position.z, speed: vehicle.speed };
    };
    const slow = run(30),
      fast = run(120);
    expect(Math.abs(slow.z - fast.z)).toBeLessThan(0.5);
    expect(Math.abs(slow.speed - fast.speed)).toBeLessThan(0.25);
  });
});
