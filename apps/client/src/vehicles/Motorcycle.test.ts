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
  Quaternion,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { Motorcycle } from './Motorcycle';
import { TerrainWorld } from '../world/TerrainWorld';
import type { InputActions } from '../input/InputManager';
import { boundary, collisionHeight, lakes, terrainHeight, waterAt } from '@brumbrum/world-format';
const require = createRequire(import.meta.url);
const idle: InputActions = {
  throttle: 0,
  brake: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
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
    expect(vehicle.position.z).toBeGreaterThan(10);
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
    let lowestInverted = Infinity;
    for (let i = 0; i < 240; i++) {
      step(idle, 1);
      if (vehicle.visual.chassis.getDirection(Vector3.Up()).y < -0.3)
        lowestInverted = Math.min(
          lowestInverted,
          vehicle.position.y - collisionHeight(vehicle.position.x, vehicle.position.z),
        );
    }
    console.log('Inverted landing clearance', lowestInverted);
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
    // Babylon can retain one last substep at a floating-point frame boundary.
    expect(Math.abs(slow.z - fast.z)).toBeLessThan(Math.max(slow.speed, fast.speed) / 60 + 0.03);
    expect(Math.abs(slow.speed - fast.speed)).toBeLessThan(0.25);
  });
  it('leans the chassis and rider into a right turn', () => {
    vehicle.reset(true);
    step(idle, 120);
    step({ ...idle, throttle: 1, steer: 0.7 }, 100);
    const rightLean = Vector3.Dot(
      vehicle.visual.chassis.getDirection(Vector3.Up()),
      new Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw)),
    );
    expect(rightLean).toBeGreaterThan(0.1);
    expect(vehicle.visual.riderRig.parts.get('torso')!.mesh.position.x).toBeGreaterThan(0.035);
    expect(vehicle.crashed).toBe(false);
  });
  it('pulls a controlled wheelie with throttle and backward weight', () => {
    vehicle.reset(true);
    step(idle, 120);
    step({ ...idle, throttle: 1 }, 50);
    const entrySpeed = vehicle.speed;
    let pitch = 0,
      unsupported = 0;
    for (let i = 0; i < 70; i++) {
      step({ ...idle, throttle: 1, pitch: 1 }, 1);
      pitch = Math.max(pitch, vehicle.visual.chassis.getDirection(Vector3.Forward()).y);
      if (!vehicle.contacts[0]) unsupported++;
    }
    console.log('Wheelie peak / unsupported steps', pitch, unsupported);
    expect(unsupported).toBeLessThan(4);
    expect(pitch).toBeGreaterThan(0.25);
    expect(pitch).toBeLessThan(0.8);
    expect(vehicle.crashed).toBe(false);
    const wheelieSpeed = vehicle.speed;
    expect(wheelieSpeed).toBeGreaterThan(entrySpeed + 2);
    vehicle.reset(true);
    step(idle, 120);
    step({ ...idle, throttle: 1 }, 120);
    expect(vehicle.speed).toBeGreaterThan(wheelieSpeed);
  });
  it('leans deeply and carries a controlled slide in a hard motocross turn', () => {
    vehicle.reset(true);
    step(idle, 120);
    vehicle.aggregate.body.setLinearVelocity(new Vector3(0, 0, 22));
    let peakLean = 0,
      slip = 0,
      unsupported = 0;
    for (let i = 0; i < 100; i++) {
      step({ ...idle, throttle: 1, steer: 1 }, 1);
      const right = new Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw));
      peakLean = Math.max(
        peakLean,
        Vector3.Dot(vehicle.visual.chassis.getDirection(Vector3.Up()), right),
      );
      slip = Math.max(slip, Math.abs(Vector3.Dot(vehicle.velocity, right)));
      if (!vehicle.grounded) unsupported++;
    }
    expect(peakLean).toBeGreaterThan(0.6);
    expect(peakLean).toBeLessThan(0.9);
    expect(slip).toBeGreaterThan(1.5);
    expect(unsupported).toBeLessThan(10);
    expect(vehicle.crashed).toBe(false);
    expect(vehicle.speed).toBeGreaterThan(12);
  });
  it('creates a jointed ragdoll and removes all its bodies on reset', () => {
    vehicle.reset(true);
    step(idle, 120);
    vehicle.aggregate.body.setLinearVelocity(new Vector3(5, 3, 9));
    vehicle.crashed = true;
    step(idle, 1);
    const rig = vehicle.visual.riderRig;
    expect(rig.active).toBe(true);
    expect(rig.constraints).toHaveLength(10);
    expect([...rig.parts.values()].every((p) => p.aggregate && !p.mesh.parent)).toBe(true);
    const start = rig.position.clone();
    step(idle, 180);
    expect(Vector3.Distance(start, rig.position)).toBeGreaterThan(1);
    for (const part of rig.parts.values()) {
      expect(Number.isFinite(part.mesh.position.y)).toBe(true);
      expect(Vector3.Distance(part.mesh.position, rig.position)).toBeLessThan(3);
    }
    vehicle.reset(true);
    step(idle, 120);
    expect(rig.active).toBe(false);
    expect(rig.constraints).toHaveLength(0);
    expect([...rig.parts.values()].every((p) => !p.aggregate && p.mesh.parent === rig.root)).toBe(
      true,
    );
  });
  it('recovers a forced terrain penetration instead of falling through the map', () => {
    vehicle.reset(true);
    step(idle, 120);
    vehicle.position.y = collisionHeight(vehicle.position.x, vehicle.position.z) - 4;
    vehicle.aggregate.body.disablePreStep = false;
    vehicle.aggregate.body.setLinearVelocity(new Vector3(15, -65, 12));
    step(idle, 1);
    vehicle.aggregate.body.disablePreStep = true;
    expect(vehicle.position.y).toBeGreaterThan(
      collisionHeight(vehicle.position.x, vehicle.position.z),
    );
  });
  it('gets up, runs back and picks up the bike after a ragdoll crash', () => {
    vehicle.reset(true);
    step(idle, 120);
    vehicle.aggregate.body.setLinearVelocity(new Vector3(4, 1, 7));
    vehicle.crashed = true;
    const phases = new Set<string>();
    for (let i = 0; i < 1800; i++) {
      step(idle, 1);
      phases.add(vehicle.recoveryPhase);
      if (!vehicle.crashed) break;
    }
    expect(phases.has('standing')).toBe(true);
    expect(phases.has('running')).toBe(true);
    expect(phases.has('lifting')).toBe(true);
    expect(vehicle.crashed).toBe(false);
    expect(vehicle.visual.riderRig.active).toBe(false);
    step({ ...idle, throttle: 1 }, 120);
    expect(vehicle.speed).toBeGreaterThan(5);
  });
  it('recovers a slow nose-down landing without staying airborne on the floor', () => {
    vehicle.reset(true);
    step(idle, 120);
    vehicle.visual.chassis.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, 1.05, 0);
    vehicle.position.y += 0.5;
    vehicle.aggregate.body.disablePreStep = false;
    step(idle, 1);
    vehicle.aggregate.body.disablePreStep = true;
    step(idle, 300);
    expect(vehicle.crashed).toBe(false);
    expect(vehicle.visual.chassis.getDirection(Vector3.Up()).y).toBeGreaterThan(0.75);
    expect(vehicle.grounded).toBe(true);
  });
  it('launches an escaped rider high and toward the centre', () => {
    vehicle.travelTo(boundary.extent + 50, 0, Math.PI / 2);
    step(idle, 2);
    expect(vehicle.velocity.y).toBeGreaterThan(90);
    expect(vehicle.velocity.x).toBeLessThan(-100);
    const start = vehicle.position.y;
    step(idle, 180);
    expect(vehicle.position.y - start).toBeGreaterThan(200);
  });
  it('supports high-speed skimming and recovers a flooded bike to shore', () => {
    const lake = lakes[0];
    const place = (speed: number) => {
      vehicle.travelTo(lake.x, lake.z);
      vehicle.position.y = lake.level + 0.9;
      vehicle.aggregate.body.disablePreStep = false;
      vehicle.aggregate.body.setLinearVelocity(new Vector3(0, 0, speed));
      step({ ...idle, throttle: speed > 0 ? 1 : 0 }, 1);
      vehicle.aggregate.body.disablePreStep = true;
    };
    place(25);
    step({ ...idle, throttle: 1 }, 25);
    console.log(
      'Water',
      vehicle.position.asArray(),
      vehicle.velocity.asArray(),
      vehicle.skimming,
      vehicle.contacts,
      vehicle.visual.chassis.getDirection(Vector3.Up()).asArray(),
    );
    expect(vehicle.skimming).toBe(true);
    expect(vehicle.position.y).toBeGreaterThan(lake.level + 0.2);
    place(0);
    let flooded = false,
      underwaterTravel = 0;
    for (let i = 0; i < 180; i++) {
      const before = vehicle.position.clone();
      step({ ...idle, throttle: 1 }, 1);
      if (vehicle.submerged) {
        flooded = true;
        underwaterTravel += Math.hypot(
          vehicle.position.x - before.x,
          vehicle.position.z - before.z,
        );
      }
      if (
        flooded &&
        !vehicle.submerged &&
        waterAt(vehicle.position.x, vehicle.position.z) === undefined
      )
        break;
    }
    expect(vehicle.skimming).toBe(false);
    expect(flooded).toBe(true);
    expect(underwaterTravel).toBeLessThan(2);
    expect(waterAt(vehicle.position.x, vehicle.position.z)).toBeUndefined();
  });
  it('reaches the faster arcade speed range on level dirt', () => {
    const ground = MeshBuilder.CreateBox(
      'flat speed test',
      { width: 100, depth: 2200, height: 2 },
      scene,
    );
    ground.position.set(0, 299, 400);
    const collider = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
    vehicle.reset(true);
    vehicle.position.y = 301;
    vehicle.aggregate.body.disablePreStep = false;
    step(idle, 1);
    vehicle.aggregate.body.disablePreStep = true;
    let top = 0;
    for (let i = 0; i < 1200; i++) {
      step({ ...idle, throttle: 1 }, 1);
      top = Math.max(top, vehicle.speed * 3.6);
    }
    console.log('Level speed km/h', top);
    expect(top).toBeGreaterThan(175);
    expect(top).toBeLessThan(210);
    collider.dispose();
    ground.dispose();
    vehicle.reset(true);
  });
  it('can accelerate after traveling a large distance without teleport torque', () => {
    for (const [x, z] of [
      [-245, -12],
      [2690, 0],
      [0, 12],
    ]) {
      vehicle.travelTo(x, z);
      step({ ...idle, throttle: 1 }, 120);
      expect(vehicle.crashed).toBe(false);
      expect(vehicle.visual.chassis.getDirection(Vector3.Up()).y).toBeGreaterThan(0.4);
      expect(vehicle.speed).toBeGreaterThan(5);
      expect(vehicle.angularVelocity.length()).toBeLessThan(5);
    }
  });
  it('climbs the boundary ramp under throttle', () => {
    vehicle.travelTo(2690, 0, Math.PI / 2);
    step(idle, 90);
    const base = vehicle.position.y;
    let rise = 0;
    for (let i = 0; i < 1500; i++) {
      step({ ...idle, throttle: 1 }, 1);
      rise = Math.max(rise, vehicle.position.y - base);
      if (rise > 170) break;
    }
    console.log('Wall climb', rise, vehicle.position.asArray());
    expect(rise).toBeGreaterThan(150);
    expect(vehicle.crashed).toBe(false);
  });
  it('keeps forward speed through a hard upright landing', () => {
    vehicle.travelTo(0, 12);
    vehicle.position.y += 15;
    vehicle.aggregate.body.setLinearVelocity(new Vector3(0, -15, 24));
    let landed = false;
    for (let i = 0; i < 240; i++) {
      step({ ...idle, throttle: 1 }, 1);
      if (vehicle.lastAir > 0.25 && vehicle.grounded) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(vehicle.crashed).toBe(false);
    expect(vehicle.speed).toBeGreaterThan(19);
  });
  it('releases charged preload once and clears it on reset', () => {
    vehicle.reset(true);
    step(idle, 120);
    step({ ...idle, preload: true }, 50);
    expect(vehicle.preloadCharge).toBeGreaterThan(0.9);
    step(idle, 8);
    expect(vehicle.velocity.y).toBeGreaterThan(2);
    vehicle.reset(true);
    expect(vehicle.preloadCharge).toBe(0);
    step(idle, 120);
    expect(vehicle.grounded).toBe(true);
  });
  it('air steering tilts without changing the horizontal flight path', () => {
    vehicle.reset(true);
    vehicle.position.y += 35;
    vehicle.aggregate.body.setLinearVelocity(new Vector3(0, 0, 25));
    step({ ...idle, steer: 1 }, 70);
    expect(vehicle.grounded).toBe(false);
    expect(Math.abs(vehicle.velocity.x)).toBeLessThan(0.05);
    expect(Math.abs(vehicle.aggregate.body.getAngularVelocity().y)).toBeLessThan(0.05);
    expect(Math.abs(vehicle.visual.chassis.getDirection(Vector3.Up()).x)).toBeGreaterThan(0.2);
  });
  it('drives, steers and resets all three additional vehicles with real suspension', () => {
    for (const kind of ['atv', 'monster', 'snowmobile'] as const) {
      vehicle.dispose();
      vehicle = new Motorcycle(scene, kind);
      step(idle, 180);
      expect(vehicle.grounded, kind).toBe(true);
      expect(vehicle.contacts.length).toBe(kind === 'snowmobile' ? 2 : 4);
      step({ ...idle, throttle: 1, steer: 0.2 }, 180);
      console.log('Vehicle drive', kind, vehicle.speed, vehicle.position.asArray());
      expect(vehicle.speed, kind).toBeGreaterThan(5);
      expect(vehicle.crashed, kind).toBe(false);
      expect(vehicle.position.y).toBeGreaterThan(
        collisionHeight(vehicle.position.x, vehicle.position.z),
      );
      vehicle.reset(true);
      step(idle, 120);
      expect(vehicle.grounded, kind).toBe(true);
      step({ ...idle, preload: true }, 50);
      expect(vehicle.preloadCharge).toBe(kind === 'monster' ? 0 : 1);
      step(idle, 8);
      if (kind === 'monster') {
        expect(vehicle.grounded).toBe(true);
        expect(Math.abs(vehicle.velocity.y)).toBeLessThan(1);
      } else expect(vehicle.velocity.y).toBeGreaterThan(2);
    }
  });
});
