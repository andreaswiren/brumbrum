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
import { Motorcycle } from './Motorcycle';
import type { VehicleKind } from './VehicleModels';
import type { InputActions } from '../input/InputManager';

const idle: InputActions = {
  throttle: 0,
  brake: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  preload: false,
  rearBrake: false,
};
const require = createRequire(import.meta.url);

describe('grounded brake handling with Havok', () => {
  let havok: Awaited<ReturnType<typeof HavokPhysics>>;
  beforeAll(async () => {
    const bytes = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
    havok = await HavokPhysics({ wasmBinary: new Uint8Array(bytes).buffer });
  });
  const resources: (() => void)[] = [];
  afterAll(() => resources.forEach((dispose) => dispose()));

  function run(
    input: InputActions | ((frame: number) => InputActions),
    frames: number,
    slope = 0,
    kind: VehicleKind = 'bike',
    airborne = false,
    initialSpeed = 20,
  ) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
    const floor = MeshBuilder.CreateBox(
      'braking slope',
      { width: 160, depth: 240, height: 2 },
      scene,
    );
    floor.position.set(0, 299, 12);
    floor.rotation.x = -slope;
    new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0 }, scene);
    const bike = new Motorcycle(scene, kind);
    resources.push(() => {
      scene.dispose();
      engine.dispose();
    });
    bike.position.y = 301 + bike.tune.resetClearance;
    bike.aggregate.body.disablePreStep = false;
    const tick = (actions: InputActions) => {
      bike.step(actions);
      scene.getPhysicsEngine()!._step(1 / 60);
      scene.onAfterPhysicsObservable.notifyObservers(scene);
    };
    tick(idle);
    bike.aggregate.body.disablePreStep = true;
    for (let i = 0; i < 150; i++) tick(idle);
    expect(bike.grounded).toBe(true);
    if (airborne) {
      bike.position.y += 40;
      bike.aggregate.body.disablePreStep = false;
      tick(idle);
      bike.aggregate.body.disablePreStep = true;
    }
    const normal = new Vector3(0, Math.cos(slope), -Math.sin(slope));
    bike.aggregate.body.setLinearVelocity(
      new Vector3(0, initialSpeed * Math.sin(slope), initialSpeed * Math.cos(slope)),
    );
    bike.aggregate.body.setAngularVelocity(Vector3.Zero());
    const start = bike.position.clone();
    let heading = 0,
      previous = bike.yaw,
      grounded = 0,
      firstReverse = -1,
      firstStopped = -1,
      maximumReverseSpeed = 0;
    for (let i = 0; i < frames; i++) {
      tick(typeof input === 'function' ? input(i) : input);
      if (firstStopped < 0 && bike.speed < 0.65) firstStopped = i;
      if (firstReverse < 0 && bike.reversing) firstReverse = i;
      const signed = Vector3.Dot(
        bike.aggregate.body.getLinearVelocity(),
        bike.visual.chassis.getDirection(Vector3.Forward()),
      );
      maximumReverseSpeed = Math.max(maximumReverseSpeed, -signed);
      heading += Math.atan2(Math.sin(bike.yaw - previous), Math.cos(bike.yaw - previous));
      previous = bike.yaw;
      if (bike.grounded) grounded++;
    }
    const velocity = bike.aggregate.body.getLinearVelocity();
    const forward = bike.visual.chassis.getDirection(Vector3.Forward());
    const lateral = Math.abs(Vector3.Dot(velocity, Vector3.Cross(normal, forward).normalize()));
    const slipAngle = Math.atan2(lateral, Math.abs(Vector3.Dot(velocity, forward)));
    const result = {
      speed: velocity.length(),
      distance: Vector3.Distance(start, bike.position),
      heading,
      lateral,
      slipAngle,
      grounded,
      crashed: bike.crashed,
      reversing: bike.reversing,
      footPushing: bike.footPushing,
      signedSpeed: Vector3.Dot(velocity, forward),
      firstReverse,
      firstStopped,
      maximumReverseSpeed,
    };
    return result;
  }

  it('stops every vehicle with both accelerator and service brake held', () => {
    for (const kind of ['bike', 'atv', 'monster', 'snowmobile'] as const) {
      const result = run({ ...idle, throttle: 1, brake: 1 }, 90, 0, kind);
      expect(result.speed, kind).toBeLessThan(0.7);
      expect(result.distance, kind).toBeLessThan(12);
      expect(result.crashed, kind).toBe(false);
    }
  });

  it('brakes decisively uphill and downhill while the accelerator is still held', () => {
    for (const slope of [-0.28, 0.28]) {
      const result = run({ ...idle, throttle: 1, brake: 1 }, 90, slope);
      expect(result.speed).toBeLessThan(0.8);
      expect(result.distance).toBeLessThan(13);
      expect(result.grounded).toBeGreaterThan(80);
      expect(result.crashed).toBe(false);
    }
  });

  it('rotates and steps the rear out more when braking into a corner on flat ground and slopes', () => {
    for (const slope of [0, -0.25, 0.25]) {
      const coasting = run({ ...idle, steer: 0.8 }, 18, slope);
      for (const braking of [{ brake: 0.6 }, { rearBrake: true }]) {
        const sliding = run({ ...idle, steer: 0.8, ...braking }, 18, slope);
        expect(sliding.heading).toBeGreaterThan(coasting.heading * 1.35);
        expect(sliding.slipAngle).toBeGreaterThan(coasting.slipAngle * 1.2);
        expect(sliding.speed).toBeLessThan(coasting.speed - 2);
        expect(sliding.grounded).toBeGreaterThan(15);
        expect(sliding.crashed).toBe(false);
      }
    }
  });

  it('does not add braking yaw or change speed during an airborne turn', () => {
    const coasting = run({ ...idle, steer: 0.8 }, 18, 0, 'bike', true);
    const braking = run({ ...idle, steer: 0.8, brake: 1, rearBrake: true }, 18, 0, 'bike', true);
    expect(braking.grounded).toBe(0);
    expect(braking.heading).toBeCloseTo(coasting.heading, 4);
    expect(braking.speed).toBeCloseTo(coasting.speed, 4);
  });

  it('comes to a stop before a deliberate brake hold engages reverse', () => {
    const result = run({ ...idle, brake: 1 }, 180);
    expect(result.firstStopped).toBeGreaterThan(15);
    expect(result.firstReverse - result.firstStopped).toBeGreaterThanOrEqual(16);
    expect(result.reversing).toBe(true);
    expect(result.signedSpeed).toBeLessThan(-0.8);
    const brief = run({ ...idle, brake: 1 }, 12, 0, 'bike', false, 0);
    expect(brief.reversing).toBe(false);
    expect(brief.footPushing).toBe(0);
  });

  it('backs up each vehicle at its limited speed with the steering reversed', () => {
    for (const kind of ['bike', 'atv', 'monster', 'snowmobile'] as const) {
      const result = run({ ...idle, brake: 1, steer: 0.8 }, 240, 0, kind, false, 0);
      const cap = kind === 'bike' ? 1.1 : kind === 'snowmobile' ? 6.1 : 4.1;
      expect(result.reversing, kind).toBe(true);
      expect(result.signedSpeed, kind).toBeLessThan(kind === 'bike' ? -0.8 : -3);
      expect(result.maximumReverseSpeed, kind).toBeLessThan(cap);
      expect(result.heading, kind).toBeLessThan(-0.25);
      expect(result.footPushing, kind).toBe(kind === 'bike' ? 1 : 0);
      expect(result.crashed, kind).toBe(false);
    }
  });

  it('limits foot pushing on slopes and returns to forward drive with the accelerator', () => {
    for (const slope of [-0.28, 0.28]) {
      const result = run({ ...idle, brake: 1 }, 180, slope, 'bike', false, 0);
      expect(result.reversing).toBe(true);
      expect(result.maximumReverseSpeed).toBeLessThan(1.1);
    }
    const result = run(
      (frame) => (frame < 150 ? { ...idle, brake: 1 } : { ...idle, throttle: 1 }),
      240,
      0,
      'bike',
      false,
      0,
    );
    expect(result.reversing).toBe(false);
    expect(result.footPushing).toBe(0);
    expect(result.signedSpeed).toBeGreaterThan(5);
  });
});
