import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MeshBuilder,
  NullEngine,
  ParticleSystem,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { SurfaceEffects } from './SurfaceEffects';
import type { Motorcycle } from '../vehicles/Motorcycle';

vi.mock('@brumbrum/world-format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@brumbrum/world-format')>()),
  collisionHeight: (x: number, z: number) => x * 0.4 - z * 0.3,
  waterAt: () => undefined,
}));

afterEach(() => vi.restoreAllMocks());

function fixture(kind: Motorcycle['kind']) {
  const engine = new NullEngine();
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
  };
  vi.spyOn(engine, 'createCanvas').mockImplementation(
    () =>
      ({
        width: 64,
        height: 64,
        getContext: () => context,
      }) as unknown as ReturnType<NullEngine['createCanvas']>,
  );
  const scene = new Scene(engine);
  const chassis = MeshBuilder.CreateBox('chassis', {}, scene);
  const wheels = Array.from({ length: kind === 'atv' || kind === 'monster' ? 4 : 2 }, (_, i) => {
    const wheel = new TransformNode(`wheel ${i}`, scene);
    wheel.parent = chassis;
    wheel.position.set(0, 0, i === 0 ? -0.8 : 0.8);
    return wheel;
  });
  const vehicle = {
    kind,
    visual: { chassis, wheels },
    tune: { wheelRadius: kind === 'monster' ? 1 : 0.36 },
    position: chassis.position,
    velocity: new Vector3(0, 0, 14),
    speed: 14,
    yaw: 0,
    surface: 'dirt',
    slideIntensity: 0,
    skimming: false,
    submerged: false,
    crashed: false,
    contacts: wheels.map(() => true),
    resetId: 0,
  } as unknown as Motorcycle;
  const effects = new SurfaceEffects(scene);
  const dust = scene.getParticleSystemById('wheel 0 surface spray') as ParticleSystem;
  const soil = scene.getParticleSystemById('wheel 0 thrown soil') as ParticleSystem;
  return { engine, scene, vehicle, effects, dust, soil };
}

describe('visible tyre spray', () => {
  it('suppresses railway dust per wheel while tyres on adjacent dirt keep spraying', () => {
    const { engine, scene, vehicle, effects, dust, soil } = fixture('atv');
    try {
      vehicle.visual.chassis.position.set(1100, 40 + 0.22 + vehicle.tune.wheelRadius, 0);
      vehicle.visual.wheels[0].position.set(0, 0, 0);
      vehicle.visual.wheels[1].position.set(5, 0, 0);
      effects.update(vehicle, 1);
      expect(dust.emitRate).toBe(0);
      expect(soil.emitRate).toBe(0);
      expect(
        (scene.getParticleSystemById('wheel 1 surface spray') as ParticleSystem).emitRate,
      ).toBeGreaterThan(0);
      // Terrain below an elevated track can still throw dirt.
      vehicle.visual.chassis.position.y -= 4;
      effects.update(vehicle, 1);
      expect(dust.emitRate).toBeGreaterThan(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it.each(['bike', 'atv', 'monster', 'snowmobile'] as const)(
    'throws real dust and soil during ordinary %s driving',
    (kind) => {
      const { engine, scene, vehicle, effects, dust, soil } = fixture(kind);
      try {
        effects.update(vehicle, 1);
        expect(dust.emitRate).toBeGreaterThan(120);
        expect(soil.emitRate).toBeGreaterThan(35);
        for (let frame = 0; frame < 60; frame++) {
          dust.animate(true);
          soil.animate(true);
        }
        expect(dust.getActiveCount()).toBeGreaterThan(70);
        expect(soil.getActiveCount()).toBeGreaterThan(8);
        const normal = new Vector3(-0.4, 1, 0.3).normalize();
        expect(Vector3.Dot(dust.direction1, normal)).toBeGreaterThan(1);
        expect(Vector3.Dot(dust.direction2, normal)).toBeGreaterThan(2);
        expect(dust.direction1.z).toBeLessThan(0);
        const ordinary = dust.emitRate;
        vehicle.slideIntensity = 1;
        effects.update(vehicle, 1);
        expect(dust.emitRate).toBeGreaterThan(ordinary * 1.7);
        expect(soil.emitRate).toBeGreaterThan(150);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );
  it('refreshes interpolated wheel locations and stops new dirt when contact ends', () => {
    const { engine, scene, vehicle, effects, dust, soil } = fixture('bike');
    try {
      vehicle.visual.chassis.computeWorldMatrix(true);
      vehicle.visual.wheels[0].computeWorldMatrix(true);
      vehicle.visual.chassis.position.x = 5;
      effects.update(vehicle, 0);
      expect((dust.emitter as Vector3).x).toBeCloseTo(5);
      expect((dust.emitter as Vector3).y).toBeGreaterThan(2.3);
      expect(soil.emitRate).toBeGreaterThan(0);
      vehicle.contacts[0] = false;
      effects.update(vehicle, 1);
      expect(dust.emitRate).toBe(0);
      expect(soil.emitRate).toBe(0);
      vehicle.contacts[0] = true;
      vehicle.surface = 'asphalt';
      effects.update(vehicle, 1);
      expect(dust.emitRate).toBe(0);
      expect(soil.emitRate).toBe(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
